/**
 * Secrets store — portable keys separate from the SSSS memory vault.
 *
 * Format: AES-256-GCM ciphertext at <brain>/config/secrets.enc with mode 0o600.
 *
 * Never write secret values into vault markdown, openwiki, or compiled surfaces.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import YAML from 'yaml';
import { encryptSecrets, decryptSecrets, encryptSecretsSync, decryptSecretsSync } from './crypto.mjs';

const META_KEY = '__tr_secrets_meta';

/**
 * @param {string} brainDir
 */
export function resolveSecretsPath(brainDir) {
  if (brainDir.endsWith('.agent')) {
    return path.join(brainDir, 'secrets.enc');
  }
  return path.join(brainDir, 'config', 'secrets.enc');
}

/**
 * @param {string} brainDir
 */
export function resolveAuditPath(brainDir) {
  return path.join(brainDir, 'logs', 'secrets-audit.jsonl');
}

/**
 * @param {string} brainDir
 */
export function resolveUsagePath(brainDir) {
  return path.join(brainDir, 'logs', 'usage.jsonl');
}

function secretsPassword() {
  return process.env.TR_SECRETS_PASSWORD || process.env.TR_MASTER_PASSWORD || null;
}

/**
 * Is this buffer the plaintext JSON form of the store, rather than ciphertext?
 *
 * The encrypted form opens with a random 16-byte salt, so its first byte is
 * `{` about once in every 256 stores — measured at 17 in 5000. Deciding the
 * format from that byte alone therefore misreads roughly one store in every
 * 256 as plain JSON. Reads survive it by falling back to decryption, but
 * `migrateSecretsToEncryptedIfNeeded` does not: it reports perfectly good
 * ciphertext as `not-json`, and its caller believes the store still needs
 * migrating. The first byte is a cheap way to reject the common case; only
 * parsing can settle the rest.
 */
export function isPlainJsonStore(buf) {
  if (!buf?.length || buf[0] !== 0x7b /* { */) return false;
  try {
    const parsed = JSON.parse(buf.toString('utf8'));
    return Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/**
 * Load raw secrets object synchronously
 */
export function loadSecretsSync(brainDir) {
  const filePath = resolveSecretsPath(brainDir);
  if (!fs.existsSync(filePath)) return {};

  const buf = fs.readFileSync(filePath);
  const password = secretsPassword();

  if (password && buf.length > 44 && !isPlainJsonStore(buf)) {
    try {
      return decryptSecretsSync(buf, password);
    } catch (err) {
      throw new Error(`Failed to decrypt secrets store synchronously: ${err.message}`);
    }
  }

  return JSON.parse(buf.toString('utf8') || '{}');
}

/**
 * Save raw secrets object synchronously
 */
export function saveSecretsSync(brainDir, obj) {
  const filePath = resolveSecretsPath(brainDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  
  const password = secretsPassword();
  if (!password) throw new Error('TR_SECRETS_PASSWORD or TR_MASTER_PASSWORD is required to write secrets');
  const buf = encryptSecretsSync(obj, password);
  fs.writeFileSync(filePath, buf, { mode: 0o600 });
}

/**
 * Load raw secrets object (values included). Caller must not log values.
 * @param {string} brainDir
 */
export async function loadSecrets(brainDir) {
  const filePath = resolveSecretsPath(brainDir);
  if (!fs.existsSync(filePath)) return {};

  const buf = fs.readFileSync(filePath);
  const password = secretsPassword();

  if (password && buf.length > 44 && !isPlainJsonStore(buf)) {
    try {
      return await decryptSecrets(buf, password);
    } catch (err) {
      throw new Error(`Failed to decrypt secrets store: ${err.message}`);
    }
  }

  // Plain JSON (legacy / default)
  try {
    const text = buf.toString('utf8').trim();
    if (!text) return {};
    return JSON.parse(text) || {};
  } catch {
    if (password) {
      try {
        return await decryptSecrets(buf, password);
      } catch (err) {
        throw new Error(`Secrets file is not valid JSON and AES decrypt failed: ${err.message}`);
      }
    }
    throw new Error('Secrets file is not valid JSON. Set TR_SECRETS_PASSWORD if it is AES-encrypted.');
  }
}

/**
 * Persist secrets object.
 * @param {string} brainDir
 * @param {object} secrets
 */
export async function saveSecrets(brainDir, secrets) {
  const filePath = resolveSecretsPath(brainDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const password = secretsPassword();

  if (!password) throw new Error('TR_SECRETS_PASSWORD or TR_MASTER_PASSWORD is required to write secrets');
  const buf = await encryptSecrets(secrets, password);
  fs.writeFileSync(filePath, buf, { mode: 0o600 });
}

/**
 * If secrets.enc is still legacy plain JSON and a password is configured,
 * re-encrypt in place. Safe no-op when already ciphertext or no password.
 *
 * @param {string} brainDir
 * @returns {Promise<{ migrated: boolean, path: string, reason?: string }>}
 */
export async function migrateSecretsToEncryptedIfNeeded(brainDir) {
  const filePath = resolveSecretsPath(brainDir);
  if (!fs.existsSync(filePath)) {
    return { migrated: false, path: filePath, reason: 'missing' };
  }
  const password = secretsPassword();
  if (!password) {
    return { migrated: false, path: filePath, reason: 'no-password' };
  }
  const buf = fs.readFileSync(filePath);
  if (buf.length > 44 && !isPlainJsonStore(buf)) {
    return { migrated: false, path: filePath, reason: 'already-encrypted' };
  }
  let obj;
  try {
    const text = buf.toString('utf8').trim();
    if (!text) return { migrated: false, path: filePath, reason: 'empty' };
    obj = JSON.parse(text);
  } catch {
    return { migrated: false, path: filePath, reason: 'not-json' };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { migrated: false, path: filePath, reason: 'invalid-payload' };
  }
  await saveSecrets(brainDir, obj);
  appendAudit(brainDir, {
    action: 'migrate_encrypt',
    key: '(store)',
    actor: 'system',
  });
  return { migrated: true, path: filePath };
}

export async function validateSecretsBuffer(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const password = secretsPassword();
  if (password && buf.length > 44 && !isPlainJsonStore(buf)) {
    const parsed = await decryptSecrets(buf, password);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Decrypted secrets payload must be an object');
    }
    return true;
  }
  const parsed = JSON.parse(buf.toString('utf8') || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Secrets payload must be a JSON object');
  }
  return true;
}

/** Validate then atomically replace the encrypted secrets store. */
export async function replaceSecretsBufferAtomic(brainDir, buffer) {
  await validateSecretsBuffer(buffer);
  const filePath = resolveSecretsPath(brainDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tempPath, buffer, { mode: 0o600 });
    fs.renameSync(tempPath, filePath);
    fs.chmodSync(filePath, 0o600);
  } finally {
    if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
  }
  appendAudit(brainDir, { action: 'mesh_sync_replace', key: '(encrypted-store)', actor: 'mesh-sync' });
  return { success: true, path: filePath };
}

function ensureMeta(secrets) {
  if (!secrets[META_KEY] || typeof secrets[META_KEY] !== 'object') {
    secrets[META_KEY] = { keys: {}, version: 1 };
  }
  if (!secrets[META_KEY].keys) secrets[META_KEY].keys = {};
  return secrets;
}

function appendAudit(brainDir, event) {
  const auditPath = resolveAuditPath(brainDir);
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...event,
    // never include values
  });
  fs.appendFileSync(auditPath, line + '\n', { mode: 0o600 });
}

/**
 * Parse repos field. Policy: 0 (developer/tooling) or exactly 1 product repo.
 * Never allow multi-repo binding — each key is unique to one repo or to developer scope.
 *
 * @param {string|string[]|null|undefined} v
 * @param {{ strict?: boolean }} opts - strict throws if >1; false collapses for read-only display
 * @returns {string[]}
 */
export function normalizeReposBinding(v, opts = {}) {
  const strict = opts.strict !== false;
  let list = [];
  if (Array.isArray(v)) {
    list = [...new Set(v.map(String).map((s) => s.trim()).filter(Boolean))];
  } else if (typeof v === 'string') {
    list = [
      ...new Set(
        v
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
  }
  if (strict && list.length > 1) {
    throw new Error(`A credential can be bound to at most ONE repo. Got ${list.length}: ${list.join(', ')}`);
  }
  return list;
}

/**
 * True when meta has multi-repo violation (legacy data).
 */
export function isMultiRepoViolation(meta = {}) {
  const repos = Array.isArray(meta.repos) ? meta.repos.filter(Boolean) : [];
  return repos.length > 1;
}

/**
 * Normalize / merge secret metadata (never stores values).
 * @param {object} prev
 * @param {object} patch
 */
export function mergeSecretMeta(prev = {}, patch = {}) {
  const next = { ...prev };
  const assign = (field, transform) => {
    if (patch[field] !== undefined) {
      next[field] = transform ? transform(patch[field]) : patch[field];
    }
  };
  assign('scope', (v) => (v === 'project' ? 'project' : 'global'));
  assign('provider', (v) => (v ? String(v).toLowerCase() : null));
  assign('label', (v) => (v == null ? null : String(v)));
  // Writes only — at most one product repo; empty = Developer secrets
  assign('repos', (v) => normalizeReposBinding(v, { strict: true }));
  assign('subscription_tier', (v) => (v == null || v === '' ? null : String(v)));
  assign('monthly_cost_usd', (v) => (v == null || v === '' ? null : Number(v)));
  assign('monthly_cap_usd', (v) => (v == null || v === '' ? null : Number(v)));
  assign('api_docs_url', (v) => (v == null || v === '' ? null : String(v)));
  assign('console_url', (v) => (v == null || v === '' ? null : String(v)));
  assign('pricing_url', (v) => (v == null || v === '' ? null : String(v)));
  assign('schema_notes', (v) => (v == null || v === '' ? null : String(v)));
  assign('auth_scheme', (v) => (v == null || v === '' ? null : String(v)));
  assign('rotate_every_days', (v) => {
    if (v == null || v === '' || v === false) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  assign('auto_rotate', (v) => !!v);
  assign('notes', (v) => (v == null || v === '' ? null : String(v)));
  assign('project_path', (v) => (v == null || v === '' ? null : String(v)));
  assign('headscale_url', (v) => (v == null || v === '' ? null : String(v)));
  // Live provider account / usage / subscription tracking (provider-account-sync)
  assign('tracking_exempt', (v) => !!v);
  assign('tracking_status', (v) => {
    if (v == null || v === '') return null;
    const s = String(v).toLowerCase();
    return ['ok', 'partial', 'error', 'exempt', 'never'].includes(s) ? s : 'error';
  });
  assign('tracking_error', (v) => (v == null || v === '' ? null : String(v)));
  assign('tracking_synced_at', (v) => (v == null || v === '' ? null : String(v)));
  assign('tracking_probe', (v) => (v == null || v === '' ? null : String(v)));
  assign('tracking_account', (v) => (v == null ? null : v));
  assign('tracking_usage', (v) => (v == null ? null : v));
  assign('tracking_subscription', (v) => (v == null ? null : v));
  assign('account_api', (v) => (v == null ? null : !!v));
  assign('usage_api', (v) => (v == null ? null : !!v));
  assign('subscription_api', (v) => (v == null ? null : !!v));
  assign('key_valid', (v) => (v == null ? null : !!v));
  // Operator waiver: intentional shared credential (rare — prefer unique keys per app)
  assign('shared_value_ok', (v) => !!v);
  if (patch.updated_at) next.updated_at = patch.updated_at;
  if (patch.rotated_at) next.rotated_at = patch.rotated_at;
  if (patch.created_at && !next.created_at) next.created_at = patch.created_at;
  return next;
}

/**
 * Compute next rotation due ISO date from meta.
 */
export function nextRotateDue(meta = {}) {
  if (!meta.rotate_every_days) return null;
  const base = meta.rotated_at || meta.updated_at || meta.created_at;
  if (!base) return null;
  const t = new Date(base).getTime() + meta.rotate_every_days * 86400000;
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

/** Canonical app label for repo binding (empty = developer/global). */
export function appLabelForSecret(row = {}) {
  if (row.repo) return String(row.repo);
  if (Array.isArray(row.repos) && row.repos.length === 1) return String(row.repos[0]);
  if (Array.isArray(row.repos) && row.repos.length > 1) return row.repos.join('+');
  return 'developer';
}

/**
 * Full value fingerprint (never truncated — used for equality).
 * @param {string} value
 */
export function secretValueFingerprint(value) {
  if (value == null || value === '') return null;
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/**
 * Build shared-value groups from rows that already have fingerprint_full + set.
 * Same credential material under multiple key names / apps must be an ERROR so
 * each app can get its own rotated key.
 *
 * @param {Array<object>} rows - secret meta rows (with fingerprint_full)
 * @returns {{ groups: object[], byKey: Map<string, object> }}
 */
export function buildSharedValueIndex(rows = []) {
  const byFp = new Map();
  for (const row of rows) {
    if (!row?.set || !row.fingerprint_full) continue;
    // Skip pure internal passwords that are intentionally shared (e.g. same JWT across?)
    // No — still flag; operator can mark shared_value_ok.
    if (!byFp.has(row.fingerprint_full)) byFp.set(row.fingerprint_full, []);
    byFp.get(row.fingerprint_full).push(row);
  }

  const groups = [];
  const byKey = new Map();

  for (const [fp, members] of byFp) {
    if (members.length < 2) continue;
    const apps = [...new Set(members.map((m) => appLabelForSecret(m)))].sort();
    const keys = members.map((m) => m.key).sort();
    const providers = [...new Set(members.map((m) => m.provider).filter(Boolean))];
    const multiApp = apps.length > 1;
    const multiKey = keys.length > 1;
    // Error unless every member is operator-waived
    const allOk = members.every((m) => m.shared_value_ok === true);
    let severity = 'error';
    let error = null;
    if (allOk) {
      severity = 'ok';
      error = null;
    } else if (multiApp) {
      severity = 'error';
      error = `SHARED CREDENTIAL across apps/repos [${apps.join(', ')}] as keys [${keys.join(', ')}]. Issue a unique API key per app and re-bind.`;
    } else {
      // Same app/developer but duplicated under multiple secret names — still force unique
      severity = 'error';
      error = `SHARED CREDENTIAL value stored under ${keys.length} secret names [${keys.join(', ')}] (app=${apps[0]}). Use one key name or issue distinct values per purpose.`;
    }

    const group = {
      fingerprint: fp.slice(0, 12),
      fingerprint_full: fp,
      count: members.length,
      apps,
      multi_app: multiApp,
      multi_key: multiKey,
      keys,
      providers,
      severity,
      error,
      members: members.map((m) => ({
        key: m.key,
        repo: m.repo || null,
        repos: m.repos || [],
        app: appLabelForSecret(m),
        provider: m.provider || null,
        masked: m.masked || null,
        shared_value_ok: !!m.shared_value_ok,
      })),
    };
    groups.push(group);
    for (const m of members) {
      byKey.set(m.key, {
        shared_value: true,
        shared_with: members
          .filter((o) => o.key !== m.key)
          .map((o) => ({
            key: o.key,
            app: appLabelForSecret(o),
            repo: o.repo || null,
            provider: o.provider || null,
          })),
        shared_apps: apps,
        shared_value_error: error,
        shared_value_severity: severity,
        shared_fingerprint: fp.slice(0, 12),
      });
    }
  }

  groups.sort((a, b) => b.count - a.count || a.fingerprint.localeCompare(b.fingerprint));
  return { groups, byKey };
}

/**
 * List secret keys with rich metadata only (no values).
 * Annotates shared-value groups (same credential material under multiple keys/apps).
 */
export async function listSecretsMeta(brainDir) {
  const { getProvider, providerForKeyName } = await import('./provider-catalog.mjs');
  const secrets = ensureMeta(await loadSecrets(brainDir));
  const meta = secrets[META_KEY].keys || {};
  const usageByKey = summarizeUsageByKey(brainDir, { days: 30 });
  const keys = Object.keys(secrets).filter((k) => k !== META_KEY);
  const rows = keys.map((key) => {
    const m = meta[key] || {};
    const val = secrets[key];
    const providerId = m.provider || providerForKeyName(key)?.id || null;
    const catalog = providerId ? getProvider(providerId) : providerForKeyName(key);
    const due = nextRotateDue(m);
    const now = Date.now();
    const rotation_overdue = due ? new Date(due).getTime() < now : false;
    const usage = usageByKey.by_key[key] || {
      events: 0,
      cost_usd: 0,
      input_tokens: 0,
      output_tokens: 0,
    };
    const repos = Array.isArray(m.repos) ? m.repos.filter(Boolean) : [];
    const fpFull =
      typeof val === 'string' && val.length ? secretValueFingerprint(val) : null;
    return {
      key,
      set: val !== undefined && val !== null && val !== '',
      length: typeof val === 'string' ? val.length : val != null ? String(val).length : 0,
      fingerprint: fpFull ? fpFull.slice(0, 12) : null,
      fingerprint_full: fpFull,
      masked:
        typeof val === 'string' && val.length > 8
          ? `${val.slice(0, 4)}…${val.slice(-4)}`
          : val
            ? '••••••••'
            : null,
      scope: m.scope || 'global',
      provider: providerId,
      provider_name: catalog?.name || providerId,
      label: m.label || null,
      repos,
      repo: repos.length === 1 ? repos[0] : null,
      multi_repo_error: isMultiRepoViolation(m),
      binding_error: isMultiRepoViolation(m) ? `Legacy data error: Bound to ${repos.length} repos. Must be resolved to 1 or 0.` : null,
      project_path: m.project_path || null,
      subscription_tier: m.subscription_tier || null,
      monthly_cost_usd: m.monthly_cost_usd ?? null,
      monthly_cap_usd: m.monthly_cap_usd ?? catalog?.default_monthly_cap_usd ?? null,
      api_docs_url: m.api_docs_url || catalog?.docs_url || null,
      console_url: m.console_url || catalog?.console_url || null,
      pricing_url: m.pricing_url || catalog?.pricing_url || null,
      schema: catalog?.schema || null,
      schema_notes: m.schema_notes || catalog?.schema?.notes || null,
      auth_scheme: m.auth_scheme || catalog?.schema?.auth || null,
      rotate_every_days: m.rotate_every_days ?? null,
      auto_rotate: !!m.auto_rotate,
      next_rotate_due: due,
      rotation_overdue,
      notes: m.notes || null,
      created_at: m.created_at || null,
      updated_at: m.updated_at || null,
      rotated_at: m.rotated_at || null,
      headscale_url: m.headscale_url || null,
      usage_30d: usage,
      tiers: catalog?.tiers || [],
      // Provider account/usage tracking (must be ok or exempt — else error)
      tracking_exempt: !!m.tracking_exempt,
      tracking_status: m.tracking_status || (m.tracking_exempt ? 'exempt' : null),
      tracking_error: m.tracking_error || null,
      tracking_synced_at: m.tracking_synced_at || null,
      tracking_probe: m.tracking_probe || null,
      tracking_account: m.tracking_account || null,
      tracking_usage: m.tracking_usage || null,
      tracking_subscription: m.tracking_subscription || null,
      account_api: m.account_api ?? null,
      usage_api: m.usage_api ?? null,
      subscription_api: m.subscription_api ?? null,
      key_valid: m.key_valid ?? null,
      shared_value_ok: !!m.shared_value_ok,
    };
  });

  const { byKey: sharedByKey } = buildSharedValueIndex(rows);
  return rows.map((row) => {
    const shared = sharedByKey.get(row.key);
    const { fingerprint_full: _full, ...publicRow } = row;
    if (!shared) {
      return {
        ...publicRow,
        shared_value: false,
        shared_with: [],
        shared_apps: [],
        shared_value_error: null,
        shared_value_severity: null,
      };
    }
    return {
      ...publicRow,
      shared_value: true,
      shared_with: shared.shared_with,
      shared_apps: shared.shared_apps,
      shared_value_error: shared.shared_value_error,
      shared_value_severity: shared.shared_value_severity,
      shared_fingerprint: shared.shared_fingerprint,
    };
  });
}

/**
 * Report of credential values reused across secret names / apps.
 * healthy=false when any unwaived share exists.
 */
export async function getSharedValueHealth(brainDir) {
  const secrets = ensureMeta(await loadSecrets(brainDir));
  const meta = secrets[META_KEY].keys || {};
  const rows = [];
  for (const key of Object.keys(secrets)) {
    if (key === META_KEY) continue;
    const val = secrets[key];
    if (val === undefined || val === null || val === '') continue;
    const m = meta[key] || {};
    const repos = Array.isArray(m.repos) ? m.repos.filter(Boolean) : [];
    rows.push({
      key,
      set: true,
      provider: m.provider || null,
      repos,
      repo: repos.length === 1 ? repos[0] : null,
      fingerprint_full: secretValueFingerprint(String(val)),
      masked:
        typeof val === 'string' && val.length > 8
          ? `${val.slice(0, 4)}…${val.slice(-4)}`
          : '••••••••',
      shared_value_ok: !!m.shared_value_ok,
    });
  }
  const { groups } = buildSharedValueIndex(rows);
  const errorGroups = groups.filter((g) => g.severity === 'error');
  const multiAppGroups = errorGroups.filter((g) => g.multi_app);
  return {
    healthy: errorGroups.length === 0,
    groups,
    error_groups: errorGroups.length,
    multi_app_groups: multiAppGroups.length,
    shared_keys: errorGroups.reduce((n, g) => n + g.count, 0),
    message:
      errorGroups.length === 0
        ? 'No shared credential values across secret names/apps'
        : `SHARED KEY ERROR: ${errorGroups.length} credential value(s) reused across secret names/apps — issue unique keys per app`,
    errors: errorGroups.map((g) => ({
      fingerprint: g.fingerprint,
      apps: g.apps,
      keys: g.keys,
      error: g.error,
    })),
  };
}

/**
 * Full catalog payload for UI: keys + providers + usage totals.
 */
export async function getSecretsCatalog(brainDir) {
  const { listProviders } = await import('./provider-catalog.mjs');
  const keys = await listSecretsMeta(brainDir);
  const usage30 = summarizeUsage(brainDir, { days: 30 });
  const usage7 = summarizeUsage(brainDir, { days: 7 });
  const budget = loadBudgetConfig(brainDir);
  const monthlyPlanned = keys.reduce((s, k) => s + (Number(k.monthly_cost_usd) || 0), 0);
  const overdue = keys.filter((k) => k.rotation_overdue);
  const multiRepoViolations = [];
  const developerKeys = keys.filter((k) => !k.repos?.length);
  const productKeys = keys.filter((k) => k.repos?.length >= 1);
  const byProvider = {};
  for (const k of keys) {
    const p = k.provider || 'unknown';
    if (!byProvider[p]) byProvider[p] = { provider: p, keys: 0, cost_30d: 0, monthly_cost: 0 };
    byProvider[p].keys++;
    byProvider[p].cost_30d += k.usage_30d?.cost_usd || 0;
    byProvider[p].monthly_cost += Number(k.monthly_cost_usd) || 0;
  }
  const setKeys = keys.filter((k) => k.set);
  const trackingOk = setKeys.filter((k) => k.tracking_status === 'ok');
  const trackingExempt = setKeys.filter((k) => k.tracking_status === 'exempt' || k.tracking_exempt);
  const trackingErrors = setKeys.filter(
    (k) => k.tracking_status !== 'ok' && k.tracking_status !== 'exempt' && !k.tracking_exempt,
  );
  const sharedKeys = setKeys.filter((k) => k.shared_value && k.shared_value_severity === 'error');
  const sharedApps = setKeys.filter(
    (k) => k.shared_value && k.shared_value_severity === 'error' && (k.shared_apps?.length || 0) > 1,
  );
  // Build unique shared groups from key annotations
  const seenFp = new Set();
  const sharedGroups = [];
  for (const k of sharedKeys) {
    const fp = k.shared_fingerprint || k.fingerprint;
    if (!fp || seenFp.has(fp)) continue;
    seenFp.add(fp);
    sharedGroups.push({
      fingerprint: fp,
      apps: k.shared_apps || [],
      keys: [k.key, ...(k.shared_with || []).map((s) => s.key)],
      error: k.shared_value_error,
    });
  }
  return {
    keys,
    providers: listProviders(),
    summary: {
      total_keys: keys.length,
      providers_active: Object.keys(byProvider).length,
      monthly_subscription_usd: monthlyPlanned,
      multi_repo_violations: multiRepoViolations.length,
      developer_keys: developerKeys.length,
      product_keys: productKeys.length,
      usage_7d: usage7,
      usage_30d: usage30,
      rotation_overdue: overdue.length,
      budget: budget.config,
      tracking_healthy: trackingErrors.length === 0,
      tracking_ok: trackingOk.length,
      tracking_exempt: trackingExempt.length,
      tracking_errors: trackingErrors.length,
      tracking_error_keys: trackingErrors.map((k) => ({
        key: k.key,
        provider: k.provider,
        tracking_status: k.tracking_status || 'never',
        error: k.tracking_error || 'Never synced — run secret account-sync',
      })),
      // Same credential material under multiple key names / repos
      shared_value_healthy: sharedKeys.length === 0,
      shared_value_keys: sharedKeys.length,
      shared_value_multi_app_keys: sharedApps.length,
      shared_value_groups: sharedGroups.length,
      shared_value_errors: sharedGroups,
    },
    by_provider: Object.values(byProvider).sort((a, b) => b.cost_30d - a.cost_30d),
    store: resolveSecretsPath(brainDir),
  };
}

/**
 * Update metadata only (no value change).
 */
export async function updateSecretMeta(brainDir, key, patch = {}, opts = {}) {
  const secrets = ensureMeta(await loadSecrets(brainDir));
  if (!(key in secrets) || key === META_KEY) {
    throw new Error(`Secret not found: ${key}`);
  }
  const prev = secrets[META_KEY].keys[key] || {};
  secrets[META_KEY].keys[key] = mergeSecretMeta(prev, {
    ...patch,
    updated_at: new Date().toISOString(),
    created_at: prev.created_at || new Date().toISOString(),
  });
  await saveSecrets(brainDir, secrets);
  appendAudit(brainDir, {
    action: 'meta',
    key,
    actor: opts.actor || 'cli',
    fields: Object.keys(patch),
  });
  return listSecretsMeta(brainDir).then((rows) => rows.find((r) => r.key === key));
}

/**
 * Secrets due for rotation (auto_rotate or overdue).
 */
export async function listRotationDue(brainDir, { autoOnly = false } = {}) {
  const keys = await listSecretsMeta(brainDir);
  return keys.filter((k) => {
    if (!k.next_rotate_due) return false;
    if (!k.rotation_overdue) return false;
    if (autoOnly && !k.auto_rotate) return false;
    return true;
  });
}

/**
 * Set a secret. Value never returned in audit.
 */
export async function setSecret(brainDir, key, value, opts = {}) {
  if (!key || !/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(key)) {
    throw new Error('Invalid secret key. Use letters, numbers, _ . - (start with a letter).');
  }
  if (key === META_KEY) throw new Error('Reserved key name');
  if (value === undefined || value === null || value === '') {
    throw new Error('Secret value must be non-empty');
  }

  const secrets = ensureMeta(await loadSecrets(brainDir));
  const prev = secrets[META_KEY].keys[key] || {};
  const now = new Date().toISOString();
  secrets[key] = String(value);
  secrets[META_KEY].keys[key] = mergeSecretMeta(prev, {
    scope: opts.scope || prev.scope || 'global',
    provider: opts.provider || prev.provider || null,
    repos: opts.repos !== undefined ? opts.repos : prev.repos,
    subscription_tier: opts.subscription_tier !== undefined ? opts.subscription_tier : prev.subscription_tier,
    monthly_cost_usd: opts.monthly_cost_usd !== undefined ? opts.monthly_cost_usd : prev.monthly_cost_usd,
    monthly_cap_usd: opts.monthly_cap_usd !== undefined ? opts.monthly_cap_usd : prev.monthly_cap_usd,
    api_docs_url: opts.api_docs_url !== undefined ? opts.api_docs_url : prev.api_docs_url,
    headscale_url: opts.headscale_url !== undefined ? opts.headscale_url : prev.headscale_url,
    rotate_every_days: opts.rotate_every_days !== undefined ? opts.rotate_every_days : prev.rotate_every_days,
    auto_rotate: opts.auto_rotate !== undefined ? opts.auto_rotate : prev.auto_rotate,
    notes: opts.notes !== undefined ? opts.notes : prev.notes,
    project_path: opts.project_path !== undefined ? opts.project_path : prev.project_path,
    label: opts.label !== undefined ? opts.label : prev.label,
    created_at: prev.created_at || now,
    updated_at: now,
  });
  await saveSecrets(brainDir, secrets);
  appendAudit(brainDir, {
    action: 'set',
    key,
    scope: secrets[META_KEY].keys[key].scope,
    provider: secrets[META_KEY].keys[key].provider,
    actor: opts.actor || 'cli',
  });

  // First-time set only: optionally queue product-level API research (not raw key-name scraping).
  // Skip under Vitest / NODE_ENV=test — enqueue can hang on network and blow 5s timeouts.
  // Force research in tests with skip_integration_research: false.
  const inTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
  const skipResearch =
    opts.skip_integration_research === true ||
    (inTest && opts.skip_integration_research !== false);
  if (!prev.created_at && !skipResearch) {
    try {
      const { maybeEnqueueIntegrationResearch } = await import('./secret-integration-research.mjs');
      const result = await maybeEnqueueIntegrationResearch(brainDir, key, {
        provider: secrets[META_KEY].keys[key].provider,
      });
      const { logger } = await import('./logger.mjs');
      if (result.enqueued) {
        logger.info('secrets', 'Queued product API research for new key', {
          key,
          topic: result.item?.topic,
        });
      } else {
        logger.debug('secrets', 'Skipped integration research for new key', {
          key,
          reason: result.skipped,
        });
      }
    } catch {
      // Ignore background task failures
    }
  }

  return { key, set: true };
}

/**
 * Get a secret value (CLI only — do not inject into surfaces).
 */
export async function getSecret(brainDir, key, opts = {}) {
  const secrets = await loadSecrets(brainDir);
  if (!(key in secrets) || key === META_KEY) {
    return { found: false, key };
  }
  appendAudit(brainDir, {
    action: opts.action || 'get',
    key,
    actor: opts.actor || 'cli',
  });
  return { found: true, key, value: secrets[key] };
}

/**
 * Delete a secret.
 */
export async function deleteSecret(brainDir, key, opts = {}) {
  const secrets = ensureMeta(await loadSecrets(brainDir));
  if (!(key in secrets) || key === META_KEY) {
    return { found: false, key };
  }
  delete secrets[key];
  if (secrets[META_KEY].keys) delete secrets[META_KEY].keys[key];
  await saveSecrets(brainDir, secrets);
  appendAudit(brainDir, { action: 'delete', key, actor: opts.actor || 'cli' });
  return { found: true, key, deleted: true };
}

/**
 * Rotate: set new value, mark rotated_at.
 */
export async function rotateSecret(brainDir, key, newValue, opts = {}) {
  if (!newValue) throw new Error('New value required for rotate');
  const secrets = ensureMeta(await loadSecrets(brainDir));
  if (!(key in secrets) || key === META_KEY) {
    throw new Error(`Secret not found: ${key}`);
  }
  secrets[key] = String(newValue);
  const prev = secrets[META_KEY].keys[key] || {};
  const now = new Date().toISOString();
  secrets[META_KEY].keys[key] = mergeSecretMeta(prev, {
    scope: opts.scope || prev.scope || 'global',
    provider: opts.provider || prev.provider || null,
    updated_at: now,
    rotated_at: now,
  });
  await saveSecrets(brainDir, secrets);
  appendAudit(brainDir, { action: 'rotate', key, actor: opts.actor || 'cli' });
  return { key, rotated: true, next_rotate_due: nextRotateDue(secrets[META_KEY].keys[key]) };
}

/**
 * Read last N audit lines (no values).
 */
export function readSecretAudit(brainDir, { limit = 50 } = {}) {
  const auditPath = resolveAuditPath(brainDir);
  if (!fs.existsSync(auditPath)) return [];
  const lines = fs.readFileSync(auditPath, 'utf8').split('\n').filter(Boolean);
  return lines
    .slice(-limit)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Record a usage/cost event (no secrets).
 */
export function recordUsage(brainDir, event) {
  const usagePath = resolveUsagePath(brainDir);
  fs.mkdirSync(path.dirname(usagePath), { recursive: true });
  const row = {
    ts: new Date().toISOString(),
    provider: event.provider || 'unknown',
    model: event.model || null,
    input_tokens: event.input_tokens || 0,
    output_tokens: event.output_tokens || 0,
    cost_usd: event.cost_usd ?? null,
    source: event.source || 'cli',
    key_ref: event.key_ref || null, // secret *name* only, never value
  };
  fs.appendFileSync(usagePath, JSON.stringify(row) + '\n', { mode: 0o600 });
  return row;
}

/**
 * Load budget.yml if present.
 */
export function loadBudgetConfig(brainDir) {
  const candidates = [
    path.join(brainDir, 'config', 'budget.yml'),
    path.join(process.cwd(), 'config', 'budget.yml'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      return { path: p, config: YAML.parse(fs.readFileSync(p, 'utf8')) || {} };
    } catch {
      return { path: p, config: {}, error: 'parse failed' };
    }
  }
  return {
    path: null,
    config: { daily_cap_usd: 5, weekly_cap_usd: 25 },
  };
}

/** @deprecated alias */
export const loadBudget = loadBudgetConfig;

/**
 * Sum usage.jsonl costs for last N days.
 */
export function summarizeUsage(brainDir, { days = 1 } = {}) {
  const usagePath = resolveUsagePath(brainDir);
  if (!fs.existsSync(usagePath)) {
    return { events: 0, cost_usd: 0, input_tokens: 0, output_tokens: 0, days };
  }
  const cutoff = Date.now() - days * 86400000;
  let events = 0;
  let cost = 0;
  let input = 0;
  let output = 0;
  for (const line of fs.readFileSync(usagePath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const t = new Date(row.ts).getTime();
      if (t < cutoff) continue;
      events++;
      cost += Number(row.cost_usd) || 0;
      input += Number(row.input_tokens) || 0;
      output += Number(row.output_tokens) || 0;
    } catch {
      // skip
    }
  }
  return { events, cost_usd: cost, input_tokens: input, output_tokens: output, days };
}

/**
 * Usage rollup by key_ref and provider for last N days.
 */
export function summarizeUsageByKey(brainDir, { days = 30 } = {}) {
  const usagePath = resolveUsagePath(brainDir);
  const by_key = {};
  const by_provider = {};
  if (!fs.existsSync(usagePath)) {
    return { by_key, by_provider, days };
  }
  const cutoff = Date.now() - days * 86400000;
  for (const line of fs.readFileSync(usagePath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const t = new Date(row.ts).getTime();
      if (t < cutoff) continue;
      const kref = row.key_ref || '_unattributed';
      const prov = row.provider || 'unknown';
      if (!by_key[kref]) {
        by_key[kref] = { events: 0, cost_usd: 0, input_tokens: 0, output_tokens: 0 };
      }
      by_key[kref].events++;
      by_key[kref].cost_usd += Number(row.cost_usd) || 0;
      by_key[kref].input_tokens += Number(row.input_tokens) || 0;
      by_key[kref].output_tokens += Number(row.output_tokens) || 0;
      if (!by_provider[prov]) {
        by_provider[prov] = { events: 0, cost_usd: 0, input_tokens: 0, output_tokens: 0 };
      }
      by_provider[prov].events++;
      by_provider[prov].cost_usd += Number(row.cost_usd) || 0;
      by_provider[prov].input_tokens += Number(row.input_tokens) || 0;
      by_provider[prov].output_tokens += Number(row.output_tokens) || 0;
    } catch {
      // skip
    }
  }
  return { by_key, by_provider, days };
}

/**
 * Recent usage rows (no secrets), newest last.
 */
export function listUsageEvents(brainDir, { limit = 100, key_ref = null, days = 30 } = {}) {
  const usagePath = resolveUsagePath(brainDir);
  if (!fs.existsSync(usagePath)) return [];
  const cutoff = Date.now() - days * 86400000;
  const rows = [];
  for (const line of fs.readFileSync(usagePath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const t = new Date(row.ts).getTime();
      if (t < cutoff) continue;
      if (key_ref && row.key_ref !== key_ref) continue;
      rows.push(row);
    } catch {
      // skip
    }
  }
  return rows.slice(-limit);
}

/**
 * True if any secret value appears in text (for surface/openwiki conformance).
 */
export async function textContainsSecrets(brainDir, text) {
  if (!text) return { leak: false, keys: [] };
  const secrets = await loadSecrets(brainDir);
  const leaked = [];
  for (const [key, val] of Object.entries(secrets)) {
    if (key === META_KEY) continue;
    if (typeof val === 'string' && val.length >= 8 && text.includes(val)) {
      leaked.push(key);
    }
  }
  return { leak: leaked.length > 0, keys: leaked };
}

/**
 * Resolve brain dir for secrets (global or project).
 */
export function defaultBrainDir() {
  return (
    process.env._TR_TEST_BRAIN_DIR ||
    path.join(os.homedir(), '.agent', 'skills', 'total-recall')
  );
}
