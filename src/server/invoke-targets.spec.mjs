// @vitest-environment node
import { beforeEach, afterEach, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { restrictedBrainTargets } from './invoke-targets.mjs';

let root, registry, rows, brain, id;
const authority = scopes => ({ scopes, allows: scope => scopes.includes(scope) || scopes.includes('*') });
const save = () => fs.writeFileSync(path.join(registry, 'config/project-registry.json'), JSON.stringify(rows));
const resolve = scopes => restrictedBrainTargets(authority(scopes), { serverBrain: root, registryBrain: registry });
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'invoke-targets-')));
  registry = path.join(root, 'registry');
  brain = path.join(root, 'project/.agent/skills/total-recall');
  id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  fs.mkdirSync(path.join(registry, 'config'), { recursive: true });
  fs.mkdirSync(path.join(brain, 'config'), { recursive: true });
  fs.writeFileSync(path.join(brain, 'config/brain.json'), JSON.stringify({ project_id: id }));
  rows = [{ path: path.join(root, 'project'), brainDir: brain, project_id: id }]; save();
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const grant = 'brain:project-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
it('resolves only granted UUID targets and preserves server-only access without a registry', () => {
  expect([...resolve([grant])]).toEqual([[`project:${id}`, brain]]);
  expect([...resolve([])]).toEqual([]);
  fs.writeFileSync(path.join(registry, 'config/project-registry.json'), 'bad');
  expect([...resolve(['brain:server'])]).toEqual([['server', root]]);
  expect(() => resolve([grant])).toThrow('metadata is unavailable');
});
it('rejects duplicate IDs and identity mismatch', () => {
  rows.push(rows[0]); save(); expect(() => resolve([grant])).toThrow('more than once');
  rows.pop(); save();
  fs.writeFileSync(path.join(brain, 'config/brain.json'), JSON.stringify({ project_id: 'different' }));
  expect([...resolve([grant])]).toEqual([]);
});
it('honors toggles and fails closed on corrupt toggle metadata', () => {
  fs.writeFileSync(path.join(registry, 'config/brain-toggles.json'), JSON.stringify({ [brain]: false }));
  expect([...resolve([grant])]).toEqual([]);
  fs.writeFileSync(path.join(registry, 'config/brain-toggles.json'), 'bad');
  expect(() => resolve([grant])).toThrow('metadata is unavailable');
});
it.each(['memory-vault', 'memory-derived', 'memory-derived/local-search.json', 'config/brain.json'])('denies a linked %s boundary', relative => {
  const file = path.join(brain, relative), foreign = path.join(root, 'foreign');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.rmSync(file);
  fs.mkdirSync(foreign);
  fs.symlinkSync(foreign, file);
  expect([...resolve([grant])]).toEqual([]);
});
it('denies linked project brains, foreign paths, malformed IDs and missing registrations', () => {
  const link = path.join(root, 'linked'); fs.symlinkSync(brain, link);
  rows[0].brainDir = link;
  // Physical identity is accepted only at its own canonical project location.
  rows[0].path = root; save(); expect([...resolve([grant])]).toEqual([]);
  rows[0].brainDir = brain; rows[0].path = path.join(root, 'project'); rows[0].project_id = '../foreign';
  save(); expect([...resolve([grant])]).toEqual([]);
  rows = []; save(); expect([...resolve([grant])]).toEqual([]);
});
