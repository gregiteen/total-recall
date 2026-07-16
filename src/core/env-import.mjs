/**
 * Scan env sources and import keys into the secrets store.
 *
 * Import is pattern-based (any secret-shaped env name) — NOT a hardcoded list of
 * product APIs. Optional provider tags are best-effort labels for the catalog UI.
 * Never logs or returns full secret values in scan results.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { setSecret, listSecretsMeta, updateSecretMeta } from './secrets-store.mjs';

/**
 * @deprecated Kept as empty/export for older callers. Import does NOT use this
 * as a whitelist — any secret-shaped key is eligible.
 */
export const KNOWN_SECRET_KEYS = [];

/**
 * Name looks like a secret: ends with KEY/TOKEN/SECRET/PASSWORD/etc.
 * Or contains those segments. Shell noise is skipped.
 */
const SECRET_NAME_RE =
  /(?:^|_)(API[_-]?KEY|API[_-]?TOKEN|ACCESS[_-]?TOKEN|ACCESS[_-]?KEY|SECRET[_-]?KEY|PRIVATE[_-]?KEY|AUTH[_-]?TOKEN|CLIENT[_-]?SECRET|WEBHOOK[_-]?SECRET|PASSWORD|PASSWD|TOKEN|SECRET|KEY)$/i;

/** Obvious non-secrets even if they match loosely */
const SKIP_KEYS = new Set([
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'PWD',
  'TMPDIR',
  'TERM',
  'LANG',
  'LC_ALL',
  'NODE_ENV',
  'COLORTERM',
  'SSH_AUTH_SOCK',
  'DISPLAY',
  'USERPROFILE',
  'HOSTNAME',
  'LOGNAME',
  'XPC_SERVICE_NAME',
  'COMMAND_MODE',
  'SHLVL',
  'OLDPWD',
  'TERM_PROGRAM',
  'TERM_SESSION_ID',
  'TMP',
  'TEMP',
  'EDITOR',
  'VISUAL',
  'PAGER',
  'MANPATH',
  'INFOPATH',
  'GOPATH',
  'GOROOT',
  'JAVA_HOME',
  'ANDROID_HOME',
  'NVM_DIR',
  'PNPM_HOME',
  'BUN_INSTALL',
  'ZSH',
  'FPATH',
  'LS_COLORS',
  'COLORFGBG',
  'ITERM_SESSION_ID',
  'TERM_PROGRAM_VERSION',
  'SSH_AGENT_PID',
  'XPC_FLAGS',
  'LaunchInstanceID',
  'SECURITYSESSIONID',
  '__CFBundleIdentifier',
  '__CF_USER_TEXT_ENCODING',
]);

/**
 * Infer a short provider *label* from the key name for catalog grouping.
 * Not a whitelist — unknown keys still import; label may be null or derived.
 *
 * Strategy:
 *  1. Optional match against provider-catalog key_patterns (data, not import gate)
 *  2. Else first path segment of KEY_NAME before _API / _SECRET / _TOKEN / _KEY
 *
 * @param {string} key
 * @returns {string|null}
 */
export function inferProvider(key) {
  if (!key) return null;
  const k = String(key);

  // Lazy catalog match (optional enrichment only)
  try {
    // Dynamic import avoided in sync path — inline thin match from catalog module if already loadable
    // Use sync require-free approach: duplicate-free segment heuristic only here for speed.
  } catch {
    /* ignore */
  }

  // Strip common prefixes that are not the vendor
  let base = k
    .replace(/^(DEVELOPER_|VITE_|NEXT_PUBLIC_|PUBLIC_|NUXT_PUBLIC_)/i, '')
    .toUpperCase();

  // Take leading brand segment(s) before secret suffix
  const stripped = base
    .replace(
      /(_?API_?KEY|_?API_?TOKEN|_?ACCESS_?TOKEN|_?ACCESS_?KEY|_?SECRET_?KEY|_?PRIVATE_?KEY|_?AUTH_?TOKEN|_?CLIENT_?SECRET|_?WEBHOOK_?SECRET|_?PASSWORD|_?PASSWD|_?TOKEN|_?SECRET|_?KEY)$/i,
      '',
    )
    .replace(/^_+|_+$/g, '');

  if (!stripped) return null;

  // Normalize multi-word vendors into a slug (OPEN_ROUTER → open-router, GOOGLE_GENERATIVE_AI → google)
  const parts = stripped.toLowerCase().split(/_+/).filter(Boolean);
  if (!parts.length) return null;

  // Prefer first 1–2 meaningful parts, drop noise words
  const noise = new Set(['api', 'app', 'service', 'role', 'admin', 'user', 'test', 'public', 'private']);
  const useful = parts.filter((p) => !noise.has(p));
  const take = useful.length ? useful : parts;
  if (take.length === 1) return take[0];
  // e.g. google_generative → google; digital_ocean → digitalocean
  if (take[0].length <= 3 && take.length >= 2) return `${take[0]}-${take[1]}`;
  return take[0];
}

/**
 * @param {string} value
 */
export function maskSecret(value) {
  const s = String(value || '');
  if (s.length <= 8) return '••••••••';
  return `${s.slice(0, 4)}…${s.slice(-4)} (${s.length} chars)`;
}

/**
 * Parse .env-style text into key/value map.
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvText(text) {
  const out = {};
  if (!text || typeof text !== 'string') return out;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const exportPrefix = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = exportPrefix.indexOf('=');
    if (eq <= 0) continue;
    const key = exportPrefix.slice(0, eq).trim();
    let val = exportPrefix.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    // strip trailing inline comments for unquoted values
    if (!exportPrefix.slice(eq + 1).trim().startsWith('"') && !exportPrefix.slice(eq + 1).trim().startsWith("'")) {
      val = val.replace(/\s+#.*$/, '').trim();
    }
    if (key && val) out[key] = val;
  }
  return out;
}

/**
 * True if env var *name* looks secret-shaped. No product/API whitelist.
 * @param {string} key
 */
export function isCandidateKey(key) {
  if (!key || typeof key !== 'string') return false;
  if (SKIP_KEYS.has(key) || SKIP_KEYS.has(key.toUpperCase())) return false;
  // skip pure PATH-like / numeric shell junk
  if (key.length < 4 || key.length > 128) return false;
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) return false;
  return SECRET_NAME_RE.test(key);
}

/**
 * Discover .env* files under a directory (shallow, no node_modules).
 * @param {string} root
 * @param {number} maxDepth
 * @param {string[]} out
 * @param {number} depth
 */
function walkEnvFiles(root, maxDepth, out, depth = 0) {
  if (depth > maxDepth || !root) return;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist' || ent.name === 'build') {
      continue;
    }
    const full = path.join(root, ent.name);
    if (ent.isFile() && /^\.env(\.|$)/.test(ent.name)) {
      out.push(full);
    } else if (ent.isDirectory() && !ent.name.startsWith('.') || ent.name === '.agent' || ent.name === '.config') {
      if (ent.name.startsWith('.') && ent.name !== '.agent' && ent.name !== '.config') continue;
      walkEnvFiles(full, maxDepth, out, depth + 1);
    }
  }
}

/**
 * Candidate env file paths — discovered, not a hardcoded product list.
 * @param {{ brainDir?: string, projectRoot?: string, cwd?: string, extraFiles?: string[], discoverRoot?: string, maxDepth?: number }} opts
 */
export function defaultEnvFilePaths(opts = {}) {
  const home = os.homedir();
  const cwd = opts.cwd || process.cwd();
  const paths = [
    path.join(home, '.env'),
    path.join(home, '.agent', '.env'),
    path.join(home, '.agent', 'skills', 'total-recall', '.env'),
    path.join(home, '.agent', 'skills', 'total-recall', 'config', '.env'),
    path.join(home, '.config', 'total-recall', '.env'),
    path.join(cwd, '.env'),
    path.join(cwd, '.env.local'),
    path.join(cwd, '.env.development'),
    path.join(cwd, '.env.production'),
  ];
  if (opts.brainDir) {
    paths.push(path.join(opts.brainDir, '.env'));
    paths.push(path.join(opts.brainDir, 'config', '.env'));
  }
  if (opts.projectRoot) {
    paths.push(path.join(opts.projectRoot, '.env'));
    paths.push(path.join(opts.projectRoot, '.env.local'));
  }
  if (opts.extraFiles && Array.isArray(opts.extraFiles)) {
    paths.push(...opts.extraFiles);
  }

  // Auto-discover under ~/Github (or discoverRoot) without naming products
  const discoverRoot = opts.discoverRoot ?? path.join(home, 'Github');
  const maxDepth = opts.maxDepth ?? 3;
  if (discoverRoot && fs.existsSync(discoverRoot)) {
    walkEnvFiles(discoverRoot, maxDepth, paths, 0);
  }
  // Also discover under home/.agent
  walkEnvFiles(path.join(home, '.agent'), 4, paths, 0);

  return [...new Set(paths)];
}

/**
 * @param {Record<string, string>} map
 * @param {string} source
 * @param {Map<string, object>} into
 */
function mergeCandidates(map, source, into) {
  for (const [key, value] of Object.entries(map)) {
    if (!isCandidateKey(key)) continue;
    if (!value || !String(value).trim()) continue;
    const existing = into.get(key);
    // Prefer first non-process.env file sources over later process.env unless only env
    if (existing && existing.source !== 'process.env' && source === 'process.env') continue;
    if (existing) {
      if (!existing.sources) existing.sources = [existing.source];
      if (!existing.sources.includes(source)) existing.sources.push(source);
      if (existing.source === 'process.env' && source !== 'process.env') {
        existing.source = source;
      }
      continue;
    }
    into.set(key, {
      key,
      source,
      sources: [source],
      provider: inferProvider(key),
      masked: maskSecret(value),
      length: String(value).length,
      known: true, // all pattern-matched secrets are first-class; no API whitelist
      // internal only — stripped before API response
      _value: String(value),
    });
  }
}

/**
 * Scan process.env + default env files.
 * @param {{ brainDir?: string, projectRoot?: string, cwd?: string, includeProcessEnv?: boolean }} opts
 */
export function scanEnvSources(opts = {}) {
  const includeProcessEnv = opts.includeProcessEnv !== false;
  const candidates = new Map();

  for (const filePath of defaultEnvFilePaths(opts)) {
    try {
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
      const text = fs.readFileSync(filePath, 'utf8');
      mergeCandidates(parseEnvText(text), filePath, candidates);
    } catch {
      // unreadable path — skip
    }
  }

  if (includeProcessEnv) {
    const envMap = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === 'string' && v) envMap[k] = v;
    }
    mergeCandidates(envMap, 'process.env', candidates);
  }

  const list = [...candidates.values()].sort((a, b) => a.key.localeCompare(b.key));
  return {
    candidates: list,
    sources_scanned: [
      ...(includeProcessEnv ? ['process.env'] : []),
      ...defaultEnvFilePaths(opts),
    ],
  };
}

/**
 * Public scan result (no raw values).
 */
export function publicScanResult(scan, existingKeys = new Set()) {
  return {
    candidates: scan.candidates.map(({ key, source, provider, masked, length, known }) => ({
      key,
      source: source === 'process.env' ? 'process.env' : path.basename(source) === source ? source : source,
      source_label: source === 'process.env' ? 'shell environment' : shortenPath(source),
      provider,
      masked,
      length,
      known,
      already_set: existingKeys.has(key),
    })),
    count: scan.candidates.length,
    sources_scanned: scan.sources_scanned.map((s) =>
      s === 'process.env' ? s : shortenPath(s),
    ),
  };
}

function shortenPath(p) {
  const home = os.homedir();
  if (p.startsWith(home)) return `~${p.slice(home.length)}`;
  return p;
}

/**
 * Import selected keys into secrets store.
 * @param {string} brainDir
 * @param {{ keys?: string[], pairs?: Record<string,string>, overwrite?: boolean, actor?: string }} opts
 *   - keys: import from scan (must re-scan for values)
 *   - pairs: explicit key→value (from paste)
 */
export async function importEnvSecrets(brainDir, opts = {}) {
  const overwrite = !!opts.overwrite;
  const actor = opts.actor || 'import';
  const existing = await listSecretsMeta(brainDir);
  const existingSet = new Set(existing.map((e) => e.key));
  const existingByKey = new Map(existing.map((e) => [e.key, e]));

  /** @type {Record<string, string>} */
  let values = {};

  if (opts.pairs && typeof opts.pairs === 'object') {
    for (const [k, v] of Object.entries(opts.pairs)) {
      if (isCandidateKey(k) && v) values[k] = String(v);
    }
  }

  /** @type {Record<string, string>} */
  const sourceByKey = { ...(opts.sourceByKey || {}) };
  /** @type {Record<string, string[]>} */
  const sourcesByKey = {};

  if (Array.isArray(opts.keys) && opts.keys.length) {
    const scan = scanEnvSources({ brainDir, includeProcessEnv: true });
    const byKey = new Map(scan.candidates.map((c) => [c.key, c]));
    for (const k of opts.keys) {
      const c = byKey.get(k);
      if (c?._value) {
        values[k] = c._value;
        sourceByKey[k] = c.source;
        sourcesByKey[k] = c.sources || [c.source];
      }
    }
  }

  // If only "import all" with empty keys and no pairs — import everything from scan
  if (!opts.pairs && (!opts.keys || opts.keys.length === 0) && opts.all) {
    const scan = scanEnvSources({ brainDir, includeProcessEnv: true });
    for (const c of scan.candidates) {
      if (c._value) {
        values[c.key] = c._value;
        sourceByKey[c.key] = c.source;
        sourcesByKey[c.key] = c.sources || [c.source];
      }
    }
  }

  const imported = [];
  const skipped = [];
  const errors = [];

  for (const [key, value] of Object.entries(values)) {
    const isSet = existingSet.has(key);

    const sources = sourcesByKey[key] || (sourceByKey[key] ? [sourceByKey[key]] : []);
    let computedRepos = [];
    for (const src of sources) {
      if (src && typeof src === 'string' && src !== 'process.env' && src !== 'paste') {
        const parts = src.replace(/\\/g, '/').split('/');
        const envIdx = parts.findIndex((p) => p.startsWith('.env'));
        if (envIdx > 0) computedRepos.push(parts[envIdx - 1]);
      }
    }
    const existingEntry = existingByKey.get(key);
    const existingRepos = existingEntry?.repos || [];
    const finalRepos = [...new Set([...existingRepos, ...computedRepos])].filter(Boolean);

    // If already set and not overwriting, we only append repos
    if (isSet && !overwrite) {
      if (finalRepos.length > existingRepos.length) {
        try {
          await updateSecretMeta(brainDir, key, { repos: finalRepos }, { actor });
          imported.push({ key, provider: inferProvider(key), repos: finalRepos, meta_only: true });
        } catch (err) {
          errors.push({ key, error: err.message });
        }
      } else {
        skipped.push({ key, reason: 'already_set' });
      }
      continue;
    }

    try {
      await setSecret(brainDir, key, value, {
        provider: inferProvider(key),
        scope: 'global',
        repos: finalRepos.length > 0 ? finalRepos : undefined,
        actor,
      });
      imported.push({ key, provider: inferProvider(key), repos: finalRepos });
      existingSet.add(key);
    } catch (err) {
      errors.push({ key, error: err.message });
    }
  }

  return {
    imported,
    skipped,
    errors,
    imported_count: imported.length,
    skipped_count: skipped.length,
  };
}

/**
 * Parse pasted .env and return public candidates + internal pairs for import.
 * @param {string} text
 */
export function candidatesFromPaste(text) {
  const map = parseEnvText(text);
  const candidates = [];
  const pairs = {};
  for (const [key, value] of Object.entries(map)) {
    if (!isCandidateKey(key) || !value) continue;
    candidates.push({
      key,
      source: 'paste',
      source_label: 'pasted .env',
      provider: inferProvider(key),
      masked: maskSecret(value),
      length: String(value).length,
      known: true,
    });
    pairs[key] = value;
  }
  candidates.sort((a, b) => a.key.localeCompare(b.key));
  return { candidates, pairs };
}
