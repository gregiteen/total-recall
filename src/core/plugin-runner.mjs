/**
 * Run a plugin's CLI handler in a separate Node process.
 *
 * The dashboard runner used to import() handlers into the brain server and
 * swap console.log process-wide to capture output: a plugin calling
 * process.exit() stopped the server, and concurrent runs interleaved output.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKAGE_ROOT } from './plugin-loader.mjs';

const CHILD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'plugin-runner-child.mjs');
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_OUTPUT_BYTES = 256 * 1024;

/**
 * @param {object} plugin  A discovered plugin ({ id, dir, manifest }).
 * @param {{ subcommand?: string, args?: string[], cwd?: string, timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, exitCode: number|null, signal: string|null, timedOut: boolean, truncated: boolean, output: string, durationMs: number }>}
 */
export function runPluginCommand(plugin, options = {}) {
  const { subcommand = '', args = [], cwd = process.cwd(), timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const handlerRel = plugin?.manifest?.cli?.handler;
  if (!handlerRel) return Promise.reject(new Error(`Plugin ${plugin?.id} does not declare a CLI handler`));

  const handler = path.resolve(plugin.dir, handlerRel);
  const rel = path.relative(fs.realpathSync(plugin.dir), fs.existsSync(handler) ? fs.realpathSync(handler) : handler);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return Promise.reject(new Error(`Plugin ${plugin.id} handler resolves outside the plugin directory`));
  }
  if (!fs.existsSync(handler)) return Promise.reject(new Error(`Plugin CLI handler file not found: ${handler}`));

  const command = plugin.manifest.cli.command || plugin.id;
  const safeArgs = (Array.isArray(args) ? args : []).map(String);
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
      env: {
        ...process.env,
        TR_PACKAGE_ROOT: PACKAGE_ROOT,
        TR_PLUGIN_ID: plugin.id,
        TR_PLUGIN_DIR: plugin.dir,
        FORCE_COLOR: '0',
        NO_COLOR: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const collect = (buf) => {
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

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
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
