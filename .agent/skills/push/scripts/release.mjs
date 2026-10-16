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
const skipTests = process.argv.includes('--skip-tests') || process.env.SKIP_TESTS === '1';
if (skipTests) {
  console.error('\n🔍 Phase 1: Skipping heavy Vitest test suite on laptop (runs on Mac Mini/remote CI).');
} else {
  console.error('\n🔍 Phase 1: Running Vitest test suite...');
  if (!runCommand('npm', ['test'])) {
    console.error('❌ Tests failed! Fix test issues before releasing (or pass --skip-tests on laptop).');
    process.exit(1);
  }
  console.error('✅ Tests passed successfully.');
}

// 1.5 Run Project Verification Gate
console.error('\n🔍 Phase 1.5: Running project structure verification gate...');
if (!runCommand('node', ['scripts/verify-projects.mjs'])) {
  console.error('❌ Project verification failed! Every .mjs and .tsx must have a test spec.');
  process.exit(1);
}
console.error('✅ Project verification gate passed.');

// 1.6 Shipped-scaffold state gate
console.error('\n🔍 Phase 1.6: Checking the shipped scaffold carries no per-brain state...');
if (!runCommand('node', ['scripts/check-scaffold-state.mjs'])) {
  console.error('❌ The scaffold would publish one brain\'s state, or the travelling manifest has drifted.');
  process.exit(1);
}

// 2. Run Code Quality Checks
console.error('\n🔍 Phase 2: Running code quality gates...');
if (!runCommand('node', ['.agent/skills/code-quality/scripts/check.mjs', '--tier', 'fast'])) {
  console.error('❌ Code quality checks failed! Fix issues before releasing.');
  process.exit(1);
}
console.error('✅ Code quality checks passed successfully.');

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

// 7. Check Project Trackers for unfinished work
console.error('\n🔍 Phase 7: Checking project trackers for unfinished tasks...');
const trackerCheck = spawnSync('grep', ['-rn', '\\[ \\]', 'docs/projects/in-progress/'], { encoding: 'utf8', cwd: ROOT });

// grep exits 0 if it finds matches (meaning we HAVE unchecked boxes)
if (trackerCheck.status === 0) {
  console.error('❌ FATAL: Found unfinished tasks in active project trackers!');
  console.error('   You cannot release until all projects are completed (or tasks are formally deferred out of in-progress).');
  console.error('\nUnfinished tasks found:');
  console.error(trackerCheck.stdout.trim().split('\n').map(l => `   ${l}`).join('\n'));
  process.exit(1);
}
console.error('✅ All active project trackers are marked complete.');

console.error('\n🎉 Pre-release quality checks complete! You are ready to run:');
console.error('  1. npm version <patch|minor|major>');
console.error('  2. node .agent/skills/push/scripts/publish.mjs');
