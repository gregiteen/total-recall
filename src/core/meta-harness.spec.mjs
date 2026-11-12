import { describe, it, expect, vi, beforeEach } from 'vitest';

const { owner, load } = vi.hoisted(() => {
  const owner = {
    HARNESS_SPECS: { fixture: { id: 'fixture' } },
    detectHarnesses: vi.fn(() => [{ id: 'fixture' }]),
    detectHarnessesWithAuth: vi.fn(async () => [{ id: 'fixture', authed: false }]),
    queryHarnessUsage: vi.fn(async () => [{ id: 'fixture', status: 'unverified' }]),
    dispatchTask: vi.fn(async () => ({ ok: false, error: 'owner failure' })),
    runCouncil: vi.fn(async () => ({ ok: false, consensus: 'unavailable' })),
    buildHarnessArgs: vi.fn(() => ['owner-flag']), normalizeToolSelection: vi.fn(() => 'owner-tools'),
    shellQuote: vi.fn(() => 'owner-quote'), resolveHarnessEnv: vi.fn(async () => ({ PATH: '/fixture' })),
    getInstalledHarnessVersion: vi.fn(() => 'owner-version'), getLatestHarnessVersion: vi.fn(async () => null),
  };
  return { owner, load: vi.fn(async () => owner) };
});
vi.mock('./plugin-runtime.mjs', () => ({ loadPluginModule: load }));
const core = await import('./meta-harness.mjs');

beforeEach(() => { vi.clearAllMocks(); load.mockResolvedValue(owner); });

describe('Metaharness owner boundary', () => {
  it('keeps discovery and usage compatibility without a second adapter or auth engine', async () => {
    expect(core.HARNESS_SPECS).toBe(owner.HARNESS_SPECS);
    expect(core.detectHarnesses()).toEqual([{ id: 'fixture' }]);
    expect(await core.queryHarnessUsage()).toEqual([{ id: 'fixture', status: 'unverified' }]);
    expect(owner.detectHarnesses).toHaveBeenCalledOnce();
    expect(owner.queryHarnessUsage).toHaveBeenCalledOnce();
  });

  it('requires the active plugin for execution and preserves failures', async () => {
    const options = { allowUnknownAuth: false };
    expect(await core.dispatchTask('fixture', 'task', options)).toEqual({ ok: false, error: 'owner failure' });
    expect(load).toHaveBeenCalledWith('meta-harness', 'harness-compat', { activeRequired: true });
    expect(owner.dispatchTask).toHaveBeenCalledWith('fixture', 'task', options);
    expect(await core.runCouncil('task', ['fixture'])).toEqual({ ok: false, consensus: 'unavailable' });
  });

  it('does not fall back to a core engine when the owner is missing or inactive', async () => {
    load.mockRejectedValueOnce(new Error('Plugin meta-harness is inactive'));
    await expect(core.dispatchTask('fixture', 'task')).rejects.toThrow('inactive');
    expect(owner.dispatchTask).not.toHaveBeenCalled();
  });

  it('forwards compatibility helpers to the owner', async () => {
    expect(core.buildHarnessArgs({ id: 'fixture' })).toEqual(['owner-flag']);
    expect(core.getInstalledHarnessVersion('fixture')).toBe('owner-version');
    expect(await core.resolveHarnessEnv({ id: 'fixture' })).toEqual({ PATH: '/fixture' });
  });
});
