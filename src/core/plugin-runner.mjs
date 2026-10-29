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
import { pluginExecutionEnabled } from './plugin-state.mjs';
import { setPluginActive } from './plugin-activation.mjs';

const CHILD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'plugin-runner-child.mjs');
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_OUTPUT_BYTES = 256 * 1024;
// A terminal call (stdin inherited from the operator) is read by a person or an
// agent, not buffered by the server, so it gets the ceiling the host's other
// child processes use instead of the server's bound.
export const CLI_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
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
  const maxOutputBytes = options.maxOutputBytes ?? (stdin === 'inherit' ? CLI_MAX_OUTPUT_BYTES : MAX_OUTPUT_BYTES);
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > CLI_MAX_OUTPUT_BYTES) return Promise.reject(new Error(`Plugin output limit must be 1..${CLI_MAX_OUTPUT_BYTES} bytes`));
  try { validatePluginSecretInput(plugin, subcommand, stdinText); }
  catch (err) { return Promise.reject(err); }
  const operation = subcommand || args[0];
  if (operation === 'on' || operation === 'off') {
    return setPluginActive(plugin.id, operation === 'on', { projectRoot: cwd }).then(result => ({
      ok: result.compilation.ok, exitCode: result.compilation.ok ? 0 : 1,
      output: JSON.stringify(result), durationMs: 0, timedOut: false,
    }));
  }
  if (!pluginExecutionEnabled(plugin, { projectRoot: cwd }) && !['status', 'health', 'jobs', '--help', '-h', 'help'].includes(operation)) {
    return Promise.reject(new Error(`Plugin ${plugin.id} is inactive; run total-recall plugin on ${plugin.id}`));
  }
  // Manifests declare this as `timeoutMs`; the runner only read `timeout_ms`, so every declared
  // timeout was ignored and each command fell back to DEFAULT_TIMEOUT_MS (30s). That killed work
  // that legitimately takes longer — `mesh nodes` and `tr-transcribe transcribe` (model load) both
  // died at 30s while their manifests asked for far more. Accept both spellings.
  const declaration = plugin?.manifest?.cli?.subcommands?.find(item => item.name === operation);
  const declaredTimeout = declaration?.timeout_ms ?? declaration?.timeoutMs;
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
    const stdoutChunks=[],stderrChunks=[];
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

    const collect = (buf,stream) => {
      // Even a faulty owner that echoes stdin cannot return credential material.
      if (stdinText !== undefined) return;
      if (truncated) return;
      if (bytes + buf.length > maxOutputBytes) {
        const partial=buf.subarray(0, maxOutputBytes - bytes);chunks.push(partial);stream.push(partial);
        bytes = maxOutputBytes;
        truncated = true;
        return;
      }
      chunks.push(buf);
      stream.push(buf);
      bytes += buf.length;
    };
    child.stdout.on('data', buf=>collect(buf,stdoutChunks));
    child.stderr.on('data', buf=>collect(buf,stderrChunks));
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
      if (truncated) output += `\n[runner] output truncated at ${maxOutputBytes} bytes`;
      if (timedOut) output += `\n[runner] killed after ${timeoutMs} ms`;
      let stderr=Buffer.concat(stderrChunks).toString('utf8');
      if(spawnError)stderr+=`\n[runner] ${spawnError.message}`;
      if(truncated)stderr+=`\n[runner] output truncated at ${maxOutputBytes} bytes`;
      if(timedOut)stderr+=`\n[runner] killed after ${timeoutMs} ms`;
      resolve({
        ok: !spawnError && !timedOut && exitCode === 0,
        exitCode,
        signal,
        timedOut,
        truncated,
        output,
        stdout:Buffer.concat(stdoutChunks).toString('utf8'),
        stderr,
        durationMs: Date.now() - started
      });
    };

    // spawn reports a missing binary / bad cwd as an 'error' event, not a throw.
    child.on('error', (err) => finish(null, null, err));
    child.on('close', (code, signal) => finish(code, signal));
  });
}
