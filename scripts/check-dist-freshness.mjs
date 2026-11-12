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
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDistFreshness, dashboardTargets, newestUnder } from '../src/core/dashboard-bundle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// One definition of a stale bundle, shared with the server that rebuilds it.
export { checkDistFreshness, newestUnder };

/** Sources whose change should invalidate the bundle. */
export function defaultTargets(root = ROOT) {
  return dashboardTargets(root);
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
