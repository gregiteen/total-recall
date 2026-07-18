/**
 * src/core/throttled-fetch.mjs
 *
 * Centralized Fetch Gate — every outbound HTTP request in Total Recall
 * MUST go through this module. Provides:
 *
 *   1. Global concurrency cap (default 6 simultaneous connections)
 *   2. Per-domain concurrency limits (default 3 per domain)
 *   3. Per-domain minimum interval enforcement (rate limiting)
 *   4. Request queuing with backpressure
 *   5. Abort timeout integration
 *   6. Observability (in-flight, queued, completed, rejected, blocked counts)
 *
 * Usage:
 *   import { throttledFetch, getGateStats } from './throttled-fetch.mjs';
 *   const res = await throttledFetch(url, options, timeoutMs);
 *
 * This replaces all raw fetch() calls across the codebase.
 */

import { logger } from './logger.mjs';
import { brainDir } from './config.mjs';

// ─── Configuration (mutable — can be overridden by network-policy.md doc) ──

const DEFAULT_MAX_GLOBAL_CONCURRENCY = 6;   // total simultaneous outbound connections
const DEFAULT_MAX_PER_DOMAIN = 3;           // max concurrent per unique hostname
const DEFAULT_TIMEOUT_MS = 15000;           // per-request timeout
const QUEUE_WARN_THRESHOLD = 20;            // log warning if queue exceeds this

let maxGlobalConcurrency = DEFAULT_MAX_GLOBAL_CONCURRENCY;
let maxPerDomain = DEFAULT_MAX_PER_DOMAIN;
let defaultTimeoutMs = DEFAULT_TIMEOUT_MS;
let whitelistModeOverride = null; // null = infer from allowedDomains.size, true/false = explicit

// ─── State ──────────────────────────────────────────────────────────────────

/** Bumped by resetGateStateForTests so in-flight work from a prior generation
 *  cannot corrupt counters/queue after a test reset. */
let gateGeneration = 0;

let globalInFlight = 0;
const domainInFlight = new Map();    // hostname → count
const waitQueue = [];                // { resolve, reject, url, options, timeoutMs, domain, enqueued }
let drainRetryTimer = null;

// Rate limiting (minIntervalMs) state
const domainMinInterval = new Map(); // hostname → minIntervalMs
const domainLastStart = new Map();   // hostname → timestamp of last dispatch start

// Stats for observability
const stats = {
  total_dispatched: 0,
  total_completed: 0,
  total_errors: 0,
  total_timeouts: 0,
  total_queued: 0,
  total_blocked: 0,
  peak_in_flight: 0,
  peak_queue_depth: 0,
};

// ─── Domain Extraction ──────────────────────────────────────────────────────

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

// ─── Firewall & Audit Log ───────────────────────────────────────────────────

let blockedDomains = new Set();
let allowedDomains = new Set(); // If empty, act as blacklist mode. If populated, act as whitelist mode.
let domainLimits = new Map();

const MAX_AUDIT_LOGS = 200;
const auditLog = []; // Circular buffer: { timestamp, domain, url, status, duration_ms, queue_wait_ms, rate_wait_ms }

let policyWatcher = null;
let parentWatcher = null;

export async function loadFirewallPolicy(brainDir) {
  try {
    // We dynamically require to avoid circular deps if needed, but fs/path are available.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const yaml = await import('yaml');

    const systemDir = path.join(brainDir, 'memory-vault', 'system');
    const policyPath = path.join(systemDir, 'network-policy.md');

    const applyPolicy = () => {
      try {
        if (!fs.existsSync(policyPath)) return;
        const content = fs.readFileSync(policyPath, 'utf8');
        const match = content.match(/^---\n([\s\S]+?)\n---/);
        if (match) {
          const fm = yaml.parse(match[1]);
          if (fm.type === 'network_policy' && fm.status === 'active') {
            blockedDomains = new Set(fm.blocked_domains || []);
            allowedDomains = new Set(fm.allowed_domains || []);
            const limits = fm.domain_limits || {};
            domainLimits.clear();
            domainMinInterval.clear();
            for (const [d, cfg] of Object.entries(limits)) {
              if (cfg && typeof cfg.maxConcurrency === 'number') domainLimits.set(d, cfg.maxConcurrency);
              if (cfg && typeof cfg.minIntervalMs === 'number') domainMinInterval.set(d, cfg.minIntervalMs);
            }

            // Global knobs from doc — fall back to defaults when absent/invalid.
            maxGlobalConcurrency = Number.isFinite(fm.max_global_concurrency) && fm.max_global_concurrency > 0
              ? fm.max_global_concurrency
              : DEFAULT_MAX_GLOBAL_CONCURRENCY;
            maxPerDomain = Number.isFinite(fm.max_per_domain_concurrency) && fm.max_per_domain_concurrency > 0
              ? fm.max_per_domain_concurrency
              : DEFAULT_MAX_PER_DOMAIN;
            defaultTimeoutMs = Number.isFinite(fm.default_timeout_ms) && fm.default_timeout_ms > 0
              ? fm.default_timeout_ms
              : DEFAULT_TIMEOUT_MS;
            whitelistModeOverride = typeof fm.whitelist_mode === 'boolean' ? fm.whitelist_mode : null;

            logger.info('throttled-fetch', `Loaded network policy: ${blockedDomains.size} blocked, ${allowedDomains.size} allowed, ${domainLimits.size} limits, ${domainMinInterval.size} rate limits.`);

            // Any capacity/interval change may unblock queued requests.
            drainQueue();
          }
        }
      } catch (e) {
        logger.error('throttled-fetch', `Failed parsing policy: ${e.message}`);
      }
    };

    applyPolicy();

    // Watch the file directly if it exists.
    if (!policyWatcher && fs.existsSync(policyPath)) {
      policyWatcher = fs.watch(policyPath, (eventType) => {
        if (eventType === 'change') applyPolicy();
      });
    }

    // Also watch the parent directory so we pick up the policy file being
    // created after boot (e.g. first-run setups where the doc doesn't exist
    // yet). Attach the direct file watcher once it appears.
    if (!parentWatcher && fs.existsSync(systemDir)) {
      parentWatcher = fs.watch(systemDir, (eventType, filename) => {
        if (filename !== 'network-policy.md') return;
        applyPolicy();
        if (!policyWatcher && fs.existsSync(policyPath)) {
          policyWatcher = fs.watch(policyPath, (evt) => {
            if (evt === 'change') applyPolicy();
          });
        }
      });
    }
  } catch (err) {
    logger.error('throttled-fetch', `Failed to load network policy: ${err.message}`);
  }
}

export async function blockDomain(domain) {
  const crypto = await import('node:crypto');
  const { processViaPackageKernel } = await import('./ssss-kernel-bridge.mjs');
  const { brainDir } = await import('./config.mjs');
  const path = await import('node:path');
  
  const vaultRoot = path.join(brainDir, 'memory-vault');
  const envelope = {
    type: 'patch',
    idempotency_key: crypto.randomUUID(),
    path: 'system/network-policy.md',
    workspace_id: 'default',
    actor: { role: 'system' },
    patches: { blocked_domains: Array.from(new Set([...blockedDomains, domain])) }
  };
  
  return processViaPackageKernel(envelope, vaultRoot, { agentRole: 'system' });
}

export async function unblockDomain(domain) {
  const crypto = await import('node:crypto');
  const { processViaPackageKernel } = await import('./ssss-kernel-bridge.mjs');
  const { brainDir } = await import('./config.mjs');
  const path = await import('node:path');
  
  const vaultRoot = path.join(brainDir, 'memory-vault');
  const newBlocked = Array.from(blockedDomains).filter(d => d !== domain);
  const envelope = {
    type: 'patch',
    idempotency_key: crypto.randomUUID(),
    path: 'system/network-policy.md',
    workspace_id: 'default',
    actor: { role: 'system' },
    patches: { blocked_domains: newBlocked }
  };
  
  return processViaPackageKernel(envelope, vaultRoot, { agentRole: 'system' });
}

function isWhitelistMode() {
  return whitelistModeOverride === null ? allowedDomains.size > 0 : whitelistModeOverride;
}

function checkFirewall(domain) {
  if (blockedDomains.has(domain)) {
    return { ok: false, reason: 'Domain blocked by firewall policy' };
  }
  if (isWhitelistMode() && !allowedDomains.has(domain)) {
    return { ok: false, reason: 'Domain not in firewall allowed list' };
  }
  return { ok: true };
}

export function getAuditLog(filterFn) {
  if (filterFn) return auditLog.filter(filterFn);
  return [...auditLog];
}

function appendAuditLog(entry) {
  auditLog.push(entry);
  if (auditLog.length > MAX_AUDIT_LOGS) {
    auditLog.shift();
  }
}

async function emitPolicyEvent(eventContent) {
  import('./ssss-kernel-bridge.mjs').then(async ({ processViaPackageKernel }) => {
    const crypto = await import('node:crypto');
    const { brainDir } = await import('./config.mjs');
    const path = await import('node:path');
    const vaultRoot = path.join(brainDir, 'memory-vault');
    const envelope = {
      type: 'event',
      idempotency_key: crypto.randomUUID(),
      path: 'system/network-policy.md',
      workspace_id: 'default',
      actor: { role: 'system' },
      content: JSON.stringify(eventContent)
    };
    await processViaPackageKernel(envelope, vaultRoot, { agentRole: 'system' }).catch(() => {});
  }).catch(() => {});
}

// ─── Rate Limiting (minIntervalMs) ──────────────────────────────────────────

/** Returns ms remaining before `domain` may dispatch again, or 0 if clear now. */
function minIntervalRemaining(domain) {
  const interval = domainMinInterval.get(domain);
  if (!interval) return 0;
  const last = domainLastStart.get(domain);
  if (last === undefined) return 0;
  const elapsed = Date.now() - last;
  return elapsed >= interval ? 0 : interval - elapsed;
}

// ─── Gate Logic ─────────────────────────────────────────────────────────────

function canDispatch(domain) {
  if (globalInFlight >= maxGlobalConcurrency) return false;
  const maxForDomain = domainLimits.has(domain) ? domainLimits.get(domain) : maxPerDomain;
  const domainCount = domainInFlight.get(domain) || 0;
  if (domainCount >= maxForDomain) return false;
  if (minIntervalRemaining(domain) > 0) return false;
  return true;
}

function acquireSlot(domain) {
  globalInFlight++;
  domainInFlight.set(domain, (domainInFlight.get(domain) || 0) + 1);
  domainLastStart.set(domain, Date.now());
  if (globalInFlight > stats.peak_in_flight) {
    stats.peak_in_flight = globalInFlight;
  }
}

function releaseSlot(domain) {
  globalInFlight = Math.max(0, globalInFlight - 1);
  const count = domainInFlight.get(domain) || 1;
  if (count <= 1) {
    domainInFlight.delete(domain);
  } else {
    domainInFlight.set(domain, count - 1);
  }
  // Drain queue
  drainQueue();
}

function scheduleDrainRetry() {
  if (drainRetryTimer || waitQueue.length === 0) return;
  // Find the soonest moment any queued domain could become dispatchable due
  // to its minIntervalMs constraint (concurrency-blocked entries are woken by
  // releaseSlot(), not by this timer).
  let soonest = Infinity;
  for (const entry of waitQueue) {
    const remaining = minIntervalRemaining(entry.domain);
    if (remaining > 0 && remaining < soonest) soonest = remaining;
  }
  if (soonest === Infinity) return;
  // Keep the timer ref'd so rate-limit drain is reliable under load (tests and
  // busy event loops). A long-running server process is not kept alive solely
  // by this timer in practice — in-flight work and the HTTP server already are.
  drainRetryTimer = setTimeout(() => {
    drainRetryTimer = null;
    drainQueue();
  }, Math.max(1, soonest));
}

function drainQueue() {
  while (waitQueue.length > 0) {
    // Find the first queued request whose domain has capacity
    let dispatched = false;
    for (let i = 0; i < waitQueue.length; i++) {
      const entry = waitQueue[i];
      if (canDispatch(entry.domain)) {
        waitQueue.splice(i, 1);
        const queueWaitMs = Date.now() - entry.enqueued;
        const rateWaitMs = domainMinInterval.has(entry.domain) ? queueWaitMs : 0;
        // Dispatch this one
        acquireSlot(entry.domain);
        executeFetch(entry.url, entry.options, entry.timeoutMs, entry.domain, queueWaitMs, rateWaitMs)
          .then(entry.resolve)
          .catch(entry.reject);
        dispatched = true;
        break; // Re-check from top after dispatching
      }
    }
    if (!dispatched) break; // No capacity for any queued domain
  }
  scheduleDrainRetry();
}

// ─── Core Fetch Execution ───────────────────────────────────────────────────

async function executeFetch(url, options, timeoutMs, domain, queueWaitMs = 0, rateWaitMs = 0) {
  const gen = gateGeneration;
  stats.total_dispatched++;
  const startMs = Date.now();

  const controller = new AbortController();
  const existingSignal = options?.signal;

  // Combine existing signal with timeout
  const timer = setTimeout(() => {
    controller.abort();
    if (gen === gateGeneration) stats.total_timeouts++;
  }, timeoutMs);

  // If caller provided their own signal, respect it
  if (existingSignal) {
    if (existingSignal.aborted) {
      clearTimeout(timer);
      if (gen === gateGeneration) releaseSlot(domain);
      throw new DOMException('Aborted', 'AbortError');
    }
    existingSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let finalStatus = 0;
  let errorMsg = null;

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (gen === gateGeneration) stats.total_completed++;
    finalStatus = response.status;
    return response;
  } catch (err) {
    if (gen === gateGeneration) stats.total_errors++;
    errorMsg = err.message;
    throw err;
  } finally {
    clearTimeout(timer);
    // Only mutate shared gate state if this generation is still current.
    // Prevents orphan in-flight work (after test resets) from double-releasing
    // slots or draining a fresh queue.
    if (gen === gateGeneration) {
      releaseSlot(domain);
      const durationMs = Date.now() - startMs;

      appendAuditLog({
        timestamp: new Date().toISOString(),
        domain,
        url,
        status: errorMsg ? 'error' : finalStatus,
        duration_ms: durationMs,
        queue_wait_ms: queueWaitMs,
        rate_wait_ms: rateWaitMs,
      });

      emitPolicyEvent({
        domain,
        url,
        status: errorMsg ? 'error' : finalStatus,
        error: errorMsg,
        duration_ms: durationMs,
        queue_wait_ms: queueWaitMs,
        rate_wait_ms: rateWaitMs,
      });
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Drop-in replacement for global fetch() with concurrency throttling.
 *
 * @param {string|URL|Request} url
 * @param {RequestInit} [options]
 * @param {number} [timeoutMs] - Per-request timeout in ms (default from policy, else 15000)
 * @returns {Promise<Response>}
 */
export async function throttledFetch(url, options = {}, timeoutMs) {
  const effectiveTimeout = typeof timeoutMs === 'number' ? timeoutMs : defaultTimeoutMs;
  const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url?.url || String(url);
  const domain = extractDomain(urlStr);

  const firewallCheck = checkFirewall(domain);
  if (!firewallCheck.ok) {
    stats.total_blocked++;
    const err = new Error(`Fetch blocked: ${firewallCheck.reason} (${domain})`);
    appendAuditLog({
      timestamp: new Date().toISOString(),
      domain,
      url: urlStr,
      status: 'blocked',
      duration_ms: 0,
      queue_wait_ms: 0,
      rate_wait_ms: 0,
    });
    emitPolicyEvent({
      domain,
      url: urlStr,
      status: 'blocked',
      error: firewallCheck.reason,
      duration_ms: 0,
      queue_wait_ms: 0,
      rate_wait_ms: 0,
    });
    return Promise.reject(err);
  }

  if (canDispatch(domain)) {
    acquireSlot(domain);
    return executeFetch(urlStr, options, effectiveTimeout, domain, 0, 0);
  }

  // Queue it
  stats.total_queued++;
  const queueDepth = waitQueue.length + 1;
  if (queueDepth > stats.peak_queue_depth) {
    stats.peak_queue_depth = queueDepth;
  }

  if (queueDepth >= QUEUE_WARN_THRESHOLD) {
    logger.info('throttled-fetch', `⚠️ Queue depth ${queueDepth} (global: ${globalInFlight}/${maxGlobalConcurrency}, domain ${domain}: ${domainInFlight.get(domain) || 0}/${maxPerDomain})`);
  }

  return new Promise((resolve, reject) => {
    waitQueue.push({
      resolve,
      reject,
      url: urlStr,
      options,
      timeoutMs: effectiveTimeout,
      domain,
      enqueued: Date.now(),
    });
    scheduleDrainRetry();
  });
}

/**
 * Convenience wrapper matching the old safeFetch(url, options, timeoutMs) signature
 * used throughout source-adapters.mjs.
 */
export async function safeFetch(url, options = {}, timeoutMs = 10000) {
  return throttledFetch(url, options, timeoutMs);
}

/**
 * Get current gate statistics for observability / health checks.
 */
export function getGateStats() {
  return {
    ...stats,
    current_in_flight: globalInFlight,
    current_queue_depth: waitQueue.length,
    max_global_concurrency: maxGlobalConcurrency,
    max_per_domain: maxPerDomain,
    default_timeout_ms: defaultTimeoutMs,
    whitelist_mode: isWhitelistMode(),
    domains_in_flight: Object.fromEntries(domainInFlight),
  };
}

/**
 * Reset stats (for testing).
 */
export function resetGateStats() {
  stats.total_dispatched = 0;
  stats.total_completed = 0;
  stats.total_errors = 0;
  stats.total_timeouts = 0;
  stats.total_queued = 0;
  stats.total_blocked = 0;
  stats.peak_in_flight = 0;
  stats.peak_queue_depth = 0;
}

/**
 * Reset internal rate-limit/concurrency state (for testing only).
 */
export function resetGateStateForTests() {
  gateGeneration += 1;
  globalInFlight = 0;
  domainInFlight.clear();
  // Reject any queued waiters so they cannot resolve into a fresh generation.
  const orphaned = waitQueue.splice(0, waitQueue.length);
  for (const entry of orphaned) {
    try {
      entry.reject(new Error('Gate reset (test)'));
    } catch {
      // ignore
    }
  }
  domainMinInterval.clear();
  domainLastStart.clear();
  maxGlobalConcurrency = DEFAULT_MAX_GLOBAL_CONCURRENCY;
  maxPerDomain = DEFAULT_MAX_PER_DOMAIN;
  defaultTimeoutMs = DEFAULT_TIMEOUT_MS;
  whitelistModeOverride = null;
  blockedDomains = new Set();
  allowedDomains = new Set();
  domainLimits.clear();
  if (drainRetryTimer) {
    clearTimeout(drainRetryTimer);
    drainRetryTimer = null;
  }
}


// ─── Initialize Firewall on boot ────────────────────────────────────────────
loadFirewallPolicy(brainDir);
