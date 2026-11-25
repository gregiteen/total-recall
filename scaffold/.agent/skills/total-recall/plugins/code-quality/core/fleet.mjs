/**
 * The registered project brains on this machine, and which are active.
 * Reads the host's registry and git commit times. It holds no repository names
 * or paths of its own.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { hostRoot } from './host.mjs';

export const DEFAULT_ACTIVE_DAYS = 30;
const DAY = 86_400_000;

async function registry() {
  return import(pathToFileURL(path.join(hostRoot(), 'src', 'core', 'brain-registry.mjs')).href);
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 }).trim();
}

/** Last commit time and whether `.git` is a file (a linked worktree or submodule); null when there is no git history to read. */
export function gitActivity(repo) {
  try {
    const worktree = fs.lstatSync(path.join(repo, '.git')).isFile();
    const at = Number(git(repo, ['log', '-1', '--format=%ct'])) * 1000;
    return { lastCommitAt: at ? new Date(at).toISOString() : null, idleDays: at ? Math.floor((Date.now() - at) / DAY) : null, worktree };
  } catch {
    return null;
  }
}

/** Registered, switched-on project brains with their activity, sorted by name. `active`: a commit within the last `activeDays` days. */
export async function registeredProjects({ activeDays = DEFAULT_ACTIVE_DAYS, globalBrainDir } = {}) {
  const api = await registry();
  const brainDir = globalBrainDir || api.globalBrainDirFor();
  const toggles = api.readBrainToggles(brainDir);
  const seen = new Set();
  const projects = [];
  for (const row of api.readRegisteredProjects(brainDir)) {
    const root = row.path || (row.brainDir ? path.resolve(row.brainDir, '..', '..', '..') : null);
    if (!root || seen.has(path.resolve(root))) continue;
    seen.add(path.resolve(root));
    const enabled = toggles[path.resolve(row.brainDir || path.join(root, '.agent', 'skills', 'total-recall'))] !== false;
    if (!enabled) continue;
    const exists = fs.existsSync(root);
    const activity = exists ? gitActivity(root) : null;
    projects.push({
      name: row.name || path.basename(root),
      path: root,
      exists,
      lastCommitAt: activity?.lastCommitAt ?? null,
      idleDays: activity?.idleDays ?? null,
      worktree: Boolean(activity?.worktree),
      git: Boolean(activity),
      active: Boolean(activity) && !activity.worktree && activity.idleDays !== null && activity.idleDays < activeDays,
    });
  }
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}
