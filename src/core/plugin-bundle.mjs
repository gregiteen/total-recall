/**
 * Plugin bundles — the unit a node sends to a mesh peer.
 *
 * A bundle is plain JSON (no tar dependency) carrying every regular file of a
 * plugin, base64-encoded, plus a SHA-256 content hash computed over a canonical
 * ordering. The receiver recomputes the hash from the bytes it actually wrote
 * and refuses the install on any mismatch, so a truncated or altered transfer
 * can never become an installed plugin.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const BUNDLE_FORMAT = 'tr-plugin-bundle/1';
export const MAX_BUNDLE_FILES = 200;
export const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;

const SKIP_DIRS = new Set(['.git', 'node_modules']);

/**
 * List a plugin's files in canonical order.
 * Dotfiles, `.git/`, `node_modules/` and symlinks are excluded: they are either
 * local state or a way to smuggle a path outside the plugin.
 * @returns {Array<{ path: string, abs: string, size: number, mode: number }>}
 */
export function listPluginFiles(pluginDir) {
  const root = fs.realpathSync(pluginDir);
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile()) {
        const stat = fs.statSync(abs);
        out.push({
          path: path.relative(root, abs).split(path.sep).join('/'),
          abs,
          size: stat.size,
          mode: stat.mode & 0o777
        });
      }
    }
  };
  walk(root);
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}

function hashEntries(entries) {
  const h = crypto.createHash('sha256');
  for (const e of entries) {
    h.update(e.path);
    h.update('\0');
    h.update(String(e.data.length));
    h.update('\0');
    h.update(e.data);
  }
  return h.digest('hex');
}

/** SHA-256 over a plugin directory's canonical file list. */
export function hashPluginDir(pluginDir) {
  const files = listPluginFiles(pluginDir);
  return {
    sha256: hashEntries(files.map((f) => ({ path: f.path, data: fs.readFileSync(f.abs) }))),
    file_count: files.length,
    size_bytes: files.reduce((n, f) => n + f.size, 0)
  };
}

/** Pack a plugin directory into a transferable bundle. */
export function packPlugin(pluginDir, manifest) {
  const files = listPluginFiles(pluginDir);
  if (files.length > MAX_BUNDLE_FILES) {
    throw new Error(`Plugin has ${files.length} files; the limit is ${MAX_BUNDLE_FILES}`);
  }
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_BUNDLE_BYTES) {
    throw new Error(`Plugin is ${total} bytes; the limit is ${MAX_BUNDLE_BYTES}`);
  }
  const entries = files.map((f) => ({ path: f.path, mode: f.mode, data: fs.readFileSync(f.abs) }));
  return {
    format: BUNDLE_FORMAT,
    id: manifest.id,
    version: manifest.version,
    sha256: hashEntries(entries),
    files: entries.map((e) => ({ path: e.path, mode: e.mode, data_b64: e.data.toString('base64') }))
  };
}

function assertSafeRelativePath(p) {
  if (typeof p !== 'string' || p.length === 0 || p.length > 512) throw new Error('Bundle file path is empty or too long');
  if (p.includes('\\') || p.includes('\0')) throw new Error(`Bundle file path '${p}' contains a forbidden character`);
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) throw new Error(`Bundle file path '${p}' is absolute`);
  const parts = p.split('/');
  if (parts.some((s) => s === '' || s === '.' || s === '..' || s.startsWith('.'))) {
    throw new Error(`Bundle file path '${p}' is not a plain relative path`);
  }
}

/**
 * Decode and check a bundle without touching the filesystem.
 * @returns {{ id: string, version: string, sha256: string, entries: Array<{path:string, mode:number, data:Buffer}> }}
 */
export function decodeBundle(bundle, { expectedSha256 } = {}) {
  if (!bundle || typeof bundle !== 'object' || bundle.format !== BUNDLE_FORMAT) {
    throw new Error('Not a Total Recall plugin bundle');
  }
  if (!Array.isArray(bundle.files) || bundle.files.length === 0) throw new Error('Bundle contains no files');
  if (bundle.files.length > MAX_BUNDLE_FILES) throw new Error('Bundle exceeds the file limit');

  const seen = new Set();
  let total = 0;
  const entries = bundle.files.map((f) => {
    assertSafeRelativePath(f?.path);
    if (seen.has(f.path)) throw new Error(`Bundle lists '${f.path}' twice`);
    seen.add(f.path);
    const data = Buffer.from(String(f.data_b64 || ''), 'base64');
    total += data.length;
    if (total > MAX_BUNDLE_BYTES) throw new Error('Bundle exceeds the size limit');
    return { path: f.path, mode: Number.isInteger(f.mode) ? f.mode & 0o755 : 0o644, data };
  });
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  if (!seen.has('plugin.json')) throw new Error('Bundle has no plugin.json');

  const sha256 = hashEntries(entries);
  if (sha256 !== bundle.sha256) {
    throw new Error(`Bundle content hash mismatch (declared ${bundle.sha256}, actual ${sha256})`);
  }
  if (expectedSha256 && sha256 !== expectedSha256) {
    throw new Error(`Bundle content hash ${sha256} does not match the advertised ${expectedSha256}`);
  }
  return { id: bundle.id, version: bundle.version, sha256, entries };
}

/**
 * Write decoded entries into `<pluginsDir>/<id>` atomically: files go to a
 * dot-prefixed staging dir (invisible to discovery) that is renamed into place.
 */
export function writeEntriesAtomic(pluginsDir, id, entries) {
  fs.mkdirSync(pluginsDir, { recursive: true });
  const dest = path.join(pluginsDir, id);
  if (fs.existsSync(dest)) throw new Error(`Plugin '${id}' is already installed at ${dest}`);
  const staging = path.join(pluginsDir, `.staging-${id}-${crypto.randomBytes(4).toString('hex')}`);
  try {
    for (const e of entries) {
      const target = path.join(staging, ...e.path.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, e.data, { mode: e.mode });
    }
    fs.renameSync(staging, dest);
  } catch (err) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw err;
  }
  return dest;
}

/** Copy a local plugin directory into `pluginsDir` atomically (same exclusions as bundles). */
export function copyPluginAtomic(sourceDir, pluginsDir, id) {
  const entries = listPluginFiles(sourceDir).map((f) => ({ path: f.path, mode: f.mode, data: fs.readFileSync(f.abs) }));
  return writeEntriesAtomic(pluginsDir, id, entries);
}
