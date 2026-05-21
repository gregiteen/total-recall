/**
 * scripts/git-pre-push.mjs
 *
 * Local quality gate script executed before code is pushed to GitHub.
 * Replaces GitHub Actions workflows to prevent remote billing errors and mobile notifications.
 */

import { exec } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../');

// Standard ANSI colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

async function runStep(name, command, cwd = ROOT) {
  console.log(`\n${colors.bold}${colors.cyan}🔄 Running: ${name}...${colors.reset}`);
  console.log(`${colors.yellow}Command: ${command}${colors.reset}\n`);

  try {
    const { stdout, stderr } = await execAsync(command, { cwd });
    if (stdout.trim()) console.log(stdout);
    if (stderr.trim()) console.error(stderr);
    console.log(`${colors.bold}${colors.green}✅ ${name} passed!${colors.reset}`);
    return true;
  } catch (error) {
    console.error(`${colors.bold}${colors.red}❌ ${name} failed!${colors.reset}`);
    if (error.stdout && error.stdout.trim()) {
      console.error(`\n${colors.bold}Standard Output:${colors.reset}\n${error.stdout}`);
    }
    if (error.stderr && error.stderr.trim()) {
      console.error(`\n${colors.bold}Error Output:${colors.reset}\n${error.stderr}`);
    }
    return false;
  }
}

async function main() {
  console.log(`${colors.bold}${colors.magenta}🛡️  Total Recall Sovereign OS Pre-Push Quality Gate 🛡️${colors.reset}`);
  console.log(`Verifying codebase before push to avoid remote billing issues and broken code...`);

  // Step 1: Run Root Vitest Suite (Unit and Integration tests)
  const vitestOk = await runStep(
    'Root Test Suite (Vitest)',
    'npx vitest run'
  );
  if (!vitestOk) {
    console.error(`\n${colors.bold}${colors.red}🚨 PUSH ABORTED: Unit/Integration tests failed.${colors.reset}\n`);
    process.exit(1);
  }

  // Step 2: Validate Frontmatter & SSSS Vault Nodes
  const vaultOk = await runStep(
    'SSSS Vault Validation (Zod schemas)',
    'node bin/total-recall.mjs lint --strict'
  );
  if (!vaultOk) {
    console.error(`\n${colors.bold}${colors.red}🚨 PUSH ABORTED: SSSS Vault schema validation failed.${colors.reset}\n`);
    process.exit(1);
  }

  // Step 3: Frontend ESLint Syntax Checks
  const lintOk = await runStep(
    'Frontend Linting (ESLint)',
    'npx eslint . --max-warnings=0',
    path.join(ROOT, 'frontend')
  );
  if (!lintOk) {
    console.error(`\n${colors.bold}${colors.red}🚨 PUSH ABORTED: Frontend ESLint checks failed.${colors.reset}\n`);
    process.exit(1);
  }

  // Step 4: Frontend TypeScript Type-checking
  const tsOk = await runStep(
    'Frontend TypeScript Compile Check',
    'npx tsc -b --noEmit',
    path.join(ROOT, 'frontend')
  );
  if (!tsOk) {
    console.error(`\n${colors.bold}${colors.red}🚨 PUSH ABORTED: Frontend TypeScript checks failed.${colors.reset}\n`);
    process.exit(1);
  }

  console.log(`\n${colors.bold}${colors.green}🎉 ALL QUALITY CHECKS PASSED! Code is 100% safe to push.${colors.reset}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\n🚨 Unexpected crash in pre-push hook script:\n', err);
  process.exit(1);
});
