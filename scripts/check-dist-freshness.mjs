#!/usr/bin/env node
/**
 * Refuses to publish a tarball whose dashboard bundle is older than the
 * dashboard sources.
 *
 * `frontend/dist/` is gitignored but listed in package.json `files`, so the
 * tarball takes whatever build happens to be sitting on the publishing
 * machine's disk. Nothing connected the two: 3.23.0 and 3.23.1 shipped the
 * mesh access UI as source alongside a bundle built five days earlier, so the
 * served dashboard did not have the feature those releases were about. Neither
 * the test suite nor the quality gates can see this — the sources are correct,
 * and the stale bundle is not compiled from them.
 *
 * This checks rather than builds on purpose. Building here would run vite on
 * whatever machine publishes, and on this project that is a laptop where heavy
 * builds are not permitted. A check names the problem and leaves the build
 * where it belongs.
 */
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist']);

/**
 * Newest mtime under a file or directory, and the path carrying it.
 * Missing paths contribute nothing rather than failing — vite.config.ts and
 * friends are allowed not to exist.
 */
export async function newestUnder(target) {
  let info;
  try {
    info = await stat(target);
  } catch {
    return null;
  }

  if (info.isFile()) return { path: target, mtimeMs: info.mtimeMs };

  let best = null;
  const entries = await readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
    const found = await newestUnder(path.join(target, entry.name));
    if (found && (!best || found.mtimeMs > best.mtimeMs)) best = found;
  }
  return best;
}

/**
 * Whether the built bundle can be trusted to represent the sources.
 * Returns { ok, reason, bundle, source } — never throws, never prints, so the
 * decision can be tested apart from how it is reported.
 */
export async function checkDistFreshness({ distDir, sourcePaths }) {
  const bundle = await newestUnder(distDir);
  if (!bundle) return { ok: false, reason: 'missing-bundle', bundle: null, source: null };

  let source = null;
  for (const candidate of sourcePaths) {
    const found = await newestUnder(candidate);
    if (found && (!source || found.mtimeMs > source.mtimeMs)) source = found;
  }

  if (source && source.mtimeMs > bundle.mtimeMs) {
    return { ok: false, reason: 'stale-bundle', bundle, source };
  }
  return { ok: true, reason: 'current', bundle, source };
}

/** Sources whose change should invalidate the bundle. */
export function defaultTargets(root = ROOT) {
  return {
    distDir: path.join(root, 'frontend', 'dist'),
    sourcePaths: [
      path.join(root, 'frontend', 'src'),
      path.join(root, 'frontend', 'index.html'),
      path.join(root, 'frontend', 'vite.config.ts'),
      path.join(root, 'frontend', 'package.json'),
    ],
  };
}

async function main() {
  const result = await checkDistFreshness(defaultTargets());
  const rel = (p) => path.relative(ROOT, p);

  if (result.reason === 'missing-bundle') {
    console.error('❌ No dashboard bundle at frontend/dist — the published package would serve nothing.');
    console.error('   Build it, then publish:  npm --prefix frontend run build');
    process.exitCode = 1;
    return;
  }

  if (result.reason === 'stale-bundle') {
    const drift = Math.round((result.source.mtimeMs - result.bundle.mtimeMs) / 60000);
    console.error('❌ The dashboard bundle is older than the dashboard sources.');
    console.error(`   newest source: ${rel(result.source.path)}  (${new Date(result.source.mtimeMs).toLocaleString()})`);
    console.error(`   newest bundle: ${rel(result.bundle.path)}  (${new Date(result.bundle.mtimeMs).toLocaleString()})`);
    console.error(`   bundle is ${drift} minute(s) behind.`);
    console.error('');
    console.error('   Publishing now would ship the new source with an old served dashboard,');
    console.error('   which is how 3.23.0 and 3.23.1 shipped without their own mesh access UI.');
    console.error('   Rebuild (on a build host, not the laptop), then publish:');
    console.error('     npm --prefix frontend run build');
    process.exitCode = 1;
    return;
  }

  console.log(`✅ Dashboard bundle is current (built ${new Date(result.bundle.mtimeMs).toLocaleString()}).`);
}

// Only run as a CLI, so importing it in a spec does not exit the runner.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
