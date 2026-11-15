/** Passive, bounded source collection. Never imports or executes package code. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseDocument as yamlDocument } from 'yaml';

export const MAX_FILES = 200;
export const MAX_BYTES = 5 * 1024 * 1024;
export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function safePath(value) {
  if (typeof value !== 'string' || !value || value.length > 512 || /[\\\x00-\x1f:]/.test(value)
    || value.startsWith('/') || value.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Unsafe source path');
  return value;
}
export function noLinks(target) {
  let absolute = path.resolve(target);
  // macOS exposes its system temporary directory through /var -> /private/var.
  // Only canonicalize this OS-owned alias, never arbitrary source links.
  if (process.platform === 'darwin' && absolute.startsWith('/var/') && fs.readlinkSync('/var') === 'private/var') absolute = '/private' + absolute;
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) throw new Error('Symlink paths are not supported');
  }
  return absolute;
}
export function parseDeclaration(bytes, filename) {
  try {
    const text = Buffer.from(bytes).toString('utf8');
    if (/\.toml$/i.test(filename)) {
      return JSON.parse(execFileSync('python3', ['-I', '-c', 'import sys,json,tomllib;json.dump(tomllib.loads(sys.stdin.read()),sys.stdout)'],
        { input: text, encoding: 'utf8', timeout: 5000, maxBuffer: MAX_BYTES, stdio: ['pipe', 'pipe', 'pipe'] }));
    }
    if (/\.ya?ml$/i.test(filename)) {
      const doc = yamlDocument(text, { uniqueKeys: true });
      if (doc.errors.length) throw new Error('Invalid YAML');
      return doc.toJS({ maxAliasCount: 50 });
    }
    return JSON.parse(text);
  } catch { throw new Error('Malformed declaration (JSON/YAML, or TOML with Python 3.11+ required)'); }
}

const sensitive = /(?:authorization|password|passwd|secret|(?:^|_)token(?:$|_)|api[-_]?key|private[-_]?key|client[-_]?secret|access[-_]?token)/i;
// A placeholder may follow an auth scheme (`Bearer ${TOKEN}`); anything literal left over is a credential.
const placeholder = value => value === 'REQUIREMENT' || (/\$\{[^}]+\}|\{\{[^}]+\}\}|<[^>]+>/.test(value)
  && value.replace(/\$\{[^}]+\}|\{\{[^}]+\}\}|<[^>]+>/g, '').replace(/^(?:Bearer|Basic|Token)\s*/i, '').trim() === '');
/** Reject literal credentials, keeping diagnostics free of input values. */
export function rejectCredentials(value, location = '', depth = 0) {
  if (depth > 64) throw new Error('Declaration nesting exceeds limit');
  if (typeof value === 'string') {
    // Large payloads overflow the regex engine's stack; scan overlapping bounded windows instead.
    if (value.length > 32768) {
      for (let i = 0; i < value.length; i += 32768) rejectCredentials(value.slice(Math.max(0, i - 512), i + 32768), location, depth + 1);
      return;
    }
    if (/-----BEGIN (?:\w+ )?PRIVATE KEY-----|\bBearer\s+(?!\$\{|\{\{|<)[\w.+/=-]{8,}|\b(?:sk|ghp|github_pat)[_-][\w-]{12,}/i.test(value)
      || /(?:password|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[=:]\s*["']?(?!\$\{|\{\{|<)[a-z0-9+/_.-]{8,}/i.test(value)) throw new Error('Literal credential detected; use the auth secrets store and placeholders');
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        if (url.password || url.username || [...url.searchParams.keys()].some(k => sensitive.test(k))) throw new Error('credential');
      } catch (error) { if (error.message === 'credential') throw new Error('Literal credential in URL; use the auth secrets store'); }
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe declaration key');
    if (typeof child === 'string' && child && !placeholder(child)
      && sensitive.test(key)) {
      // Schema/type declarations are definitions, not saved credential values.
      if (!['string', 'boolean', 'number', 'object', 'array'].includes(child)) throw new Error('Literal credential detected; use the auth secrets store and placeholders');
    }
    rejectCredentials(child, location ? `${location}.${key}` : key, depth + 1);
  }
}

export function collectSource(input) {
  let target = noLinks(input);
  const stat = fs.statSync(target);
  let root = stat.isDirectory() ? target : path.dirname(target);
  let single = stat.isFile() ? path.basename(target) : null;
  if (single === 'plugin.json' && ['.claude-plugin', '.codex-plugin'].includes(path.basename(root))) {
    root = path.dirname(root); single = null;
  } else if (single === 'plugin.json') single = null;
  const entries = [];
  let total = 0;
  const add = (relative, file) => {
    safePath(relative);
    const s = fs.lstatSync(file);
    if (!s.isFile()) throw new Error('Source assets must be regular files; links are forbidden');
    total += s.size;
    if (total > MAX_BYTES || entries.length >= MAX_FILES) throw new Error('Plugin source exceeds import size/file limit');
    rejectSecretFile(relative);
    const bytes = fs.readFileSync(file);
    if (bytes.length !== s.size) throw new Error('Source changed while collecting');
    rejectCredentials(bytes.toString('utf8'));
    if (/\.json$/i.test(relative)) rejectCredentials(parseDeclaration(bytes, relative));
    entries.push({ path: relative, mode: s.mode & 0o755, sha256: sha256(bytes), data_b64: bytes.toString('base64') });
  };
  const walk = (dir, prefix = '') => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['.git', 'node_modules', '.venv', '__pycache__'].includes(e.name)) continue;
      const relative = prefix + e.name;
      safePath(relative);
      if (e.isSymbolicLink()) throw new Error('Source symlinks are forbidden');
      if (e.isDirectory()) walk(path.join(dir, e.name), `${relative}/`);
      else add(relative, path.join(dir, e.name));
    }
  };
  if (single) add(single, target); else walk(root);
  if (!entries.length) throw new Error('Empty plugin source');
  return { root, entries, single };
}

export function decodeAssets(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > MAX_FILES) throw new Error('Invalid source assets');
  const seen = new Set(); let total = 0;
  for (const entry of entries) {
    safePath(entry?.path);
    rejectSecretFile(entry.path);
    if (!Number.isInteger(entry.mode) || entry.mode < 0 || (entry.mode & ~0o755)) throw new Error('Unsafe source asset mode');
    if (seen.has(entry.path) || typeof entry.data_b64 !== 'string' || entry.data_b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(entry.data_b64)) throw new Error('Invalid or duplicate source asset');
    seen.add(entry.path);
    const bytes = Buffer.from(entry.data_b64, 'base64'); total += bytes.length;
    if (total > MAX_BYTES || sha256(bytes) !== entry.sha256) throw new Error('Source asset size/hash mismatch');
    rejectCredentials(bytes.toString('utf8'));
    if (/\.(?:json|ya?ml|toml)$/i.test(entry.path)) rejectCredentials(parseDeclaration(bytes, entry.path));
  }
  return entries;
}

function rejectSecretFile(relative) {
  if (/^(?:\.env(?:\.(?!example$|sample$).+)?|\.npmrc|\.pypirc|secrets\.enc|id_rsa|id_ed25519)$/i.test(path.basename(relative))) throw new Error('Credential file refused; use the auth secrets store');
}

/** Standard plugin-root/data variables are expanded at invocation; anything else needs a binding adapter. */
export const PLUGIN_ROOT_VARS = ['CLAUDE_PLUGIN_ROOT', 'PLUGIN_ROOT', '__dirname'];
export const PLUGIN_DATA_VARS = ['CLAUDE_PLUGIN_DATA', 'PLUGIN_DATA'];
export function unresolvedPlaceholders(value) {
  const found = new Set();
  for (const m of JSON.stringify(value).matchAll(/\$\{([^}]+)\}|\{\{[^}]+\}\}/g)) {
    if (m[1] && [...PLUGIN_ROOT_VARS, ...PLUGIN_DATA_VARS].includes(m[1])) continue;
    found.add(m[1] || m[0]);
  }
  return [...found];
}
export function expandPluginVars(value, rootDir, dataDir) {
  if (typeof value === 'string') return value.replace(/\$\{([^}]+)\}/g, (all, name) => PLUGIN_ROOT_VARS.includes(name) ? rootDir : PLUGIN_DATA_VARS.includes(name) ? dataDir : all);
  if (Array.isArray(value)) return value.map(v => expandPluginVars(v, rootDir, dataDir));
  if (object(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expandPluginVars(v, rootDir, dataDir)]));
  return value;
}
