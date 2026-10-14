import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const mocks = { compile: vi.fn(), projects: vi.fn() };
import { recompileAfterPluginMutation } from './plugin-store.mjs';

describe('truthful plugin compilation status', () => {
  const deps = { compileSurface: mocks.compile, compileRegisteredProjects: mocks.projects };
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-compile-'));
    mocks.compile.mockReset(); mocks.projects.mockReset();
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  it('reports compiler failure explicitly instead of swallowing success', async () => {
    mocks.compile.mockRejectedValue(new Error('budget overflow'));
    expect(await recompileAfterPluginMutation(root, false, deps)).toEqual({ ok: false, error: 'budget overflow' });
  });
  it('does not call stale-host skipping a successful compilation', async () => {
    mocks.compile.mockResolvedValue({ skipped: true, reason: 'stale-surface-code' });
    expect((await recompileAfterPluginMutation(root, false, deps)).ok).toBe(false);
  });
  it('global mutations fan out and report any registered-project failure', async () => {
    mocks.compile.mockResolvedValue({ skipped: false }); mocks.projects.mockResolvedValue(2);
    const result = await recompileAfterPluginMutation(root, true, deps);
    expect(mocks.projects).toHaveBeenCalledOnce(); expect(result.ok).toBe(false);
    expect(result.error).toContain('2 registered project');
  });
});
