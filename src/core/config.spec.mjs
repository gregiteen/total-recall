// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * config.mjs is a module-level singleton that runs on import.
 * We test the exported values and helper functions (detectProjectBrain,
 * getActiveBrains, resolveBrainLayer) in isolation by setting env vars.
 */
describe('config module', () => {
  beforeEach(() => {
    // Ensure we're in test mode so project-brain detection is skipped
    process.env._TR_TEST_AGENT_DIR = '/tmp/test-agent';
  });

  it('exports a frozen config object', async () => {
    const mod = await import('./config.mjs');
    const cfg = mod.default;
    expect(typeof cfg).toBe('object');
    expect(Object.isFrozen(cfg)).toBe(true);
  });

  it('config has a port property defaulting to a number', async () => {
    const mod = await import('./config.mjs');
    expect(typeof mod.default.port).toBe('number');
  });

  it('config host is unset by default so the server can auto-bind to the mesh IP', async () => {
    const mod = await import('./config.mjs');
    if (process.env.HOST) {
      expect(typeof mod.default.host).toBe('string');
    } else {
      expect(mod.default.host).toBeUndefined();
    }
  });

  it('exports brainDir as a string path', async () => {
    const mod = await import('./config.mjs');
    expect(typeof mod.brainDir).toBe('string');
    expect(mod.brainDir).toContain('total-recall');
  });

  it('exports agentDir as a string', async () => {
    const mod = await import('./config.mjs');
    expect(typeof mod.agentDir).toBe('string');
  });

  it('exports globalBrainDir and globalAgentDir', async () => {
    const mod = await import('./config.mjs');
    expect(typeof mod.globalBrainDir).toBe('string');
    expect(typeof mod.globalAgentDir).toBe('string');
  });

  it('does not export an ambient credential accessor', async () => {
    const mod = await import('./config.mjs');
    expect(mod.getEnvVar).toBeUndefined();
  });

  it('detectProjectBrain returns null in test mode', async () => {
    const mod = await import('./config.mjs');
    expect(mod.detectProjectBrain('/tmp')).toBeNull();
  });

  it('excludes relocated shared skills without obscuring workspace and repository brains', async () => {
    const { detectProjectBrain } = await import('./config.mjs');
    const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-config-relocated-')));
    const homedir = vi.spyOn(os, 'homedir').mockReturnValue(home);
    vi.stubEnv('_TR_TEST_AGENT_DIR', undefined);
    vi.stubEnv('AGENT_DIR', undefined);
    const workspace = path.join(home, 'workspace');
    const repo = path.join(workspace, 'repo');
    const shared = path.join(workspace, '.shared', 'skills');
    const ownBrain = root => path.join(root, '.agent', 'skills', 'total-recall');
    try {
      for (const brain of [path.join(shared, 'total-recall'), ownBrain(workspace), ownBrain(repo)]) {
        fs.mkdirSync(path.join(brain, 'memory-vault'), { recursive: true });
      }
      fs.mkdirSync(path.join(home, '.agent'));
      fs.symlinkSync(shared, path.join(home, '.agent', 'skills'));
      expect(detectProjectBrain(home)).toBeNull();
      expect(detectProjectBrain(path.join(shared, 'total-recall'))).toBeNull();
      expect(detectProjectBrain(workspace)?.brainDir).toBe(ownBrain(workspace));
      expect(detectProjectBrain(repo)?.brainDir).toBe(ownBrain(repo));

      const alias = path.join(workspace, 'alias');
      fs.mkdirSync(path.dirname(ownBrain(alias)), { recursive: true });
      fs.symlinkSync(path.join(shared, 'total-recall'), ownBrain(alias));
      expect(detectProjectBrain(alias)?.brainDir).toBe(ownBrain(workspace));
    } finally {
      homedir.mockRestore();
      vi.unstubAllEnvs();
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('getActiveBrains returns global + null project in test mode', async () => {
    const mod = await import('./config.mjs');
    const { global: g, project } = mod.getActiveBrains();
    expect(g.layer).toBe('global');
    expect(project).toBeNull();
    expect(g.agentDir).toBe('/tmp/test-agent');
    expect(g.brainDir).toBe('/tmp/test-agent/skills/total-recall');
  });

  it('resolveBrainLayer("global") always returns global layer', async () => {
    const mod = await import('./config.mjs');
    const result = mod.resolveBrainLayer('global');
    expect(result.layer).toBe('global');
  });

  it('resolveBrainLayer("project") throws when no project brain exists (test mode)', async () => {
    const mod = await import('./config.mjs');
    expect(() => mod.resolveBrainLayer('project')).toThrow('No project brain found');
  });

  it('resolveBrainLayer("auto") falls back to global when no project', async () => {
    const mod = await import('./config.mjs');
    const result = mod.resolveBrainLayer('auto');
    expect(result.layer).toBe('global');
  });

  it('remoteVaultSync defaults to disabled', async () => {
    const mod = await import('./config.mjs');
    expect(mod.remoteVaultSync.enabled).toBe(false);
  });

  it('config.dailySearchLimit is a number >= 0', async () => {
    const mod = await import('./config.mjs');
    expect(typeof mod.dailySearchLimit).toBe('number');
    expect(mod.dailySearchLimit).toBeGreaterThanOrEqual(0);
  });
});
