import { describe, it, expect, vi, beforeEach } from 'vitest';

const { owner, load } = vi.hoisted(() => {
  const owner = {
    listAgents: vi.fn(() => [{ id: 'agent-fixture', status: 'running' }]),
    loadAgentState: vi.fn(() => []), saveAgentState: vi.fn(), isProcessRunning: vi.fn(() => true),
    buildRemoteSpawnCommand: vi.fn(() => 'owner-command'),
    spawnAgent: vi.fn(async () => ({ id: 'agent-fixture', status: 'starting' })),
    killAgent: vi.fn(async () => ({ success: true })), getAgentLogs: vi.fn(async () => 'owner logs'),
  };
  return { owner, load: vi.fn(async () => owner) };
});
vi.mock('./plugin-runtime.mjs', () => ({ loadPluginModule: load }));
const core = await import('./agent-manager.mjs');

beforeEach(() => { vi.clearAllMocks(); load.mockResolvedValue(owner); });

describe('managed process owner boundary', () => {
  it('reads process metadata and compatibility helpers from the owner', () => {
    expect(core.listAgents()).toEqual([{ id: 'agent-fixture', status: 'running' }]);
    expect(core.buildRemoteSpawnCommand('fixture', 'task')).toBe('owner-command');
    expect(owner.buildRemoteSpawnCommand).toHaveBeenCalledWith('fixture', 'task');
  });
  it('requires the active owner for spawning and forwards explicit restrictions', async () => {
    const options = { cwd: '/fixture', tools: 'none', allowUnknownAuth: false, write: false };
    expect(await core.spawnAgent('fixture', 'task', options)).toMatchObject({ status: 'starting' });
    expect(load).toHaveBeenCalledWith('meta-harness', 'process-manager', { activeRequired: true });
    expect(owner.spawnAgent).toHaveBeenCalledWith('fixture', 'task', options);
  });
  it('does not create an unmanaged process when owner loading fails', async () => {
    load.mockRejectedValueOnce(new Error('owner unavailable'));
    await expect(core.spawnAgent('fixture', 'task')).rejects.toThrow('owner unavailable');
    expect(owner.spawnAgent).not.toHaveBeenCalled();
  });
  it('delegates termination and logs to the same owner', async () => {
    expect(await core.killAgent('agent-fixture')).toEqual({ success: true });
    expect(await core.getAgentLogs('agent-fixture', 20)).toBe('owner logs');
    expect(owner.getAgentLogs).toHaveBeenCalledWith('agent-fixture', 20);
  });
});
