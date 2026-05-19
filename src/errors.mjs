/**
 * Total Recall Error Protocol v1
 *
 * Structured, machine-readable errors with stable codes and typed repair IDs.
 * Inspired by Zero lang's JSON-first diagnostics design.
 *
 * Output format:
 *   - TTY stderr  → human-readable with code suffix
 *   - Piped/agent → JSON object on stderr (one line)
 *   - TR_JSON_ERRORS=1 → force JSON regardless of TTY
 *
 * Error code ranges:
 *   TR-E1xxx  CLI / routing
 *   TR-E2xxx  Vault / filesystem
 *   TR-E3xxx  Compile / rebuild
 *   TR-E4xxx  Network / deploy
 *   TR-E5xxx  Server / auth
 */

export const ERROR_CODES = {
  // CLI / routing
  UNKNOWN_COMMAND:     { code: 'TR-E1001', hint: "Run 'total-recall --help' for available commands." },
  NOT_IMPLEMENTED:     { code: 'TR-E1002', hint: 'Check the project tracker for implementation status.' },
  BAD_ARGS:            { code: 'TR-E1003', hint: 'Run the command with --help to see valid options.' },
  HANDLER_CRASH:       { code: 'TR-E1004', hint: 'Report this at https://github.com/gregiteen/total-recall/issues' },

  // Vault / filesystem
  VAULT_NOT_FOUND:     { code: 'TR-E2001', hint: "Run 'total-recall init' to scaffold the memory vault." },
  NODE_PARSE_FAIL:     { code: 'TR-E2002', hint: 'Check the node file for valid SSSS YAML frontmatter.' },
  DRIFT_DETECTED:      { code: 'TR-E2003', hint: "Run 'total-recall rebuild' to repair index drift." },
  SKILL_NOT_FOUND:     { code: 'TR-E2004', hint: "Verify the skill exists in .agent/skills/." },

  // Compile / rebuild
  COMPILE_FAIL:        { code: 'TR-E3001', hint: 'Check surface.mjs logs for the failing node path.' },
  REBUILD_FAIL:        { code: 'TR-E3002', hint: 'Check vault for malformed nodes, then retry.' },
  SURFACE_CRASH:       { code: 'TR-E3003', hint: 'Ensure all nodes have required SSSS frontmatter fields.' },
  DRIFT_PERSIST:       { code: 'TR-E3004', hint: 'Post-rebuild drift indicates a corrupt canonical node.' },

  // Network / deploy
  SSH_TIMEOUT:         { code: 'TR-E4001', hint: 'Verify the host is reachable and SSH keys are authorized.' },
  PROVISION_FAIL:      { code: 'TR-E4002', hint: 'Check deploy logs and rerun with --verbose.' },
  SYNC_FAIL:           { code: 'TR-E4003', hint: 'Verify --brain URL and --token are correct.' },

  // Server / auth
  AUTH_FAIL:           { code: 'TR-E5001', hint: 'Verify the PAT or dashboard password.' },
  API_ERROR:           { code: 'TR-E5002', hint: 'Check server logs via the /logs endpoint.' },
};

export class TRError extends Error {
  /**
   * @param {keyof typeof ERROR_CODES} repair  Stable repair ID (machine-readable)
   * @param {string} message                   Human-readable description
   * @param {object} [context]                 Structured key/value context for agents
   * @param {Error}  [cause]                   Upstream error
   */
  constructor(repair, message, context = {}, cause = null) {
    super(message);
    this.name = 'TRError';
    const entry = ERROR_CODES[repair];
    if (!entry) throw new Error(`Unknown repair ID: ${repair}`);
    this.code    = entry.code;
    this.repair  = repair;
    this.hint    = entry.hint;
    this.context = context;
    if (cause) this.cause = cause;
  }
}

function isJsonMode() {
  return process.env.TR_JSON_ERRORS === '1' || !process.stderr.isTTY;
}

/**
 * Emit a TRError (or plain Error) to stderr in the appropriate format,
 * then exit with code 1.
 *
 * @param {TRError|Error} err
 */
export function emitError(err) {
  if (isJsonMode()) {
    const payload = {
      protocol: 'total-recall/error-v1',
      code:     err.code    ?? 'TR-E1004',
      repair:   err.repair  ?? 'HANDLER_CRASH',
      message:  err.message,
      hint:     err.hint    ?? ERROR_CODES.HANDLER_CRASH.hint,
      context:  err.context ?? {},
      ts:       new Date().toISOString(),
    };
    if (err.cause?.message) payload.cause = err.cause.message;
    process.stderr.write(JSON.stringify(payload) + '\n');
  } else {
    const code  = err.code   ?? 'TR-E1004';
    const hint  = err.hint   ?? ERROR_CODES.HANDLER_CRASH.hint;
    process.stderr.write(`\n  error [${code}]: ${err.message}\n`);
    process.stderr.write(`  hint:  ${hint}\n\n`);
    if (err.cause) process.stderr.write(`  cause: ${err.cause.message}\n\n`);
  }
  process.exit(1);
}
