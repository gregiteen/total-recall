/**
 * Every brain this machine knows, and which of them are switched on.
 *
 * A machine carries one global brain plus any number of project brains
 * (registered with `brain register`, or simply present in the working
 * directory). Until now nothing could be excluded: recall always read the
 * global brain and whichever project brain the cwd resolved to. A brain that
 * is switched off is skipped by recall; listing still shows it.
 *
 * On/off state lives in one file in the global brain,
 * `config/brain-toggles.json`, keyed by resolved brain directory, so the same
 * switch applies from every repository on the machine. A brain is on unless it
 * has been switched off — nothing changes for anyone who never uses this.
 *
 * Portability (open source): no brain, repo or path is hardcoded.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function globalBrainDirFor(env = process.env) {
  const agentDir = env.AGENT_DIR || path.join(os.homedir(), '.agent');
  return path.join(agentDir, 'skills', 'total-recall');
}

function togglesPath(globalBrainDir) {
  return path.join(globalBrainDir, 'config', 'brain-toggles.json');
}

function registryPath(globalBrainDir) {
  return path.join(globalBrainDir, 'config', 'project-registry.json');
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** `{ [resolvedBrainDir]: false }` for every brain switched off. */
export function readBrainToggles(globalBrainDir = globalBrainDirFor()) {
  const data = readJson(togglesPath(globalBrainDir), {});
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

export function isBrainEnabled(brainDir, { globalBrainDir = globalBrainDirFor(), toggles = null } = {}) {
  const state = toggles || readBrainToggles(globalBrainDir);
  return state[path.resolve(brainDir)] !== false;
}

/** Switch a brain on or off. Written atomically; only "off" entries are stored. */
export function setBrainEnabled(brainDir, enabled, { globalBrainDir = globalBrainDirFor() } = {}) {
  const state = readBrainToggles(globalBrainDir);
  const key = path.resolve(brainDir);
  if (enabled) delete state[key];
  else state[key] = false;

  const file = togglesPath(globalBrainDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
  return { brainDir: key, enabled: !!enabled };
}

function countMarkdown(dir) {
  let count = 0;
  const walk = (current) => {
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) count += 1;
    }
  };
  walk(dir);
  return count;
}

/**
 * Every brain on this machine: the global one, each registered project brain,
 * and the active project brain even when it was never registered.
 *
 * @param {{ globalBrainDir?: string, activeProject?: { brainDir: string, projectRoot?: string } | null }} [options]
 * @returns {Array<{ name: string, kind: 'global'|'project', brainDir: string, root: string|null,
 *   enabled: boolean, active: boolean, exists: boolean, nodes: number }>}
 */
export function listLocalBrains(options = {}) {
  const globalBrainDir = options.globalBrainDir || globalBrainDirFor();
  const activeProject = options.activeProject === undefined ? null : options.activeProject;
  const toggles = readBrainToggles(globalBrainDir);
  const activeDir = activeProject ? path.resolve(activeProject.brainDir) : null;

  const describe = (name, kind, brainDir, root) => {
    const exists = fs.existsSync(brainDir);
    return {
      name,
      kind,
      brainDir: path.resolve(brainDir),
      root: root || null,
      enabled: toggles[path.resolve(brainDir)] !== false,
      active: kind === 'global' ? !activeDir : path.resolve(brainDir) === activeDir,
      exists,
      nodes: exists ? countMarkdown(path.join(brainDir, 'memory-vault')) : 0,
    };
  };

  const brains = [describe('global', 'global', globalBrainDir, null)];
  const registry = readJson(registryPath(globalBrainDir), []);
  for (const entry of Array.isArray(registry) ? registry : []) {
    if (!entry?.brainDir) continue;
    if (brains.some((b) => b.brainDir === path.resolve(entry.brainDir))) continue;
    brains.push(describe(entry.name || path.basename(entry.path || entry.brainDir), 'project', entry.brainDir, entry.path));
  }
  if (activeProject && !brains.some((b) => b.brainDir === activeDir)) {
    const root = activeProject.projectRoot || null;
    brains.push(describe(root ? path.basename(root) : 'project', 'project', activeProject.brainDir, root));
  }
  return brains;
}

/**
 * Find a brain by `global`, its name, its repo path or its brain path.
 * Names are matched case-insensitively; an ambiguous name returns null.
 */
export function findLocalBrain(brains, query) {
  const wanted = String(query || '').trim();
  if (!wanted) return null;
  if (wanted.toLowerCase() === 'global') return brains.find((b) => b.kind === 'global') || null;

  const asPath = path.resolve(wanted);
  const byPath = brains.find((b) => b.brainDir === asPath || (b.root && path.resolve(b.root) === asPath));
  if (byPath) return byPath;

  const byName = brains.filter((b) => b.name.toLowerCase() === wanted.toLowerCase());
  return byName.length === 1 ? byName[0] : null;
}
