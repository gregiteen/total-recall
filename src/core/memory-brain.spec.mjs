import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeBrainIdentity, registerProjectBrain } from './memory-brain.mjs';

it('preserves identity fields and refuses to replace malformed existing state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-identity-'));
  try {
    writeBrainIdentity(root, { name: 'Custom brain', role: 'global' });
    const identity = path.join(root, 'config', 'brain.json');
    const initial = JSON.parse(fs.readFileSync(identity, 'utf8'));
    expect(writeBrainIdentity(root, { role: 'global' }).name).toBe('Custom brain');
    expect(writeBrainIdentity(root, { role: 'global' }).created_at).toBe(initial.created_at);
    fs.writeFileSync(identity, '{malformed');
    expect(() => writeBrainIdentity(root)).toThrow();
    expect(fs.readFileSync(identity, 'utf8')).toBe('{malformed');
    const registry = path.join(root, 'config', 'project-registry.json');
    fs.writeFileSync(registry, '{}');
    expect(() => registerProjectBrain(root, { path: root })).toThrow(/array/);
    expect(fs.readFileSync(registry, 'utf8')).toBe('{}');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it('registers a stable project UUID without a separate repair command', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-register-id-'));
  try {
    const global = path.join(root, 'global'), project = path.join(root, 'project');
    const brainDir = path.join(project, '.agent/skills/total-recall');
    writeBrainIdentity(brainDir, { name: 'Project' });
    const entry = { path: project, brainDir, name: 'Project' };
    const row = registerProjectBrain(global, entry);
    expect(row.project_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(fs.readFileSync(path.join(brainDir, 'config/brain.json'), 'utf8')).project_id).toBe(row.project_id);
    expect(registerProjectBrain(global, entry).project_id).toBe(row.project_id);
    const file = path.join(global, 'config/project-registry.json');
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toHaveLength(1);
    const before = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(path.join(brainDir, 'config/brain.json'), '{broken');
    expect(() => registerProjectBrain(global, entry)).toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
