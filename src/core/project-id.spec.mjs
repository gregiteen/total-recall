import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureProjectId, readProjectId, repairProjectIds } from './project-id.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('project-id', () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pid-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('creates a UUID once and keeps other brain.json fields', () => {
    const brain = path.join(root, 'p', 'brain');
    fs.mkdirSync(path.join(brain, 'config'), { recursive: true });
    fs.writeFileSync(path.join(brain, 'config', 'brain.json'), JSON.stringify({ url: 'http://x' }));
    const first = ensureProjectId(brain);
    expect(first.created).toBe(true);
    expect(first.project_id).toMatch(UUID);
    expect(ensureProjectId(brain)).toEqual({ project_id: first.project_id, created: false });
    expect(JSON.parse(fs.readFileSync(path.join(brain, 'config', 'brain.json'), 'utf8')).url).toBe('http://x');
    expect(readProjectId(brain)).toBe(first.project_id);
  });

  it('repairs every registered project and syncs the registry to brain.json', () => {
    const global = path.join(root, 'global');
    const a = path.join(root, 'a');
    const b = path.join(root, 'b');
    fs.mkdirSync(path.join(b, 'config'), { recursive: true });
    fs.writeFileSync(path.join(b, 'config', 'brain.json'), JSON.stringify({ project_id: 'brain-side-id' }));
    fs.mkdirSync(a, { recursive: true });
    fs.mkdirSync(path.join(global, 'config'), { recursive: true });
    fs.writeFileSync(
      path.join(global, 'config', 'project-registry.json'),
      JSON.stringify([
        { name: 'a', brainDir: a },
        { name: 'b', brainDir: b, project_id: 'stale-registry-id' },
        { name: 'gone', brainDir: path.join(root, 'nope') },
      ]),
    );
    expect(repairProjectIds(global)).toEqual({ total: 3, created: 1, synced: 2, missing_brain: 1 });
    const reg = JSON.parse(fs.readFileSync(path.join(global, 'config', 'project-registry.json'), 'utf8'));
    expect(reg[0].project_id).toMatch(UUID);
    expect(reg[1].project_id).toBe('brain-side-id');
  });
});
