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
