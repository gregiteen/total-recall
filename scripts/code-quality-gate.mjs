#!/usr/bin/env node
/**
 * Pre-push quality gate.
 * All quality checks are handled by the release verification script
 * (node .agent/skills/push/scripts/release.mjs) which runs tests,
 * lint, and TypeScript checks before version bumping.
 *
 * This gate delegates to the code-quality skill scripts.
 */
import { execSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

try {
  console.log('🔍 Pre-push: running quality checks...');
  execSync('node .agent/skills/code-quality/scripts/start-here-lint.mjs', { cwd: root, stdio: 'inherit' });
  execSync('node .agent/skills/code-quality/scripts/start-here-ts.mjs', { cwd: root, stdio: 'inherit' });
  console.log('✅ Pre-push quality gate passed.');
} catch (err) {
  console.error('❌ Pre-push quality gate failed.');
  process.exit(1);
}
