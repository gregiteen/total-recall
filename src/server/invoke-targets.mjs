/** Resolve operator registrations; caller inputs are IDs, never host paths. */
import fs from 'node:fs';
import path from 'node:path';
import { readRegisteredProjects, readBrainToggles } from '../core/brain-registry.mjs';
import { readProjectId } from '../core/project-id.mjs';
import { InvokeError } from './invoke-execution.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const projectBrainScope = id => `brain:project-${id}`;

function safeMemoryRoots(brain) {
  for (const relative of ['memory-vault', 'memory-derived', 'memory-derived/local-search.json', 'memory-derived/memory-layers.jsonl']) {
    const file = path.join(brain, relative);
    try { if (fs.lstatSync(file).isSymbolicLink() || fs.realpathSync(file) !== file) return false; }
    catch (err) { if (err.code !== 'ENOENT') return false; }
  }
  return true;
}

export function restrictedBrainTargets(authority, { serverBrain, registryBrain }) {
  const targets = new Map();
  if (authority.allows('brain:server')) targets.set('server', fs.realpathSync(serverBrain));
  // A plain server grant does not require unrelated registry availability.
  if (!authority.scopes?.some(scope => scope === '*' || scope === 'brain:*' || /^brain:project-/.test(scope))) return targets;
  let rows, toggles;
  try {
    rows = readRegisteredProjects(registryBrain);
    toggles = readBrainToggles(registryBrain, { strict: true });
  } catch { throw new InvokeError(503, 'target-registry-unavailable', 'Project target metadata is unavailable.'); }
  const seen = new Set();
  for (const row of rows) {
    const id = row.project_id;
    if (typeof id !== 'string' || !UUID.test(id) || !authority.allows(projectBrainScope(id))) continue;
    if (seen.has(id)) throw new InvokeError(503, 'ambiguous-project-target', 'A granted project identity is registered more than once.');
    seen.add(id);
    try {
      if (typeof row.path !== 'string' || !path.isAbsolute(row.path) || typeof row.brainDir !== 'string' || !path.isAbsolute(row.brainDir)) continue;
      const expected = path.join(fs.realpathSync(row.path), '.agent', 'skills', 'total-recall');
      const brain = fs.realpathSync(row.brainDir);
      // Nested links cannot substitute another project or global brain.
      if (brain !== expected || fs.realpathSync(path.join(brain, 'config')) !== path.join(brain, 'config') ||
        !fs.lstatSync(path.join(brain, 'config', 'brain.json')).isFile() ||
        fs.lstatSync(path.join(brain, 'config', 'brain.json')).isSymbolicLink() || readProjectId(brain) !== id || !safeMemoryRoots(brain)) continue;
      if (toggles[path.resolve(row.brainDir)] === false || toggles[brain] === false) continue;
      targets.set(`project:${id}`, brain);
    } catch { /* A missing, unsafe or mismatched registration grants nothing. */ }
  }
  return targets;
}
