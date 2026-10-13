/**
 * Run a plugin's CLI handler in a separate Node process.
 *
 * The dashboard runner used to import() handlers into the brain server and
 * swap console.log process-wide to capture output: a plugin calling
 * process.exit() stopped the server, and concurrent runs interleaved output.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKAGE_ROOT, resolvePluginFile } from './plugin-loader.mjs';
import { readPluginRecord } from './plugin-store.mjs';

const CHILD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'plugin-runner-child.mjs');
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_OUTPUT_BYTES = 256 * 1024;
export const MAX_INPUT_BYTES = 64 * 1024;

/** A credential is one declared string on stdin, never a command-line value. */
export function validatePluginSecretInput(plugin, subcommand, input) {
  if (input === undefined) return;
  if (typeof input !== 'string' || !input.length || Buffer.byteLength(input, 'utf8') > MAX_INPUT_BYTES) {
    throw new Error('Secret input must be a non-empty string of at most 65536 bytes');
  }
  const command = plugin?.manifest?.cli?.subcommands?.find(item => item.name === subcommand);
  const secrets = command?.args?.filter(arg => arg.secret === true) || [];
  if (secrets.length !== 1 || secrets[0].type !== 'string' || secrets[0].flag !== undefined) {
    throw new Error('Secret input requires exactly one declared stdin string argument');
  }
}

/**
 * @param {object} plugin  A discovered plugin ({ id, dir, manifest }).
 * @param {{ subcommand?: string, args?: string[], cwd?: string, timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, exitCode: number|null, signal: string|null, timedOut: boolean, truncated: boolean, output: string, durationMs: number }>}
 */
export function runPluginCommand(plugin, options = {}) {
  const { subcommand = '', args = [], cwd = process.cwd(), timeoutMs: requestedTimeoutMs, stdin = 'ignore', stdinText, composable = false, secretsBrainDir } = options;
  try { validatePluginSecretInput(plugin, subcommand, stdinText); }
  catch (err) { return Promise.reject(err); }
  const operation = subcommand || args[0];
  const declaredTimeout = plugin?.manifest?.cli?.subcommands?.find(item => item.name === operation)?.timeout_ms;
  const timeoutMs = requestedTimeoutMs ?? declaredTimeout ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) return Promise.reject(new Error('Plugin timeout must be 1..600000 ms'));
  const handlerRel = plugin?.manifest?.cli?.handler;
  if (!handlerRel) return Promise.reject(new Error(`Plugin ${plugin?.id} does not declare a CLI handler`));

  let handler;
  try { handler = resolvePluginFile(plugin.dir, handlerRel); }
  catch (err) { return Promise.reject(err); }

  const command = plugin.manifest.cli.command || plugin.id;
  const safeArgs = (Array.isArray(args) ? args : []).map(String);
  if (stdinText !== undefined && !safeArgs.includes('--stdin')) safeArgs.push('--stdin');
  const childArgv = [CHILD, handler, command, ...(subcommand ? [String(subcommand)] : []), ...safeArgs];

  return new Promise((resolve) => {
    const started = Date.now();
    const chunks = [];
    let bytes = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const child = spawn(process.execPath, childArgv, {
      cwd,
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        TR_PACKAGE_ROOT: PACKAGE_ROOT,
        TR_PLUGIN_ID: plugin.id,
        TR_PLUGIN_DIR: plugin.dir,
        TR_PLUGIN_CONFIG: JSON.stringify(readPluginRecord(plugin)?.configuration || {}),
        ...(plugin.pluginsDir ? { TR_PLUGIN_STATE_DIR: path.join(path.dirname(plugin.pluginsDir), 'plugin-state', plugin.id) } : {}),
        ...(secretsBrainDir ? { TR_SECRETS_BRAIN: secretsBrainDir } : {}),
        TR_PLUGIN_COMMAND_MODE: composable ? 'composable' : 'cli',
        FORCE_COLOR: '0',
        NO_COLOR: '1'
      },
      stdio: [stdinText !== undefined ? 'pipe' : stdin === 'inherit' ? 'inherit' : 'ignore', 'pipe', 'pipe']
    });

    const collect = (buf) => {
      // Even a faulty owner that echoes stdin cannot return credential material.
      if (stdinText !== undefined) return;
      if (truncated) return;
      if (bytes + buf.length > MAX_OUTPUT_BYTES) {
        chunks.push(buf.subarray(0, MAX_OUTPUT_BYTES - bytes));
        bytes = MAX_OUTPUT_BYTES;
        truncated = true;
        return;
      }
      chunks.push(buf);
      bytes += buf.length;
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    if (stdinText !== undefined) {
      // A handler may exit without reading; EPIPE must not crash the server.
      child.stdin.on('error', () => {});
      child.stdin.end(stdinText);
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* process already exited */ }
    }, timeoutMs);

    const finish = (exitCode, signal, spawnError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      let output = Buffer.concat(chunks).toString('utf8');
      if (spawnError) output += `${output ? '\n' : ''}[runner] ${spawnError.message}`;
      if (truncated) output += `\n[runner] output truncated at ${MAX_OUTPUT_BYTES} bytes`;
      if (timedOut) output += `\n[runner] killed after ${timeoutMs} ms`;
      resolve({
        ok: !spawnError && !timedOut && exitCode === 0,
        exitCode,
        signal,
        timedOut,
        truncated,
        output,
        durationMs: Date.now() - started
      });
    };

    // spawn reports a missing binary / bad cwd as an 'error' event, not a throw.
    child.on('error', (err) => finish(null, null, err));
    child.on('close', (code, signal) => finish(code, signal));
  });
}
