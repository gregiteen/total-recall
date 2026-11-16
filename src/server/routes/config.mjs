import { loadPluginModule as __loadOwnedPlugin } from '../../core/plugin-runtime.mjs';
/**
 * Config Routes
 *
 * GET  /api/config         — Sanitized runtime + security config
 * GET  /api/config-json    — Typed public config (security, budget, brain) + Auth credential presence
 * POST /api/config-json    — Write typed public fields; credentials go to Auth only
 * GET  /api/config/:name   — Read a documented public config file (DESIGN.md)
 * PUT  /api/config/:name   — Write a documented public config file (DESIGN.md)
 */

import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'yaml';
import { requireAuth, requireScope, loadSecurityConfig } from '../auth.mjs';
import { BRAIN_DIR, CONFIG_DIR, serverError, badRequest } from './_shared.mjs';
import { loadRuntimeConfig } from '../../core/runtime.mjs';
import { writeFileSecure } from '../../core/secure-file.mjs';
import { authStoreDir } from '../../core/connection-token.mjs';

const router = Router();

/**
 * Documented public config files the raw named routes may touch. Credential-
 * bearing files (secrets.enc, keys.jsonl, brain.json, security.yml, ...) are
 * never served here: they belong to Auth or to the typed sections below.
 */
const PUBLIC_CONFIG_FILES = new Set(['DESIGN.md']);

function publicConfigPath(name) {
  return typeof name === 'string' && PUBLIC_CONFIG_FILES.has(name) ? path.join(CONFIG_DIR, name) : null;
}

class NotRegularFile extends Error {}

/** Read a public file only when it is a standalone regular file; an alias to a private file is refused. */
function readPublicFile(file) {
  let fd;
  try { fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); }
  catch (err) {
    if (err.code === 'ENOENT') return null;
    if (err.code === 'ELOOP') throw new NotRegularFile();
    throw err;
  }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) throw new NotRegularFile();
    return fs.readFileSync(fd, 'utf8');
  } finally { fs.closeSync(fd); }
}

/** Replace a public file through a fresh inode so no existing alias is written through. */
function writePublicFile(file, content) {
  let existing = null;
  try { existing = fs.lstatSync(file); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  if (existing && (!existing.isFile() || existing.nlink !== 1)) throw new NotRegularFile();
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomBytes(8).toString('hex')}.tmp`);
  const fd = fs.openSync(tmp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
  try {
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
  } catch (err) {
    fs.closeSync(fd); fs.rmSync(tmp, { force: true });
    throw err;
  }
  fs.closeSync(fd);
  try { fs.renameSync(tmp, file); } catch (err) { fs.rmSync(tmp, { force: true }); throw err; }
}

const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStrList = v => Array.isArray(v) && v.every(x => typeof x === 'string');
// null is how a cleared numeric field arrives from the settings form.
const isNum = v => v === null || (typeof v === 'number' && Number.isFinite(v));
const isBool = v => typeof v === 'boolean';
const isStr = v => typeof v === 'string';

/** Allowlisted, non-credential security settings. Anything else stays unexposed and unwritable here. */
const SECURITY_FIELDS = {
  privacy: { enforce_local_only: isBool, allow_frontier_export: isStr },
  yolo_mode: isBool,
  dashboard: { session_ttl_hours: isNum, force_password_reset: isBool },
  api: { allow_static_pats: isBool },
  rate_limits: { api_requests_per_minute: isNum, sandbox_requests_per_minute: isNum, ingest_requests_per_minute: isNum },
  bind: { host: isStr, port: isNum, allow_public_bind: isBool },
  network: { require_https: isBool, public_health: isBool, allowed_origins: isStrList, trusted_proxies: isStrList },
  sandbox: { enabled: isBool },
};
// Exactly the fields the Settings form edits. Identity fields such as project_id have no caller and stay unwritable.
const BRAIN_FIELDS = { url: isStr, name: isStr, role: isStr, layer: isStr, tags: isStrList, full_brain: isBool, preferred_agent: isStr };
/** The backend credential's canonical Auth key; runtimeConfiguration exposes it as totalRecallToken. */
const BACKEND_TOKEN_KEY = 'TOTAL_RECALL_TOKEN';
const BUDGET_FIELDS = { budget: { enabled: isBool, daily_cap_usd: isNum, weekly_cap_usd: isNum } };

/** Copy only allowlisted leaves with the right type. */
function project(source, spec) {
  const out = {};
  if (!isPlain(source)) return out;
  for (const [key, rule] of Object.entries(spec)) {
    if (!Object.hasOwn(source, key)) continue;
    if (typeof rule === 'function') { if (rule(source[key])) out[key] = source[key]; }
    else { const nested = project(source[key], rule); if (Object.keys(nested).length) out[key] = nested; }
  }
  return out;
}

/** Names of fields in `incoming` that are not allowlisted or have the wrong type. */
function violations(incoming, spec, prefix = '') {
  const bad = [];
  if (incoming === undefined) return bad;
  if (!isPlain(incoming)) return [prefix || 'value'];
  for (const [key, value] of Object.entries(incoming)) {
    const rule = Object.hasOwn(spec, key) ? spec[key] : undefined;
    if (rule === undefined) bad.push(`${prefix}${key}`);
    else if (typeof rule === 'function') { if (!rule(value)) bad.push(`${prefix}${key}`); }
    else bad.push(...violations(value, rule, `${prefix}${key}.`));
  }
  return bad;
}

function mergeInto(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (isPlain(value) && isPlain(target[key])) mergeInto(target[key], value);
    else target[key] = value;
  }
  return target;
}

const CREDENTIAL_KEY = /(^|_)(api_?key|secret|token|password|password_hash|pats?|hash)$/i;
function redactDeep(value) {
  if (Array.isArray(value)) return value.map(redactDeep);
  if (!isPlain(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, CREDENTIAL_KEY.test(k) ? '[redacted]' : redactDeep(v)]));
}

/**
 * The public lowercase settings fields and the exact canonical Auth keys they are stored under.
 * Auth's runtimeConfiguration reads only the canonical keys, so a lowercase literal key would be
 * reported as saved but never consumed. Lowercase keys already in a store are neither read nor copied.
 */
const SECRET_KEYS = Object.freeze({
  google_api_key: 'GOOGLE_API_KEY',
  anthropic_api_key: 'ANTHROPIC_API_KEY',
  openai_api_key: 'OPENAI_API_KEY',
  openrouter_api_key: 'OPENROUTER_API_KEY',
  tavily_api_key: 'TAVILY_API_KEY',
  brave_api_key: 'BRAVE_SEARCH_API_KEY',
  exa_api_key: 'EXA_API_KEY',
  serper_api_key: 'SERPER_API_KEY',
  github_token: 'GITHUB_TOKEN',
});
const ALIAS_BY_CANONICAL = new Map(Object.entries(SECRET_KEYS).map(([alias, canonical]) => [canonical, alias]));

function readYaml(file) {
  if (!fs.existsSync(file)) return {};
  try { return yaml.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { return {}; }
}

/**
 * GET /api/config
 * Returns sanitized config (no secrets, no tokens).
 */
router.get('/api/config', requireAuth, requireScope('config:read'), async (req, res) => {
  try {
    const sec = loadSecurityConfig();
    const safe = project(sec, SECURITY_FIELDS);

    // Runtime config (sanitized)
    const runtimePath = path.join(BRAIN_DIR, 'config', 'runtime.yml');
    let runtime = null;
    if (fs.existsSync(runtimePath)) {
      try {
        runtime = redactDeep(yaml.parse(fs.readFileSync(runtimePath, 'utf8')));
      } catch {}
    }

    res.json({ security: safe, runtime });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/config-json
 * Returns the typed public config sections and Auth credential presence.
 * Credential fields (static PATs, password hashes, brain token) are never returned.
 */
router.get('/api/config-json', requireAuth, requireScope('config:read'), async (req, res) => {
  try {
    const security = project(readYaml(path.join(CONFIG_DIR, 'security.yml')), SECURITY_FIELDS);
    const budget = project(readYaml(path.join(CONFIG_DIR, 'budget.yml')), BUDGET_FIELDS);
    let existingBrain = {};
    const brainPath = path.join(CONFIG_DIR, 'brain.json');
    if (fs.existsSync(brainPath)) {
      try { existingBrain = JSON.parse(fs.readFileSync(brainPath, 'utf8')) || {}; } catch {}
    }
    const brain = project(existingBrain, BRAIN_FIELDS);
    // A legacy brain.json token still counts as set; it is never copied, exposed or migrated here.
    let hasToken = Boolean(existingBrain.token);

    // Prefer brain secrets store (AES). Never return raw secret values to the dashboard.
    const safeSecrets = {};
    try {
      const { listSecretsMeta } = await __loadOwnedPlugin('auth', 'secrets-store');
      const meta = await listSecretsMeta(authStoreDir());
      if (!Array.isArray(meta)) throw new Error('Invalid Auth metadata');
      for (const row of meta) {
        if (!row || typeof row !== 'object') throw new Error('Invalid Auth metadata');
        if (row.key === BACKEND_TOKEN_KEY) {
          if (typeof row.set !== 'boolean') throw new Error('Invalid Auth metadata');
          hasToken ||= row.set;
          continue;
        }
        const alias = ALIAS_BY_CANONICAL.get(row.key);
        if (!alias) continue;
        if (typeof row.set !== 'boolean') throw new Error('Invalid Auth metadata');
        // Mask only — Settings/Secrets UIs use presence indicators, not values.
        safeSecrets[alias] = row.set ? '••••••••' : '';
      }
    } catch {
      return res.status(503).json({ error: 'Auth credential metadata is unavailable.' });
    }

    if (hasToken) brain.has_token = true;
    res.json({ security, budget, brain, secrets: safeSecrets });
  } catch (err) { serverError(res, err); }
});

/**
 * POST /api/config-json
 * Persist typed public config fields; credential mutations belong exclusively to Auth.
 * Everything is validated before the first write. Writes then run in a fixed
 * order and the response names what applied, so a later failure is never read
 * as all-or-nothing.
 */
router.post('/api/config-json', requireAuth, requireScope('config:write'), async (req, res) => {
  try {
    const { security, budget, brain, secrets } = req.body || {};
    const securityPath = path.join(CONFIG_DIR, 'security.yml');
    const budgetPath   = path.join(CONFIG_DIR, 'budget.yml');
    const brainPath    = path.join(CONFIG_DIR, 'brain.json');

    // The UI echoes the read-only presence flag; every other brain field must be allowlisted.
    const brainPatch = isPlain(brain) ? Object.fromEntries(Object.entries(brain).filter(([k]) => k !== 'has_token')) : brain;
    let brainToken;
    let brainFields = brainPatch;
    if (isPlain(brainPatch) && Object.hasOwn(brainPatch, 'token')) {
      const { token, ...rest } = brainPatch;
      if (token !== undefined && token !== '' && typeof token !== 'string') return badRequest(res, 'Invalid config field: brain.token');
      // A blank token keeps the stored credential; only a non-empty value is sent to Auth.
      brainToken = token || undefined;
      brainFields = rest;
    }
    const invalid = [
      ...violations(security, SECURITY_FIELDS).map(f => `security.${f}`),
      ...violations(budget, BUDGET_FIELDS).map(f => `budget.${f}`),
      ...violations(brainFields, BRAIN_FIELDS).map(f => `brain.${f}`),
    ];
    if (secrets !== undefined && !isPlain(secrets)) invalid.push('secrets');
    for (const key of Object.keys(isPlain(secrets) ? secrets : {})) {
      if (!Object.hasOwn(SECRET_KEYS, key)) invalid.push(`secrets.${key}`);
    }
    if (invalid.length) return res.status(400).json({ error: `Unsupported or invalid config fields: ${invalid.join(', ')}. Nothing was changed.` });

    // The backend credential is bound by Auth to one endpoint. Resolve that endpoint and check the
    // legacy file before any write, so a refusal changes nothing.
    let bindUrl;
    if (brainToken !== undefined || (isPlain(brainFields) && typeof brainFields.url === 'string')) {
      let existingUrl;
      try { existingUrl = JSON.parse(fs.readFileSync(brainPath, 'utf8'))?.url; } catch { /* no public config yet */ }
      bindUrl = isPlain(brainFields) && typeof brainFields.url === 'string' ? brainFields.url : existingUrl;
      if (brainToken !== undefined && !/^https?:\/\//i.test(String(bindUrl || ''))) {
        return res.status(400).json({ error: 'A backend token needs an http(s) backend URL. Nothing was changed.' });
      }
      if (isPlain(brainFields) && typeof brainFields.url === 'string') {
        try {
          const owner = await __loadOwnedPlugin('auth', 'configuration');
          owner.assertLegacyTokenNotRebound({ file: brainPath, url: brainFields.url });
        } catch (err) {
          const legacy = /legacy token/.test(String(err?.message));
          return res.status(legacy ? 409 : 503).json({ error: legacy
            ? 'brain.json holds a legacy token for its current endpoint; clear it before changing the endpoint. Nothing was changed.'
            : 'Auth configuration is unavailable. Nothing was changed.' });
        }
      }
    }

    // Only real secret values reach Auth; masked placeholders from GET are ignored.
    const secretOps = [];
    for (const [alias, key] of Object.entries(SECRET_KEYS)) {
      if (!isPlain(secrets) || secrets[alias] === undefined) continue;
      const value = secrets[alias];
      if (value === '' || value == null) { secretOps.push({ alias, key, remove: true }); continue; }
      if (typeof value === 'string' && (value.includes('•') || value === '[redacted]')) continue;
      secretOps.push({ alias, key, value: String(value) });
    }

    // An explicit backend credential goes to the Auth owner under its canonical key, never into brain.json.
    if (brainToken !== undefined) secretOps.push({ alias: 'brain.token', key: BACKEND_TOKEN_KEY, value: brainToken, bindUrl });

    const plan = [];
    if (secretOps.length) plan.push('secrets');
    if (isPlain(security)) plan.push('security');
    if (isPlain(budget)) plan.push('budget');
    if (isPlain(brainFields) && Object.keys(brainFields).length) plan.push('brain');
    const applied = [];
    let failed = null;

    const step = async (section, fn) => {
      if (failed || !plan.includes(section)) return;
      try { await fn(); applied.push(section); } catch { failed = section; }
    };

    if (plan.length && !fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

    if (secretOps.length) {
      const appliedKeys = [];
      try {
        const { setSecret, deleteSecret } = await __loadOwnedPlugin('auth', 'secrets-store');
        for (const op of secretOps) {
          if (op.bindUrl) {
            // Auth fixes the endpoint binding in the same store update as the value.
            const { saveConnectionToken } = await __loadOwnedPlugin('auth', 'configuration');
            await saveConnectionToken({ brainDir: authStoreDir(), url: op.bindUrl, token: op.value, actor: 'settings-config' });
          } else if (op.remove) await deleteSecret(authStoreDir(), op.key, { action: 'delete', actor: 'settings-config' });
          else await setSecret(authStoreDir(), op.key, op.value, { action: 'set', actor: 'settings-config' });
          appliedKeys.push(op.alias);
        }
        applied.push('secrets');
      } catch {
        failed = 'secrets';
        const notAttempted = plan.filter(s => s !== 'secrets');
        return res.status(503).json({
          error: 'Auth credential update did not complete; verify the stored state before retrying.',
          applied: appliedKeys.length ? [`secrets:${appliedKeys.join(',')}`] : [], failed, not_attempted: notAttempted,
        });
      }
    }
    await step('security', () => {
      const merged = mergeInto(readYamlStrict(securityPath), security);
      writeFileSecure(securityPath, yaml.stringify(merged), { encoding: 'utf8', mode: 0o600 });
    });
    await step('budget', () => {
      const merged = mergeInto(readYamlStrict(budgetPath), budget);
      writeFileSecure(budgetPath, yaml.stringify(merged), { encoding: 'utf8', mode: 0o600 });
    });
    await step('brain', () => {
      let existingBrain = {};
      if (fs.existsSync(brainPath)) existingBrain = JSON.parse(fs.readFileSync(brainPath, 'utf8')) || {};
      const nextBrain = { ...existingBrain, ...(isPlain(brainFields) ? brainFields : {}) };
      delete nextBrain.has_token;
      writeFileSecure(brainPath, JSON.stringify(nextBrain, null, 2), { encoding: 'utf8', mode: 0o600 });
    });

    if (failed) {
      return res.status(500).json({
        error: 'Config update did not complete; the listed sections show what was applied.',
        applied, failed, not_attempted: plan.filter(s => !applied.includes(s) && s !== failed),
      });
    }
    res.json({ success: true, applied });
  } catch (err) { serverError(res, err); }
});

/** A damaged existing file must fail the update, not be replaced by defaults. */
function readYamlStrict(file) {
  if (!fs.existsSync(file)) return {};
  return yaml.parse(fs.readFileSync(file, 'utf8')) || {};
}

/**
 * GET /api/config/:name
 * Read a documented public config file from CONFIG_DIR.
 */
router.get('/api/config/:name', requireAuth, requireScope('config:read'), (req, res) => {
  try {
    const filePath = publicConfigPath(req.params.name);
    if (!filePath) return badRequest(res, 'Invalid config name');
    const content = readPublicFile(filePath);
    if (content === null) {
      if (req.params.name === 'DESIGN.md') {
        return res.json({ content: '# Design System\n\nPreview your markdown here.' });
      }
      return res.json({ content: '' });
    }
    res.json({ content });
  } catch (err) {
    if (err instanceof NotRegularFile) return res.status(409).json({ error: 'Config file is not a standalone regular file.' });
    serverError(res, err);
  }
});

/**
 * PUT /api/config/:name
 * Write a documented public config file to CONFIG_DIR through a fresh inode.
 */
router.put('/api/config/:name', requireAuth, requireScope('config:write'), (req, res) => {
  try {
    const filePath = publicConfigPath(req.params.name);
    if (!filePath) return badRequest(res, 'Invalid config name');
    if (typeof req.body?.content !== 'string') return badRequest(res, 'content must be a string');
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    writePublicFile(filePath, req.body.content);
    res.json({ success: true });
  } catch (err) {
    if (err instanceof NotRegularFile) return res.status(409).json({ error: 'Config file is not a standalone regular file.' });
    serverError(res, err);
  }
});

export default router;
export { router as configRouter };
