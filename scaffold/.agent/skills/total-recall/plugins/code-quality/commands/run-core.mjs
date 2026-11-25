/**
 * Run one of this plugin's core scripts against the current repository. The
 * core is never copied into a repo; the repo keeps only its state directory
 * (config.json, reports), found by core/state.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stateDir } from '../core/state.mjs';
import { nativeHostRoot } from '../core/host.mjs';

export const CORE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'core');

export function findSkillDir(start = process.cwd()) {
  return stateDir(start);
}

export function runCore(script, args, { quiet = false, cwd = process.cwd() } = {}) {
  if (!fs.existsSync(stateDir(cwd))) {
    const error = new Error('No code-quality state in this repository (.agent/skills/code-quality). Create configuration: total-recall code-quality detect --apply');
    error.exitCode = 2;
    throw error;
  }
  const host = process.env.TR_PACKAGE_ROOT || nativeHostRoot();
  const result = spawnSync(process.execPath, [path.join(CORE_DIR, script), ...args], {
    cwd,
    stdio: quiet ? ['ignore', 'ignore', 'inherit'] : 'inherit',
    // The child argv names check.mjs, so preserve the native host before spawning.
    env: { ...process.env, ...(host ? { TR_PACKAGE_ROOT: host } : {}) },
  });
  if (result.error) throw result.error;
  return { exitCode: result.status ?? 1, data: { state_dir: stateDir(cwd), script } };
}
