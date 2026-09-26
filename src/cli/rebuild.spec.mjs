import { describe, it, expect } from 'vitest';
import cli, { runRebuild, compileRegisteredProjects } from './rebuild.mjs';

describe('rebuild.mjs', () => {
  it('exports default', () => {
    expect(cli).toBeDefined();
  });
  it('exports runRebuild', () => {
    expect(runRebuild).toBeDefined();
  });
});

describe('compileRegisteredProjects', () => {
  const brain = (name, kind = 'project', exists = true) => ({ name, kind, exists, brainDir: `/repos/${name}/.agent/skills/total-recall` });

  it('compiles every existing project brain and skips the global one', async () => {
    const calls = [];
    const failed = await compileRegisteredProjects({
      brains: [brain('global', 'global'), brain('app-one'), brain('gone', 'project', false), brain('app-two')],
      compile: async (opts) => { calls.push(opts); return { skipped: false, skillsInjected: 2 }; },
    });
    expect(failed).toBe(0);
    expect(calls.map((c) => c.vaultDir)).toEqual([
      '/repos/app-one/.agent/skills/total-recall/memory-vault',
      '/repos/app-two/.agent/skills/total-recall/memory-vault',
    ]);
    expect(calls[0].skillsDir).toBe('/repos/app-one/.agent/skills');
    expect(calls[0].instructionsFile).toBe('/repos/app-one/.agent/INSTRUCTIONS.md');
  });

  it('keeps going after one project fails and reports the count', async () => {
    const failed = await compileRegisteredProjects({
      brains: [brain('bad'), brain('good')],
      compile: async ({ vaultDir }) => {
        if (vaultDir.includes('/bad/')) throw new Error('boom');
        return { skipped: true };
      },
    });
    expect(failed).toBe(1);
  });
});
