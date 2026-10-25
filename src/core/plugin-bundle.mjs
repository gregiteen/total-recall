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

const BRICK_ROOT_FILES = /^LICENSE[^/]*$/i;

/**
 * Files a plugin distributes to one audience.
 *
 * `host` is every file, for a mesh peer or a Total Recall installation.
 * `brick` is the host-free capability only: the directory holding
 * `capability.entry`, plus LICENSE. package.json is regenerated with only its
 * runtime fields, and the README is left behind because it documents the host. The UI, the CLI
 * handler and the host manifest never leave with a brick, so a vendored copy
 * has no UI and no path back to Total Recall. Its plugin.json and package.json
 * are reduced copies, returned as `data` rather than read from disk.
 * @returns {Array<{ path: string, abs: string, size: number, mode: number, data?: Buffer }>}
 */
export function pluginBundleFiles(pluginDir, { audience = 'host' } = {}) {
  const files = listPluginFiles(pluginDir);
  if (audience === 'host') return files;
  if (audience !== 'brick') throw new Error(`Unknown bundle audience '${audience}'`);
  const root = fs.realpathSync(pluginDir);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  const entry = manifest.capability?.entry;
  if (typeof entry !== 'string') throw new Error(`Plugin '${manifest.id}' declares no capability.entry, so it cannot be vendored as a brick`);
  const capDir = path.posix.dirname(entry);
  const inCap = (p) => (capDir === '.' ? p === entry : p.startsWith(`${capDir}/`));
  const kept = files.filter((f) => f.path.split('/')[0] !== 'ui' && (inCap(f.path) || BRICK_ROOT_FILES.test(f.path)));
  if (!kept.some((f) => f.path === entry)) throw new Error(`capability.entry '${entry}' does not exist in plugin '${manifest.id}'`);
  const reduced = Buffer.from(`${JSON.stringify({
    id: manifest.id, name: manifest.name, version: manifest.version, description: manifest.description,
    brick: true, capability: manifest.capability,
    ...(manifest.requires ? { requires: manifest.requires } : {})
  }, null, 2)}\n`);
  const generated = [{ path: 'plugin.json', abs: null, size: reduced.length, mode: 0o644, data: reduced }];
  const pkgFile = path.join(root, 'package.json');
  if (fs.existsSync(pkgFile)) {
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    const runtime = {};
    for (const k of ['name', 'version', 'type', 'description', 'license', 'dependencies']) if (pkg[k] !== undefined) runtime[k] = pkg[k];
    // A capability that declares its own dependencies keeps only those: the plugin's other
    // dependencies serve the host side (routes, CLI) and never leave with the brick.
    const own = manifest.capability.dependencies;
    if (own !== undefined) {
      if (!Array.isArray(own) || own.some((d) => typeof d !== 'string')) throw new Error(`Plugin '${manifest.id}' capability.dependencies must be an array of package names`);
      const missing = own.filter((d) => !pkg.dependencies?.[d]);
      if (missing.length) throw new Error(`Plugin '${manifest.id}' capability.dependencies names packages its package.json does not depend on: ${missing.join(', ')}`);
      const kept = Object.fromEntries(own.map((d) => [d, pkg.dependencies[d]]));
      if (Object.keys(kept).length) runtime.dependencies = kept; else delete runtime.dependencies;
    }
    const data = Buffer.from(`${JSON.stringify(runtime, null, 2)}\n`);
    generated.push({ path: 'package.json', abs: null, size: data.length, mode: 0o644, data });
  }
  return [...kept, ...generated]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
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
