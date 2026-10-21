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

export const CORE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'core');

export function findSkillDir(start = process.cwd()) {
  return stateDir(start);
}

export function runCore(script, args) {
  if (!fs.existsSync(stateDir())) {
    const error = new Error('No code-quality state in this repository (.agent/skills/code-quality). Create it: total-recall code-quality init');
    error.exitCode = 2;
    throw error;
  }
  const result = spawnSync(process.execPath, [path.join(CORE_DIR, script), ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  return { exitCode: result.status ?? 1, data: { state_dir: stateDir(), script } };
}
