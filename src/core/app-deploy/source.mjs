/**
 * Capability Deployment — Source Resolver & Integrity Verifier
 *
 * Implements Phase 2 of CAPABILITY_DEPLOYMENT_PLUGINS:
 * - Pinned source/hash verification
 * - Safe extraction and filesystem containment
 * - Strict rejection of symlinks, parent directory traversals, and absolute paths
 * - Prevention of secret and environment credential leakage (.env, *.key, *.pem, secrets.enc)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  validatePluginManifest,
  bundledPluginsDir,
  getPlugin
} from '../plugin-loader.mjs';
import {
  decodeBundle,
  hashPluginDir
} from '../plugin-bundle.mjs';
import {
  parsePublicPluginSource,
  fetchPublicBundle
} from '../plugin-public.mjs';

export const PROHIBITED_SECRET_PATTERNS = [
  /^\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pkcs12$/i,
  /\.pfx$/i,
  /^id_rsa(\..+)?$/i,
  /^id_ed25519(\..+)?$/i,
  /^secrets\.enc$/i,
  /credentials\.json$/i,
  /client_secret.*\.json$/i
];

/**
 * Checks if a relative file path matches known credential/secret patterns.
 * @param {string} relPath
 * @returns {boolean}
 */
export function isProhibitedSecretFile(relPath) {
  const basename = path.basename(relPath);
  return PROHIBITED_SECRET_PATTERNS.some((pattern) => pattern.test(basename));
}

/**
 * Validates that a path is safe and strictly relative.
 * Rejects absolute paths, windows drive letters, null bytes, backslashes, and directory traversals.
 * @param {string} p
 */
export function assertSafeSourcePath(p) {
  if (typeof p !== 'string' || p.length === 0 || p.length > 512) {
    throw new Error(`Invalid source path: empty or exceeds 512 characters (${p})`);
  }
  if (p.includes('\\') || p.includes('\0')) {
    throw new Error(`Security error: path '${p}' contains forbidden characters (backslash or null byte)`);
  }
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) {
    throw new Error(`Security error: path '${p}' must be relative, not absolute`);
  }
  const parts = p.split('/');
  for (const part of parts) {
    if (part === '' || part === '.' || part === '..') {
      throw new Error(`Security error: path '${p}' contains illegal traversal component ('${part}')`);
    }
  }
}

/**
 * Canonical SHA-256 computation over entries sorted by path.
 * Format: path \0 length \0 data
 * @param {Array<{ path: string, data: Buffer }>} entries
 * @returns {string} hex digest
 */
export function computeEntriesHash(entries) {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const h = crypto.createHash('sha256');
  for (const e of sorted) {
    h.update(e.path);
    h.update('\0');
    h.update(String(e.data.length));
    h.update('\0');
    h.update(e.data);
  }
  return h.digest('hex');
}

/**
 * Scans a source directory, strictly verifying safety and computing canonical hash.
 * @param {string} dirPath
 * @returns {{ sha256: string, entries: Array<{ path: string, abs: string, size: number, mode: number, data: Buffer }> }}
 */
export function scanAndVerifyDirectory(dirPath) {
  const root = fs.realpathSync(dirPath);
  const entries = [];
  const SKIP_DIRS = new Set(['.git', 'node_modules', '.agent']);

  function walk(current) {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      if (item.name.startsWith('.') && item.name !== '.agent') {
        // Skip hidden dotfiles, but flag prohibited .env files
        if (isProhibitedSecretFile(item.name)) {
          throw new Error(`Security error: Prohibited credential file '${item.name}' found in capability source`);
        }
        continue;
      }
      if (SKIP_DIRS.has(item.name)) continue;

      const abs = path.join(current, item.name);
      const rel = path.relative(root, abs).split(path.sep).join('/');

      assertSafeSourcePath(rel);

      if (isProhibitedSecretFile(rel)) {
        throw new Error(`Security error: Prohibited credential file '${rel}' found in capability source`);
      }

      if (item.isSymbolicLink()) {
        throw new Error(`Security error: Symbolic link detected at '${rel}'. Symlinks are forbidden in capability sources.`);
      }

      if (item.isDirectory()) {
        walk(abs);
      } else if (item.isFile()) {
        const stat = fs.statSync(abs);
        const data = fs.readFileSync(abs);
        entries.push({
          path: rel,
          abs,
          size: stat.size,
          mode: stat.mode & 0o777,
          data
        });
      }
    }
  }

  walk(root);

  if (entries.length === 0) {
    throw new Error(`Capability source directory is empty: ${dirPath}`);
  }

  const manifestEntry = entries.find((e) => e.path === 'plugin.json');
  if (!manifestEntry) {
    throw new Error(`Capability source missing required manifest 'plugin.json' at root: ${dirPath}`);
  }

  const sha256 = computeEntriesHash(entries);
  return { sha256, entries };
}

/**
 * Safely extracts validated entries into a target destination.
 * @param {Array<{ path: string, mode?: number, data: Buffer }>} entries
 * @param {string} destDir
 */
export function extractEntriesSafely(entries, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  const realDest = fs.realpathSync(destDir);

  for (const entry of entries) {
    assertSafeSourcePath(entry.path);
    if (isProhibitedSecretFile(entry.path)) {
      throw new Error(`Security error: cannot extract prohibited secret file '${entry.path}'`);
    }

    const targetAbs = path.join(realDest, entry.path);
    // Ensure target doesn't escape destination directory
    if (!targetAbs.startsWith(realDest + path.sep)) {
      throw new Error(`Security error: extracted path '${entry.path}' escapes destination directory`);
    }

    fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
    fs.writeFileSync(targetAbs, entry.data, { mode: entry.mode || 0o644 });
  }
}

/**
 * Resolves, validates, and stages a capability plugin from a local path, bundled ID, public link, or bundle.
 *
 * @param {string|object} source - Local path, bundled id, public URL, or in-memory bundle
 * @param {object} [options]
 * @param {string} [options.expectedHash] - Expected SHA-256 hash
 * @param {string} [options.projectRoot] - Target project root
 * @param {string} [options.stagingDir] - Destination directory to stage files
 * @param {object} [options.publicDeps] - Dependency injection for network operations (fetch)
 * @returns {Promise<{
 *   id: string,
 *   version: string,
 *   manifest: object,
 *   sourceUri: string,
 *   sourceType: string,
 *   sha256: string,
 *   fileCount: number,
 *   sizeBytes: number,
 *   stagedDir: string,
 *   files: Array<{ path: string, size: number, sha256: string }>,
 *   cleanup: () => void
 * }>}
 */
export async function resolveCapabilitySource(source, options = {}) {
  let expectedHash = options.expectedHash || null;
  let sourceType = 'local';
  let sourceUri = typeof source === 'string' ? source : 'in-memory-bundle';
  let entries = [];
  let computedSha = null;

  // 1. In-memory bundle object
  if (typeof source === 'object' && source !== null && source.files && source.format) {
    sourceType = 'bundle';
    const decoded = decodeBundle(source, { expectedSha256: expectedHash || undefined });
    computedSha = decoded.sha256;
    entries = decoded.entries;
  }
  // 2. Public hash-pinned URL
  else if (typeof source === 'string' && (source.startsWith('http://') || source.startsWith('https://'))) {
    sourceType = 'public';
    const parsed = parsePublicPluginSource(source);
    expectedHash = expectedHash || parsed.sha256;
    const { bundle, sha256 } = await fetchPublicBundle(source, options.publicDeps);
    const decoded = decodeBundle(bundle, { expectedSha256: expectedHash });
    computedSha = sha256;
    entries = decoded.entries;
  }
  // 3. Bundled or local path / ID
  else if (typeof source === 'string') {
    let candidateDir = null;

    if (source.startsWith('bundled:')) {
      sourceType = 'bundled';
      const pluginId = source.replace('bundled:', '');
      candidateDir = path.join(bundledPluginsDir(), pluginId);
    } else if (fs.existsSync(source)) {
      sourceType = 'local';
      candidateDir = path.resolve(source);
    } else {
      // Check if it's an installed or bundled plugin by ID
      const installed = getPlugin(source, options.projectRoot || process.cwd());
      if (installed && fs.existsSync(installed.dir)) {
        sourceType = installed.scope === 'bundled' ? 'bundled' : 'local';
        candidateDir = installed.dir;
      } else {
        const bundledDir = path.join(bundledPluginsDir(), source);
        if (fs.existsSync(bundledDir)) {
          sourceType = 'bundled';
          candidateDir = bundledDir;
        }
      }
    }

    if (!candidateDir || !fs.existsSync(candidateDir)) {
      throw new Error(`Cannot resolve capability plugin source: '${source}' (path or plugin does not exist)`);
    }

    const scan = scanAndVerifyDirectory(candidateDir);
    computedSha = scan.sha256;
    entries = scan.entries;
  } else {
    throw new Error(`Invalid capability plugin source: ${typeof source}`);
  }

  // Verify hash pin if provided
  if (expectedHash && computedSha !== expectedHash) {
    const err = new Error(
      `Capability source hash mismatch: expected '${expectedHash}', but computed '${computedSha}'`
    );
    err.name = 'SourceHashMismatchError';
    err.expected = expectedHash;
    err.actual = computedSha;
    throw err;
  }

  // Parse and validate plugin manifest
  const manifestEntry = entries.find((e) => e.path === 'plugin.json');
  if (!manifestEntry) {
    throw new Error(`Capability source is missing 'plugin.json' manifest.`);
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestEntry.data.toString('utf8'));
  } catch (parseErr) {
    throw new Error(`Malformed plugin.json manifest: ${parseErr.message}`);
  }

  const validation = validatePluginManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Invalid plugin manifest in source: ${validation.errors.join('; ')}`);
  }

  // Stage extracted files
  let stagedDir = options.stagingDir;
  let isTemp = false;
  if (!stagedDir) {
    stagedDir = fs.mkdtempSync(path.join(os.tmpdir(), `tr-cap-source-${manifest.id}-`));
    isTemp = true;
  }

  extractEntriesSafely(entries, stagedDir);

  const fileDescriptors = entries.map((e) => ({
    path: e.path,
    size: e.size || e.data.length,
    sha256: crypto.createHash('sha256').update(e.data).digest('hex')
  }));

  const totalBytes = fileDescriptors.reduce((sum, f) => sum + f.size, 0);

  return {
    id: manifest.id,
    version: manifest.version,
    manifest,
    sourceUri,
    sourceType,
    sha256: computedSha,
    fileCount: entries.length,
    sizeBytes: totalBytes,
    stagedDir,
    files: fileDescriptors,
    cleanup: () => {
      if (isTemp && fs.existsSync(stagedDir)) {
        try {
          fs.rmSync(stagedDir, { recursive: true, force: true });
        } catch {}
      }
    }
  };
}
