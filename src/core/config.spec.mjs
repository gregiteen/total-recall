// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

  it('getEnvVar returns process.env value', async () => {
    process.env._TEST_GETENV_VAR = 'hello-test';
    const mod = await import('./config.mjs');
    expect(mod.getEnvVar('_TEST_GETENV_VAR')).toBe('hello-test');
    delete process.env._TEST_GETENV_VAR;
  });

  it('detectProjectBrain returns null in test mode', async () => {
    const mod = await import('./config.mjs');
    expect(mod.detectProjectBrain('/tmp')).toBeNull();
  });

  it('getActiveBrains returns global + null project in test mode', async () => {
    const mod = await import('./config.mjs');
    const { global: g, project } = mod.getActiveBrains();
    expect(g.layer).toBe('global');
    expect(project).toBeNull();
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
