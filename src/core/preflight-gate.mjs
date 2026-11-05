/**
 * Harness-neutral gate decision. Every harness adapter normalises its native
 * hook payload into `{ tool, command, path, cwd }` and asks `decide`; the answer
 * is the same in every harness.
 *
 * Rules, in order:
 *   1. Tools that only display or discover (`meta`, `ui`) are always open.
 *   2. Reads of skill files are open: reading them is how the preflight is earned.
 *   3. A single plain Total Recall preflight, context, compact, recall, rules or help command is
 *      open, so the gate can always be satisfied or repaired. Chaining, piping,
 *      substitution and redirects are not plain, so the exemption cannot carry
 *      other work and a capsule cannot be truncated through a pipe.
 *   4. Everything else needs a fresh receipt for the directory.
 *   5. With a receipt, a repository-wide source sweep still needs a recent
 *      Total Recall consult (the rule DSH enforced alone until now).
 * Any error inside the gate denies: most harnesses fail open when a hook crashes.
 */
import { ACK_COMMAND } from './preflight-receipt.mjs';

export const TOOL_CLASSES = ['shell', 'read', 'write', 'search', 'web', 'mcp', 'agent', 'meta', 'ui', 'other'];
export const SWEEP_CONSULT_MS = 15 * 60 * 1000;

const SKILL_PATH = /\/\.(agent|claude)\/skills\//;
const SATISFYING = /^(cd\s+\S+\s*&&\s*)?(npx\s+)?(total-recall|node\s+\S*bin\/total-recall\.mjs)\s+(tr-preflight|preflight|context|compact|recall|rules|help|--help)(\s+[^;&|`<>$\n]*)?$/;

/** True when the whole command is one plain Total Recall invocation that satisfies or repairs the gate. */
export function isSatisfyingCommand(command) {
  return SATISFYING.test(String(command || '').trim());
}

/** A repository-wide search used to answer a question, as the DSH `tr-first.sh` rule defined it. */
export function isRepoSweep(command) {
  const c = String(command || '');
  if (c.includes('total-recall')) return false;
  const sweep = /(^|[\s;&|(])(rg|ripgrep|ag)\s/.test(c)
    || /(^|[\s;&|(])grep\s+(-[A-Za-z]*[rR][A-Za-z]*|--recursive)(\s|$)/.test(c)
    || /(^|[\s;&|(])find\s+(\.|\/Users)/.test(c)
    || /(^|[\s;&|(])git\s+grep(\s|$)/.test(c);
  if (!sweep) return false;
  if (/\|\s*(grep|rg|ag)(\s|$)/.test(c)) return false; // filtering command output is not a source question
  if (/node_modules|\.agent\/skills|\/tmp\/|\.git\//.test(c)) return false;
  return true;
}

const allow = (rule) => ({ decision: 'allow', rule });
const deny = (rule, reason, fix = ACK_COMMAND) => ({ decision: 'deny', rule, reason, fix });

/**
 * @param {{ tool: string, command?: string, path?: string, cwd?: string }} call
 * @param {{ check: () => { ok: boolean, problems: string[] }, recentConsult?: () => boolean, readablePaths?: RegExp[] }} deps
 */
export function decide(call, deps) {
  try {
    const tool = TOOL_CLASSES.includes(call?.tool) ? call.tool : 'other';
    if (tool === 'meta' || tool === 'ui') return allow(`class:${tool}`);
    if (tool === 'read') {
      const target = String(call.path || '');
      if (SKILL_PATH.test(target)) return allow('read:skill-file');
      // Persisted output of an allowed command is readable; each adapter names its host's paths (audit F-019).
      if ((deps.readablePaths || []).some((re) => re.test(target))) return allow('read:persisted-output');
    }
    if (tool === 'shell' && isSatisfyingCommand(call.command)) return allow('shell:satisfying-command');

    const receipt = deps.check();
    if (!receipt.ok) {
      return deny('receipt', `TR-PREFLIGHT gate: ${receipt.problems[0] || 'check failed'} (directory: ${call.cwd || 'unknown'}). `
        + 'No work may start until it passes. Read the complete context capsule (never pipe or truncate it), then acknowledge.');
    }
    if (tool === 'shell' && isRepoSweep(call.command) && !(deps.recentConsult ? deps.recentConsult() : false)) {
      return deny('sweep', 'TR-PREFLIGHT gate: do not sweep the repository for an answer; Total Recall owns it. Run `total-recall help "<task>"` to find the owning command, or `total-recall recall "<topic>" --local`, then repeat this call.',
        'total-recall help "<task>"');
    }
    return allow('receipt:fresh');
  } catch (err) {
    return deny('gate-error', `TR-PREFLIGHT gate error: ${err.message}. The gate fails closed.`);
  }
}
