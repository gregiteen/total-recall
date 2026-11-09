import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

/** The host owns the state path and the SSSS implementation. */
export async function stateStore(ctx, name) {
  const dir = ctx.env.TR_PLUGIN_STATE_DIR;
  if (!dir || !path.isAbsolute(dir)) throw new Error('TR_PLUGIN_STATE_DIR must be supplied by the Total Recall host');
  const root = ctx.env.TR_PACKAGE_ROOT;
  let modulePath;
  if (root) {
    if (!path.isAbsolute(root) || JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).name !== 'total-recall-brain') {
      throw new Error('Invalid Total Recall state host');
    }
    modulePath = path.join(root, 'src/core/plugin-state-store.mjs');
  } else modulePath = require.resolve('total-recall-brain/src/core/plugin-state-store.mjs');
  const { PluginStateStore } = await import(pathToFileURL(modulePath).href);
  return new PluginStateStore(path.join(dir, name), 'git');
}

/** Never forward service output or errors. Auth output can contain a secret. */
export function tr(args, ctx) {
  return spawnSync(ctx.env.GIT_PLUGIN_TR_BIN || 'total-recall', args, {
    cwd: ctx.cwd, env: ctx.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000, maxBuffer: 16 * 1024 * 1024, shell: false,
  });
}

export function jsonResult(result, reason) {
  if (result.status !== 0 || result.error || result.signal) throw new Error(reason);
  try { return JSON.parse(result.stdout); } catch { throw new Error(reason); }
}

export function emit(ctx, value, text) {
  console.log(ctx.json ? JSON.stringify(value, null, 2) : text);
}
