import fs from 'node:fs';
import path from 'node:path';
import { dashboardBrainDir, globalBrainDirFor, readBrainToggles, readRegisteredProjects } from '../core/brain-registry.mjs';
import { projectPluginsDir } from '../core/plugin-loader.mjs';
import { readProjectId } from '../core/project-id.mjs';
import { keyHasScope } from './keys.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PROJECT_SELECTOR = /^project:[^/\\:,\x00-\x1f\x7f]{1,160}$/u;

const targetError = (status, message) => Object.assign(new Error(message), { status });

function optionalDirectoriesAreLocal(brainDir) {
  for (const name of ['plugins', 'memory-vault', 'memory-derived']) {
    try {
      if (!fs.lstatSync(path.join(brainDir, name)).isDirectory()) return false;
    } catch (error) {
      if (error.code !== 'ENOENT') return false;
    }
  }
  return true;
}

function resolveProject(row, sharedBrain, toggles) {
  try {
    if (typeof row.path !== 'string' || !path.isAbsolute(row.path) ||
        typeof row.brainDir !== 'string' || !path.isAbsolute(row.brainDir)) return null;
    const projectRoot = fs.realpathSync(row.path);
    const brainDir = path.dirname(projectPluginsDir(projectRoot));
    const identity = path.join(brainDir, 'config', 'brain.json');
    if (brainDir === sharedBrain || fs.realpathSync(row.brainDir) !== brainDir ||
        fs.realpathSync(brainDir) !== brainDir || fs.realpathSync(identity) !== identity ||
        !fs.lstatSync(identity).isFile() || readProjectId(brainDir) !== row.project_id ||
        toggles[path.resolve(row.brainDir)] === false || toggles[brainDir] === false ||
        !optionalDirectoriesAreLocal(brainDir)) return null;
    return { brainDir, projectRoot };
  } catch {
    return null;
  }
}

function authorize(auth, scope) {
  if (auth?.type === 'dashboard_session') return;
  if (auth?.type !== 'pat' || !keyHasScope(auth, scope)) {
    throw targetError(403, 'The token does not grant access to a selected brain.');
  }
}

/** Resolve selected IDs against server-owned registrations before plugin I/O. */
export function resolvePluginBrainTargets(ids, auth, { registryBrain = globalBrainDirFor() } = {}) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 64 ||
      ids.some(id => typeof id !== 'string' || (id !== 'global' && !PROJECT_SELECTOR.test(id)))) {
    throw targetError(400, 'Select up to 64 global or registered project brain IDs.');
  }
  let sharedBrain, rows, toggles, globalToggles;
  try {
    const projectRegistryBrain = dashboardBrainDir(process.env, registryBrain);
    sharedBrain = fs.realpathSync(registryBrain);
    globalToggles = ids.includes('global') ? readBrainToggles(registryBrain, { strict: true }) : {};
    const needsProjects = ids.some(id => id !== 'global');
    toggles = needsProjects ? readBrainToggles(projectRegistryBrain, { strict: true }) : {};
    rows = needsProjects ? readRegisteredProjects(projectRegistryBrain) : [];
  } catch {
    throw targetError(503, 'Brain registry metadata is unavailable.');
  }
  const resolved = new Set();
  return [...new Set(ids)].map(brainId => {
    if (brainId === 'global') {
      authorize(auth, 'brain:global');
      if (globalToggles[path.resolve(registryBrain)] === false || globalToggles[sharedBrain] === false) {
        throw targetError(404, 'The selected global brain is unavailable.');
      }
      return { brainId, name: 'Global Brain', brainDir: sharedBrain, projectRoot: null };
    }
    const selector = brainId.slice('project:'.length);
    const matches = rows.filter(row => row.name === selector || row.project_id === selector);
    if (matches.length > 1) throw targetError(409, 'A selected project brain ID is ambiguous.');
    const row = matches[0];
    if (typeof row?.project_id !== 'string' || !UUID.test(row.project_id) || rows.filter(candidate => candidate.project_id === row.project_id).length !== 1) {
      throw targetError(404, 'A selected project brain is unavailable.');
    }
    authorize(auth, 'brain:project-' + row.project_id);
    const target = resolveProject(row, sharedBrain, toggles);
    if (!target) throw targetError(404, 'A selected project brain is unavailable.');
    if (resolved.has(target.brainDir)) throw targetError(400, 'Select each project brain once.');
    resolved.add(target.brainDir);
    return { brainId, name: row.name || selector, ...target };
  });
}
