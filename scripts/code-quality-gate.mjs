/**
 * scripts/code-quality-gate.mjs
 *
 * Git quality gate that queries our sovereign /code-quality background checkers.
 * Never executes raw eslint or tsc directly; instead, reads and pulls verification
 * statuses directly from typescript-fullrepo-errors.txt and lint-status.txt.
 */

import { readFile } from 'node:fs/promises';
import { exec } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../');

const REPORT_TS = path.join(ROOT, 'typescript-fullrepo-errors.txt');
const REPORT_LINT = path.join(ROOT, 'lint-status.txt');

// Standard ANSI colors for rich CLI aesthetics
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

async function parseReportErrors(filePath) {
  try {
    const data = await readFile(filePath, 'utf8');
    const totalMatch = data.match(/^TOTAL_ERRORS:\s*(\d+)/m);
    const exitMatch = data.match(/^EXIT_CODE:\s*(\d+)/m);
    
    return {
      exists: true,
      errors: totalMatch ? parseInt(totalMatch[1], 10) : null,
      exitCode: exitMatch ? parseInt(exitMatch[1], 10) : null
    };
  } catch {
    return { exists: false, errors: null, exitCode: null };
  }
}

async function runFastStep(name, command) {
  console.log(`\n${colors.bold}${colors.cyan}🔄 Running: ${name}...${colors.reset}`);
  console.log(`${colors.yellow}Command: ${command}${colors.reset}\n`);

  try {
    const { stdout, stderr } = await execAsync(command, { cwd: ROOT });
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
  console.log(`Pulling validation statuses from continuous /code-quality background checkers...`);

  // Step 1: Check TypeScript Errors Status
  const tsStatus = await parseReportErrors(REPORT_TS);
  if (!tsStatus.exists) {
    console.error(`\n${colors.bold}${colors.red}🚨 PUSH ABORTED: TypeScript report file not found!${colors.reset}`);
    console.error(`👉 Please run: node .agent/skills/code-quality/scripts/start-here-ts.mjs`);
    process.exit(1);
  }
  
  if (tsStatus.errors !== 0 || tsStatus.exitCode !== 0) {
    console.error(`\n${colors.bold}${colors.red}🚨 PUSH ABORTED: TypeScript continuous checker reports errors!${colors.reset}`);
    console.error(`Active TypeScript Errors: ${colors.bold}${tsStatus.errors}${colors.reset}`);
    console.error(`👉 Please run to inspect: node .agent/skills/code-quality/scripts/start-here-ts.mjs`);
    process.exit(1);
  }
  console.log(`${colors.bold}${colors.green}✅ Continuous TypeScript Check passed! (0 errors)${colors.reset}`);

  // Step 2: Check Lint Errors Status
  const lintStatus = await parseReportErrors(REPORT_LINT);
  if (!lintStatus.exists) {
    console.error(`\n${colors.bold}${colors.red}🚨 PUSH ABORTED: Lint status report file not found!${colors.reset}`);
    console.error(`👉 Please run: node .agent/skills/code-quality/scripts/start-here-lint.mjs`);
    process.exit(1);
  }

  if (lintStatus.errors !== 0 || lintStatus.exitCode !== 0) {
    console.error(`\n${colors.bold}${colors.red}🚨 PUSH ABORTED: ESLint continuous checker reports issues!${colors.reset}`);
    console.error(`Active Lint Issues: ${colors.bold}${lintStatus.errors}${colors.reset}`);
    console.error(`👉 Please run to inspect: node .agent/skills/code-quality/scripts/start-here-lint.mjs`);
    process.exit(1);
  }
  console.log(`${colors.bold}${colors.green}✅ Continuous ESLint Check passed! (0 errors)${colors.reset}`);

  // Step 3: Run Vitest Unit/Integration Tests (extremely fast, zero raw tsc/eslint)
  const vitestOk = await runFastStep(
    'Root Test Suite (Vitest)',
    'npx vitest run'
  );
  if (!vitestOk) {
    console.error(`\n${colors.bold}${colors.red}🚨 PUSH ABORTED: Unit/Integration tests failed.${colors.reset}\n`);
    process.exit(1);
  }

  // Step 4: Validate SSSS Vault Nodes (Zod schemas, very fast, zero raw tsc/eslint)
  const vaultOk = await runFastStep(
    'SSSS Vault Validation (Zod schemas)',
    'node bin/total-recall.mjs lint --strict'
  );
  if (!vaultOk) {
    console.error(`\n${colors.bold}${colors.red}🚨 PUSH ABORTED: SSSS Vault schema validation failed.${colors.reset}\n`);
    process.exit(1);
  }

  console.log(`\n${colors.bold}${colors.green}🎉 ALL SOVEREIGN QUALITY CHECKS PASSED! Code is 100% safe to push.${colors.reset}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\n🚨 Unexpected crash in quality gate checker:\n', err);
  process.exit(1);
});
