import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  ensureFullProjectBrain,
  inspectProjectBrain,
  ensureAndRegisterProjectBrain,
  resolveProjectBrainPaths,
} from './project-brain.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pbrain-'));
}

describe('project-brain', () => {
  let root;
  let globalBrain;

  beforeEach(() => {
    root = tmpDir();
    globalBrain = tmpDir();
    fs.mkdirSync(path.join(globalBrain, 'config'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(globalBrain, { recursive: true, force: true });
  });

  it('ensureFullProjectBrain creates vault, openwiki, sessions, registry', () => {
    const repo = path.join(root, 'my-app');
    fs.mkdirSync(repo, { recursive: true });
    const result = ensureFullProjectBrain(repo, {
      name: 'my-app',
      tags: ['test'],
      globalBrainDir: globalBrain,
    });
    expect(result.full_brain).toBe(true);
    expect(fs.existsSync(path.join(result.brainDir, 'memory-vault', 'facts'))).toBe(true);
    expect(fs.existsSync(path.join(result.brainDir, 'openwiki'))).toBe(true);
    expect(fs.existsSync(path.join(result.brainDir, 'sessions'))).toBe(true);
    expect(fs.existsSync(path.join(result.brainDir, 'scheduler', 'queue'))).toBe(true);
    expect(fs.existsSync(path.join(result.brainDir, 'skills-registry', 'index.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(result.brainDir, 'config', 'brain.json'))).toBe(true);
    const id = JSON.parse(fs.readFileSync(path.join(result.brainDir, 'config', 'brain.json'), 'utf8'));
    expect(id.role).toBe('project');
    expect(id.full_brain).toBe(true);

    const health = inspectProjectBrain(repo);
    expect(health.complete).toBe(true);

    const reg = JSON.parse(fs.readFileSync(path.join(globalBrain, 'config', 'project-registry.json'), 'utf8'));
    expect(reg.some((p) => p.path === path.resolve(repo) && p.full_brain)).toBe(true);
  });

  it('ensureAndRegisterProjectBrain requires explicit path (no hardcoded repos)', () => {
    expect(ensureAndRegisterProjectBrain({ globalBrainDir: globalBrain }).ok).toBe(false);

    const app = path.join(root, 'any-app');
    fs.mkdirSync(app, { recursive: true });
    const result = ensureAndRegisterProjectBrain({
      repoRoot: app,
      name: 'any-app',
      globalBrainDir: globalBrain,
    });
    expect(result.ok).toBe(true);
    expect(result.brainDir).toBe(resolveProjectBrainPaths(app).brainDir);
    expect(inspectProjectBrain(app).complete).toBe(true);
    const reg = JSON.parse(fs.readFileSync(path.join(globalBrain, 'config', 'project-registry.json'), 'utf8'));
    expect(reg.some((p) => p.name === 'any-app' && p.full_brain)).toBe(true);
  });
});
