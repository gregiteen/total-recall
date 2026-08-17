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
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

console.log('🔍 Pre-push: running quality checks...');

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
