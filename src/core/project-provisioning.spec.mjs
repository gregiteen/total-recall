import { describe, it, expect } from 'vitest';
import { provisionProject } from './project-provisioning.mjs';

const plugin = (id, extra = {}) => ({ id, valid: true, manifest: { runtime: { modules: { 'project-provision': './provision.mjs' } }, ...extra } });
const on = () => ({ enabled: true });

describe('project provisioning', () => {
  it('runs the hook of each enabled plugin that declares one', async () => {
    const seen = [];
    const result = await provisionProject('/repo', {
      discover: () => [plugin('gates'), { id: 'none', valid: true, manifest: {} }],
      activation: on,
      load: async (id) => ({ provisionProject: async (args) => { seen.push([id, args.projectRoot, args.dryRun]); return { ok: true, summary: 'done' }; } }),
    });
    expect(seen).toEqual([['gates', '/repo', false]]);
    expect(result).toEqual([{ plugin: 'gates', status: 'ok', summary: 'done' }]);
  });

  it('reports a failing hook and still runs the next one', async () => {
    const result = await provisionProject('/repo', {
      discover: () => [plugin('bad'), plugin('refused'), plugin('good')],
      activation: on,
      load: async (id) => ({ provisionProject: async () => {
        if (id === 'bad') throw new Error('boom');
        return id === 'refused' ? { ok: false, summary: 'no brain' } : { ok: true, summary: 'fine' };
      } }),
    });
    expect(result).toEqual([
      { plugin: 'bad', status: 'failed', summary: 'boom' },
      { plugin: 'refused', status: 'failed', summary: 'no brain' },
      { plugin: 'good', status: 'ok', summary: 'fine' },
    ]);
  });

  it('skips a plugin that is switched off and an invalid one', async () => {
    const result = await provisionProject('/repo', {
      discover: () => [plugin('off'), { ...plugin('broken'), valid: false }],
      activation: () => ({ enabled: false }),
      load: async () => { throw new Error('must not load'); },
    });
    expect(result).toEqual([{ plugin: 'off', status: 'inactive', summary: 'plugin is off for this repository' }]);
  });

  it('rejects a module without the hook', async () => {
    const result = await provisionProject('/repo', { discover: () => [plugin('empty')], activation: on, load: async () => ({}) });
    expect(result[0].status).toBe('failed');
    expect(result[0].summary).toMatch(/must export provisionProject/);
  });
});
