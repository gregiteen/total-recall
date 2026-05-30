import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();

console.error('🚀 Starting Automated Release Verifier...');

// Helper to run a command and return success status
function runCommand(command, args = [], opts = {}) {
  console.error(`👉 Running: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: opts.cwd || ROOT });
  return result.status === 0;
}

// 1. Run Tests
console.error('\n🔍 Phase 1: Running Vitest test suite...');
if (!runCommand('npm', ['test'])) {
  console.error('❌ Tests failed! Fix test issues before releasing.');
  process.exit(1);
}
console.error('✅ Tests passed successfully.');

// 2. Run Lint checks
console.error('\n🔍 Phase 2: Running code quality lint checks...');
if (!runCommand('node', ['.agent/skills/code-quality/scripts/start-here-lint.mjs'])) {
  console.error('❌ Lint checks failed! Fix issues before releasing.');
  process.exit(1);
}
console.error('✅ Lint check passed successfully.');

// 3. Run Type checks
console.error('\n🔍 Phase 3: Running TypeScript compiler check...');
if (!runCommand('node', ['.agent/skills/code-quality/scripts/start-here-ts.mjs'])) {
  console.error('❌ TypeScript checks failed! Fix issues before releasing.');
  process.exit(1);
}
console.error('✅ TypeScript compiler check passed successfully.');

// 4. Validate package.json exists
console.error('\n🔍 Phase 4: Checking package.json structure...');
const pkgPath = path.join(ROOT, 'package.json');
if (!fs.existsSync(pkgPath)) {
  console.error('❌ package.json not found!');
  process.exit(1);
}

try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  console.error(`📦 Package Name: ${pkg.name}`);
  console.error(`🔢 Current Version: ${pkg.version}`);
} catch (err) {
  console.error(`❌ package.json is invalid JSON: ${err.message}`);
  process.exit(1);
}

// 5. Sync scaffold from live .agent/
console.error('\n🔍 Phase 5: Syncing scaffold from live .agent/ ...');
if (!runCommand('node', ['scripts/sync-scaffold.mjs'])) {
  console.error('❌ Scaffold sync failed!');
  process.exit(1);
}

// Check if scaffold sync created uncommitted changes
const diffCheck = spawnSync('git', ['diff', '--name-only', 'scaffold/'], { encoding: 'utf8', cwd: ROOT });
if (diffCheck.stdout && diffCheck.stdout.trim()) {
  console.error('⚠️  Scaffold had uncommitted drift! Files synced:');
  console.error(diffCheck.stdout.trim().split('\n').map(f => `   ${f}`).join('\n'));
  console.error('   → Stage and commit these before publishing.');
}
console.error('✅ Scaffold sync check passed.');

// 6. Rebuild frontend dist
console.error('\n🔍 Phase 6: Rebuilding frontend...');
const frontendDir = path.join(ROOT, 'frontend');
if (fs.existsSync(path.join(frontendDir, 'package.json'))) {
  if (!runCommand('npm', ['run', 'build'], { cwd: frontendDir })) {
    console.error('❌ Frontend build failed! Run: cd frontend && npm run build');
    process.exit(1);
  }
  console.error('✅ Frontend rebuilt successfully.');
} else {
  console.error('⏭️  No frontend/package.json — skipping.');
}

console.error('\n🎉 Pre-release quality checks complete! You are ready to run:');
console.error('  1. npm version <patch|minor|major>');
console.error('  2. node .agent/skills/push/scripts/publish.mjs');
