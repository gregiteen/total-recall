/**
 * src/core/throttled-fetch.mjs
 *
 * Centralized Fetch Gate — every outbound HTTP request in Total Recall
 * MUST go through this module. Provides:
 *
 *   1. Global concurrency cap (default 6 simultaneous connections)
 *   2. Per-domain concurrency limits (default 3 per domain)
 *   3. Request queuing with backpressure
 *   4. Abort timeout integration
 *   5. Observability (in-flight, queued, completed, rejected counts)
 *
 * Usage:
 *   import { throttledFetch, getGateStats } from './throttled-fetch.mjs';
 *   const res = await throttledFetch(url, options, timeoutMs);
 *
 * This replaces all raw fetch() calls across the codebase.
 */

import { logger } from './logger.mjs';
import { brainDir } from './config.mjs';

// ─── Configuration ──────────────────────────────────────────────────────────

const MAX_GLOBAL_CONCURRENCY = 6;   // total simultaneous outbound connections
const MAX_PER_DOMAIN = 3;           // max concurrent per unique hostname
const DEFAULT_TIMEOUT_MS = 15000;   // per-request timeout
const QUEUE_WARN_THRESHOLD = 20;    // log warning if queue exceeds this

// ─── State ──────────────────────────────────────────────────────────────────

let globalInFlight = 0;
const domainInFlight = new Map();    // hostname → count
const waitQueue = [];                // { resolve, reject, url, options, timeoutMs, domain, enqueued }

// Stats for observability
const stats = {
  total_dispatched: 0,
  total_completed: 0,
  total_errors: 0,
  total_timeouts: 0,
  total_queued: 0,
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
const auditLog = []; // Circular buffer: { timestamp, domain, url, status, duration_ms, queue_wait_ms }

let policyWatcher = null;

export async function loadFirewallPolicy(brainDir) {
  try {
    // We dynamically require to avoid circular deps if needed, but fs/path are available.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const yaml = await import('yaml');
    
    const policyPath = path.join(brainDir, 'memory-vault', 'system', 'network-policy.md');
    if (!fs.existsSync(policyPath)) return;
    
    const applyPolicy = () => {
      try {
        const content = fs.readFileSync(policyPath, 'utf8');
        const match = content.match(/^---\n([\s\S]+?)\n---/);
        if (match) {
          const fm = yaml.parse(match[1]);
          if (fm.type === 'network_policy' && fm.status === 'active') {
            blockedDomains = new Set(fm.blocked_domains || []);
            allowedDomains = new Set(fm.allowed_domains || []);
            const limits = fm.domain_limits || {};
            domainLimits.clear();
            for (const [d, cfg] of Object.entries(limits)) {
              if (cfg.maxConcurrency) domainLimits.set(d, cfg.maxConcurrency);
            }
            logger.info('throttled-fetch', `Loaded network policy: ${blockedDomains.size} blocked, ${allowedDomains.size} allowed, ${domainLimits.size} limits.`);
          }
        }
      } catch (e) {
        logger.error('throttled-fetch', `Failed parsing policy: ${e.message}`);
      }
    };
    
    applyPolicy();

    if (!policyWatcher) {
      policyWatcher = fs.watch(policyPath, (eventType) => {
        if (eventType === 'change') {
          applyPolicy();
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

function checkFirewall(domain) {
  if (blockedDomains.has(domain)) {
    return { ok: false, reason: 'Domain blocked by firewall policy' };
  }
  if (allowedDomains.size > 0 && !allowedDomains.has(domain)) {
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

// ─── Gate Logic ─────────────────────────────────────────────────────────────

function canDispatch(domain) {
  if (globalInFlight >= MAX_GLOBAL_CONCURRENCY) return false;
  const maxForDomain = domainLimits.has(domain) ? domainLimits.get(domain) : MAX_PER_DOMAIN;
  const domainCount = domainInFlight.get(domain) || 0;
  if (domainCount >= maxForDomain) return false;
  return true;
}

function acquireSlot(domain) {
  globalInFlight++;
  domainInFlight.set(domain, (domainInFlight.get(domain) || 0) + 1);
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

function drainQueue() {
  while (waitQueue.length > 0) {
    // Find the first queued request whose domain has capacity
    let dispatched = false;
    for (let i = 0; i < waitQueue.length; i++) {
      const entry = waitQueue[i];
      if (canDispatch(entry.domain)) {
        waitQueue.splice(i, 1);
        const queueWaitMs = Date.now() - entry.enqueued;
        // Dispatch this one
        acquireSlot(entry.domain);
        executeFetch(entry.url, entry.options, entry.timeoutMs, entry.domain, queueWaitMs)
          .then(entry.resolve)
          .catch(entry.reject);
        dispatched = true;
        break; // Re-check from top after dispatching
      }
    }
    if (!dispatched) break; // No capacity for any queued domain
  }
}

// ─── Core Fetch Execution ───────────────────────────────────────────────────

async function executeFetch(url, options, timeoutMs, domain, queueWaitMs = 0) {
  stats.total_dispatched++;
  const startMs = Date.now();

  const controller = new AbortController();
  const existingSignal = options?.signal;

  // Combine existing signal with timeout
  const timer = setTimeout(() => {
    controller.abort();
    stats.total_timeouts++;
  }, timeoutMs);

  // If caller provided their own signal, respect it
  if (existingSignal) {
    if (existingSignal.aborted) {
      clearTimeout(timer);
      releaseSlot(domain);
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
    stats.total_completed++;
    finalStatus = response.status;
    return response;
  } catch (err) {
    stats.total_errors++;
    errorMsg = err.message;
    throw err;
  } finally {
    clearTimeout(timer);
    releaseSlot(domain);
    const durationMs = Date.now() - startMs;
    
    // Log locally
    appendAuditLog({
      timestamp: new Date().toISOString(),
      domain,
      url,
      status: errorMsg ? 'error' : finalStatus,
      duration_ms: durationMs,
      queue_wait_ms: queueWaitMs,
    });
    
    // Fire-and-forget SSSS event
    import('./ssss-kernel-bridge.mjs').then(async ({ processViaPackageKernel }) => {
      const crypto = await import('node:crypto');
      const { brainDir } = await import('./config.mjs');
      const path = await import('node:path');
      const vaultRoot = path.join(brainDir, 'memory-vault');
      const eventContent = {
        domain,
        url,
        status: errorMsg ? 'error' : finalStatus,
        error: errorMsg,
        duration_ms: durationMs,
        queue_wait_ms: queueWaitMs
      };
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
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Drop-in replacement for global fetch() with concurrency throttling.
 *
 * @param {string|URL|Request} url
 * @param {RequestInit} [options]
 * @param {number} [timeoutMs] - Per-request timeout in ms (default 15000)
 * @returns {Promise<Response>}
 */
export async function throttledFetch(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url?.url || String(url);
  const domain = extractDomain(urlStr);

  const firewallCheck = checkFirewall(domain);
  if (!firewallCheck.ok) {
    const err = new Error(`Fetch blocked: ${firewallCheck.reason} (${domain})`);
    appendAuditLog({
      timestamp: new Date().toISOString(),
      domain,
      url: urlStr,
      status: 'blocked',
      duration_ms: 0,
      queue_wait_ms: 0,
    });
    return Promise.reject(err);
  }

  if (canDispatch(domain)) {
    acquireSlot(domain);
    return executeFetch(urlStr, options, timeoutMs, domain, 0);
  }

  // Queue it
  stats.total_queued++;
  const queueDepth = waitQueue.length + 1;
  if (queueDepth > stats.peak_queue_depth) {
    stats.peak_queue_depth = queueDepth;
  }

  if (queueDepth >= QUEUE_WARN_THRESHOLD) {
    logger.info('throttled-fetch', `⚠️ Queue depth ${queueDepth} (global: ${globalInFlight}/${MAX_GLOBAL_CONCURRENCY}, domain ${domain}: ${domainInFlight.get(domain) || 0}/${MAX_PER_DOMAIN})`);
  }

  return new Promise((resolve, reject) => {
    waitQueue.push({
      resolve,
      reject,
      url: urlStr,
      options,
      timeoutMs,
      domain,
      enqueued: Date.now(),
    });
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
    max_global_concurrency: MAX_GLOBAL_CONCURRENCY,
    max_per_domain: MAX_PER_DOMAIN,
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
  stats.peak_in_flight = 0;
  stats.peak_queue_depth = 0;
}

// ─── Initialize Firewall on boot ────────────────────────────────────────────
loadFirewallPolicy(brainDir);
