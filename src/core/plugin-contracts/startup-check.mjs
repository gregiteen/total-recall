/**
 * `startup_check`: a read command a plugin contributes to `startup check` and
 * `brief`, so something the plugin owns that needs attention is visible when a
 * session starts. Core runs it and prints what it says; it never inspects the
 * plugin's domain itself.
 *
 *   "startup_check": { "command": "unmerged", "args": ["--json"], "timeout_ms": 15000 }
 *
 * The command prints one JSON object: { ok: boolean, outstanding: integer,
 * summary: string }. `outstanding` above zero means attention is needed and
 * `summary` says what and where, in one line.
 */
const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);
const ARG = /^[A-Za-z0-9][A-Za-z0-9._=:\/-]{0,127}$|^--?[a-z][a-z0-9-]{0,63}$/;
export const STARTUP_CHECK_MAX_TIMEOUT_MS = 30000;

/** @returns {string[]} errors */
export function validateStartupCheck(manifest) {
  const check = manifest?.startup_check;
  if (check === undefined) return [];
  if (!plain(check)) return ["'startup_check' must be an object"];
  const errors = [];
  const subs = Array.isArray(manifest.cli?.subcommands) ? manifest.cli.subcommands : [];
  const sub = subs.find((s) => s?.name === check.command);
  if (typeof check.command !== 'string' || !sub) errors.push("'startup_check.command' must name a declared cli subcommand");
  else if (sub.effect && sub.effect !== 'read') errors.push("'startup_check.command' must be a read command");
  if (check.args !== undefined && (!Array.isArray(check.args) || check.args.length > 8 || check.args.some((a) => typeof a !== 'string' || !ARG.test(a)))) {
    errors.push("'startup_check.args' must be at most 8 plain arguments");
  }
  if (check.timeout_ms !== undefined && (!Number.isInteger(check.timeout_ms) || check.timeout_ms < 1000 || check.timeout_ms > STARTUP_CHECK_MAX_TIMEOUT_MS)) {
    errors.push(`'startup_check.timeout_ms' must be an integer from 1000 to ${STARTUP_CHECK_MAX_TIMEOUT_MS}`);
  }
  return errors;
}

/**
 * Read a startup check's output. Anything other than the declared shape is
 * reported as unavailable, never as clean.
 * @returns {{ status: 'ok'|'attention'|'unavailable', outstanding?: number, summary?: string, reason?: string }}
 */
export function readStartupCheckOutput(stdout) {
  let body;
  try { body = JSON.parse(String(stdout || '').trim()); } catch { return { status: 'unavailable', reason: 'output is not JSON' }; }
  if (!plain(body) || typeof body.ok !== 'boolean' || !Number.isInteger(body.outstanding) || body.outstanding < 0 || typeof body.summary !== 'string') {
    return { status: 'unavailable', reason: 'output is not { ok, outstanding, summary }' };
  }
  if (!body.ok) return { status: 'unavailable', outstanding: body.outstanding, summary: body.summary.slice(0, 500), reason: 'the check reported a failure' };
  return { status: body.outstanding > 0 ? 'attention' : 'ok', outstanding: body.outstanding, summary: body.summary.slice(0, 500) };
}
