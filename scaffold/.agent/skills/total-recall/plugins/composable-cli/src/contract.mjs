import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Standard Composable CLI v2 Command Contract
 *
 * Exit codes:
 * 0: Success
 * 1: Failure / Error
 * 2: Usage / Bad arguments
 * 3: Risk gate abstained / Dry-run
 */
export const EXIT_CODES = {
  OK: 0,
  ERROR: 1,
  USAGE: 2,
  ABSTAIN: 3,
};

export function wrapCommandExecution(options = {}) {
  const {
    name,
    description = '',
    handler,
    backgroundAllowed = false,
  } = options;

  return async function run(argv = process.argv, direct = false) {
    const args = argv.slice(direct ? 2 : 3);
    const json = args.includes('--json');

    if (args.includes('--help') || args.includes('-h')) {
      const usage = `Usage: total-recall ${name} [args…] [--json]${backgroundAllowed ? ' [--background]' : ''}\n\n${description}`;
      if (json) {
        console.log(JSON.stringify({ ok: true, name, description, usage, background_allowed: backgroundAllowed }));
      } else {
        console.log(usage);
      }
      return;
    }

    try {
      if (args.includes('--background')) {
        if (!backgroundAllowed) {
          const err = new Error('Background execution is not enabled for this command');
          err.exitCode = EXIT_CODES.USAGE;
          throw err;
        }

        const reportsDir = path.join(process.cwd(), '.agent', 'reports');
        fs.mkdirSync(reportsDir, { recursive: true, mode: 0o700 });
        const report = path.join(reportsDir, `${name}-${crypto.randomUUID()}.log`);
        const fd = fs.openSync(report, 'wx', 0o600);

        const cleanArgs = args.filter((a) => a !== '--background');
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...cleanArgs], {
          detached: true,
          stdio: ['ignore', fd, fd],
        });
        fs.closeSync(fd);
        child.unref();

        const status = { ok: true, pid: child.pid, report };
        if (json) console.log(JSON.stringify(status));
        else console.log(`Started ${name} in background (pid ${child.pid}); report: ${report}`);
        return status;
      }

      const handlerArgs = args.filter((arg) => arg !== '--json');
      const result = await handler(handlerArgs, { json, rawArgv: argv });
      const exitCode = Number.isInteger(result?.exitCode) ? result.exitCode : EXIT_CODES.OK;

      if (json) {
        console.log(JSON.stringify({
          ok: exitCode === EXIT_CODES.OK,
          exit_code: exitCode,
          result: result?.data ?? result ?? null,
        }));
      }
      process.exitCode = exitCode;
      return result;
    } catch (error) {
      const exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : EXIT_CODES.ERROR;
      if (json) {
        console.log(JSON.stringify({ ok: false, exit_code: exitCode, error: error.message }));
      } else {
        console.error(`Error: ${error.message}`);
      }
      process.exitCode = exitCode;
    }
  };
}

/**
 * Detect whether a command file is v2 (export const meta present).
 *
 * @param {string} filePath
 * @returns {boolean}
 */
export function isV2Command(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return /export\s+const\s+meta\s*=/.test(content);
  } catch {
    return false;
  }
}
