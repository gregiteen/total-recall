import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findLocalBrain,
  isBrainEnabled,
  listLocalBrains,
  readBrainToggles,
  setBrainEnabled,
} from './brain-registry.mjs';

const dirs = [];
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-brains-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
});

function setup() {
  const root = tmp();
  const globalBrainDir = path.join(root, 'global');
  const repo = path.join(root, 'repo');
  const repoBrain = path.join(repo, '.agent', 'skills', 'total-recall');
  fs.mkdirSync(path.join(globalBrainDir, 'config'), { recursive: true });
  fs.mkdirSync(path.join(globalBrainDir, 'memory-vault'), { recursive: true });
  fs.writeFileSync(path.join(globalBrainDir, 'memory-vault', 'a.md'), '# a');
  fs.mkdirSync(path.join(repoBrain, 'memory-vault'), { recursive: true });
  fs.writeFileSync(
    path.join(globalBrainDir, 'config', 'project-registry.json'),
    JSON.stringify([{ name: 'repo', path: repo, brainDir: repoBrain }]),
  );
  return { globalBrainDir, repo, repoBrain };
}

describe('brain toggles', () => {
  it('treats every brain as on until it is switched off', () => {
    const { globalBrainDir, repoBrain } = setup();
    expect(readBrainToggles(globalBrainDir)).toEqual({});
    expect(isBrainEnabled(repoBrain, { globalBrainDir })).toBe(true);
  });

  it('switches off and back on, storing only the off entries', () => {
    const { globalBrainDir, repoBrain } = setup();
    setBrainEnabled(repoBrain, false, { globalBrainDir });
    expect(isBrainEnabled(repoBrain, { globalBrainDir })).toBe(false);
    expect(isBrainEnabled(globalBrainDir, { globalBrainDir })).toBe(true);

    setBrainEnabled(repoBrain, true, { globalBrainDir });
    expect(isBrainEnabled(repoBrain, { globalBrainDir })).toBe(true);
    expect(readBrainToggles(globalBrainDir)).toEqual({});
  });

  it('keys by resolved path so a trailing slash or relative spelling hits the same switch', () => {
    const { globalBrainDir, repoBrain } = setup();
    setBrainEnabled(`${repoBrain}/`, false, { globalBrainDir });
    expect(isBrainEnabled(path.join(repoBrain, '..', 'total-recall'), { globalBrainDir })).toBe(false);
  });

  it('ignores a corrupt toggles file rather than switching everything off', () => {
    const { globalBrainDir, repoBrain } = setup();
    fs.writeFileSync(path.join(globalBrainDir, 'config', 'brain-toggles.json'), '{not json');
    expect(isBrainEnabled(repoBrain, { globalBrainDir })).toBe(true);
  });
});

describe('listLocalBrains / findLocalBrain', () => {
  it('lists global plus registered brains with their state', () => {
    const { globalBrainDir, repoBrain } = setup();
    setBrainEnabled(repoBrain, false, { globalBrainDir });
    const brains = listLocalBrains({ globalBrainDir });
    expect(brains.map((b) => [b.name, b.kind, b.enabled])).toEqual([
      ['global', 'global', true],
      ['repo', 'project', false],
    ]);
    expect(brains[0].nodes).toBe(1);
  });

  it('includes an active project brain that was never registered', () => {
    const { globalBrainDir } = setup();
    const other = path.join(tmp(), 'other');
    const brainDir = path.join(other, '.agent', 'skills', 'total-recall');
    const brains = listLocalBrains({ globalBrainDir, activeProject: { brainDir, projectRoot: other } });
    expect(brains.at(-1)).toMatchObject({ name: 'other', active: true, exists: false });
  });

  it('finds a brain by "global", name, repo path or brain path', () => {
    const { globalBrainDir, repo, repoBrain } = setup();
    const brains = listLocalBrains({ globalBrainDir });
    expect(findLocalBrain(brains, 'global').kind).toBe('global');
    expect(findLocalBrain(brains, 'REPO').brainDir).toBe(repoBrain);
    expect(findLocalBrain(brains, repo).brainDir).toBe(repoBrain);
    expect(findLocalBrain(brains, repoBrain).brainDir).toBe(repoBrain);
    expect(findLocalBrain(brains, 'nope')).toBeNull();
  });
});
