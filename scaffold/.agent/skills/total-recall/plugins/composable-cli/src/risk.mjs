/**
 * Risk Gate Module
 *
 * Risk classes and the dry-run / --yes gate for composable CLI commands.
 *
 * Risk classes:
 * - read:      No side effects. Runs by default.
 * - write:     Mutates local files only. Runs by default.
 * - money:     Affects financial state. Requires --yes to run.
 * - dns-cert:  Changes DNS records or TLS certificates. Requires --yes.
 * - production-deploy: Deploys to production. Requires --yes.
 * - secret-revoke:     Rotates/revokes credentials. Requires --yes.
 *
 * Flow:
 * 1. A command declares its risk class in export const meta = { risk: '...' }
 * 2. tr() checks hasRiskGate(risk) before calling the handler
 * 3. If gated and no --yes, calls dryRunResult() to get the plan, returns exit 3
 * 4. With --yes, the handler runs as normal
 * 5. Nested tr() calls inherit dryRun; a gated nested call without --yes
 *    fails the parent with exit 3
 */
import { EXIT_CODES } from './contract.mjs';

/** Risk classes that require --yes to execute */
export const GATED_RISKS = new Set([
  'money',
  'dns-cert',
  'production-deploy',
  'secret-revoke',
]);

/** All valid risk classes */
export const ALL_RISKS = new Set([
  'read',
  'write',
  ...GATED_RISKS,
]);

/**
 * Check whether a risk class requires the --yes gate.
 *
 * @param {string} risk
 * @returns {boolean}
 */
export function hasRiskGate(risk) {
  return GATED_RISKS.has(risk);
}

/**
 * Validate that a risk class is recognized.
 *
 * @param {string} risk
 * @throws {Error} If the risk class is not recognized
 */
export function validateRisk(risk) {
  if (!ALL_RISKS.has(risk)) {
    const err = new Error(`Unknown risk class "${risk}". Valid: ${[...ALL_RISKS].join(', ')}`);
    err.exitCode = EXIT_CODES.USAGE;
    throw err;
  }
  return risk;
}

/**
 * Run a handler in dry-run mode to obtain a plan.
 * The handler receives { dryRun: true } in its context and should
 * return a description of what it would change.
 *
 * @param {Function} handler - The v2 command handler
 * @param {string[]} args - Arguments
 * @param {object} context - Execution context { verb, json, dryRun, log }
 * @returns {Promise<object>} Plan data
 */
export async function dryRunResult(handler, args, context = {}) {
  const { verb, json, dryRun: _, log } = context;

  // Call the handler with dryRun: true
  const plan = await handler(args, { ...context, dryRun: true });

  const planOutput = {
    risk: 'gated',
    command: verb,
    args: args.filter((a) => a !== '--yes'),
    plan: plan?.data ?? plan ?? 'No plan returned by command',
    note: 'Run with --yes to execute',
  };

  if (json) {
    console.log(JSON.stringify({ ok: false, exit_code: EXIT_CODES.ABSTAIN, result: planOutput }));
  } else {
    console.log(`  ${verb} would make the following changes:`);
    console.log(JSON.stringify(planOutput.plan, null, 2));
    console.log(`\nPass --yes to execute.`);
  }

  process.exitCode = EXIT_CODES.ABSTAIN;
  return planOutput;
}

/**
 * Create an argv parser that looks for --yes and strips it.
 * Also removes --dry-run when dryRun is handled by the context.
 *
 * @param {string[]} args
 * @param {object} [options]
 * @param {boolean} [options.stripYes=true]
 * @param {boolean} [options.stripDryRun=true]
 * @returns {{ cleanArgs: string[], hasYes: boolean }}
 */
export function parseRiskArgs(args, { stripYes = true, stripDryRun = true } = {}) {
  let hasYes = false;
  let cleanArgs = args;
  if (stripYes) {
    cleanArgs = cleanArgs.filter((a) => {
      if (a === '--yes' || a === '-y') {
        hasYes = true;
        return false;
      }
      return true;
    });
  }
  if (stripDryRun) {
    cleanArgs = cleanArgs.filter((a) => a !== '--dry-run');
  }
  return { cleanArgs, hasYes };
}