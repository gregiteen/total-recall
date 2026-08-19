#!/usr/bin/env node
/**
 * Verify the SSSS registry the host composes still matches its committed lock.
 *
 * The gate previously ran `npx ssss registry verify` with no --lock, which is a
 * usage error: it printed "verify requires --lock <file>" and exited 1 every
 * time, so it never verified anything. A gate that cannot pass is the same as a
 * gate that cannot fail — nobody reads its output after the first week.
 *
 * `ssss registry verify` also exits 0 whether or not the integrity matches, so
 * the verdict has to come from the `valid` field rather than the exit code.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = path.join(ROOT, 'ssss-registry.lock.json');

if (!fs.existsSync(LOCK)) {
  console.error(`ssss-registry: lock file missing at ${path.relative(ROOT, LOCK)}`);
  console.error('Regenerate with: npx ssss registry lock --out ssss-registry.lock.json');
  process.exit(1);
}

const result = spawnSync('npx', ['ssss', 'registry', 'verify', '--lock', LOCK], {
  cwd: ROOT,
  encoding: 'utf8',
});

if (result.error) {
  console.error(`ssss-registry: could not run the verifier: ${result.error.message}`);
  process.exit(1);
}

const stdout = (result.stdout || '').trim();
let verdict;
try {
  verdict = JSON.parse(stdout);
} catch {
  console.error('ssss-registry: verifier produced no parseable verdict.');
  console.error(stdout || result.stderr || '(no output)');
  process.exit(1);
}

if (verdict.valid !== true) {
  console.error('ssss-registry: composed registry does not match the lock.');
  console.error(`  live registry: ${verdict.expected_integrity}`);
  console.error(`  lock file:     ${verdict.actual_integrity}`);
  console.error('');
  console.error('The installed @ssss/cli registry changed under the host. Review the');
  console.error('diff, then re-lock: npx ssss registry lock --out ssss-registry.lock.json');
  process.exit(1);
}

// The spec version lives in the lock, not the verifier's verdict.
let specVersion = 'unknown';
try {
  specVersion = JSON.parse(fs.readFileSync(LOCK, 'utf8')).core_spec_version || 'unknown';
} catch { /* the verify above already proved the file parses */ }

console.log(`ssss-registry: OK — spec ${specVersion}, integrity matches lock.`);
process.exit(0);
