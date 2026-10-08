#!/usr/bin/env node
/**
 * Pre-push quality gate.
 *
 * Delegates to the code-quality skill's one-shot runner. Which gates exist is
 * the skill's business, not this file's — read
 * .agent/skills/code-quality/config.json to see them. Naming individual
 * checker scripts here is what broke this hook when the checker was rebuilt:
 * it went on invoking start-here-lint.mjs / start-here-ts.mjs long after those
 * were deleted, so every push failed with MODULE_NOT_FOUND.
 *
 * Exit contract of check.mjs:
 *   0 = clean   1 = findings   2 = a gate could not run (never treat as clean)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const configFile = resolve(root, '.agent/skills/code-quality/config.json');
const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
const remoteNode = process.env.TR_CODE_QUALITY_NODE || config.remoteNode;
const remoteRepo = process.env.TR_CODE_QUALITY_REMOTE_REPO || config.remoteRepo;
const remotePath = process.env.TR_CODE_QUALITY_REMOTE_PATH || config.remotePath;
const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
function mesh(command) {
  return spawnSync(process.execPath, [resolve(root, 'bin/total-recall.mjs'), 'mesh', 'ssh', remoteNode, command], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}

console.log('🔍 Pre-push: running quality checks...');
if (remoteNode) {
  if (!remoteRepo) throw new Error('Configured remote gates require a remote source snapshot path');
  const identity = spawnSync(process.execPath, [resolve(root, 'scripts/release-source-identity.mjs')], { cwd: root, encoding: 'utf8' });
  if (identity.status !== 0) throw new Error(identity.stderr || 'Cannot identify local source');
  const prefix = `${remotePath ? `export PATH=${quote(remotePath)}:$PATH; ` : ''}cd ${quote(remoteRepo)} && `;
  const observed = mesh(prefix + 'node scripts/release-source-identity.mjs');
  if (observed.status !== 0 || !observed.stdout.includes(identity.stdout.trim())) {
    console.error('❌ Remote source does not match this working tree. Refresh the sanctioned snapshot before pushing.');
    process.exit(1);
  }
  const run = mesh(prefix + 'sh -c \'node .agent/skills/code-quality/scripts/check.mjs --tier fast > /tmp/tr-prepush-gate.log 2>&1 & gate_pid=$!; wait "$gate_pid"; gate_rc=$?; cat /tmp/tr-prepush-gate.log; exit "$gate_rc"\'');
  process.stdout.write(run.stdout || '');
  process.stderr.write(run.stderr || '');
  if (run.error || run.status !== 0) {
    console.error('❌ Current-source remote pre-push gates failed.');
    process.exit(1);
  }
  console.log('✅ Current-source remote pre-push gates passed.');
  process.exit(0);
}

const run = spawnSync(
  process.execPath,
  ['.agent/skills/code-quality/scripts/check.mjs'],
  { cwd: root, stdio: 'inherit' }
);

if (run.error) {
  console.error(`❌ Pre-push gate could not run: ${run.error.message}`);
  process.exit(1);
}

if (run.status === 0) {
  console.log('✅ Pre-push quality gate passed.');
  process.exit(0);
}

console.error(
  run.status === 2
    ? '❌ A quality gate failed to run. This is not a clean result — see:\n' +
      '   node .agent/skills/code-quality/scripts/report.mjs'
    : '❌ Quality gate found blocking errors. Inspect them with:\n' +
      '   node .agent/skills/code-quality/scripts/report.mjs'
);
process.exit(1);
