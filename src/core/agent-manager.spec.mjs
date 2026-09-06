import { describe, it, expect } from 'vitest';
import { listAgents, isProcessRunning, spawnAgent } from './agent-manager.mjs';

describe('Agent Process Manager', () => {
  it('lists agents and returns an array', () => {
    const agents = listAgents();
    expect(Array.isArray(agents)).toBe(true);
  });

  it('checks process liveness correctly for current process and invalid pid', () => {
    expect(isProcessRunning(process.pid)).toBe(true);
    expect(isProcessRunning(999999999)).toBe(false);
    expect(isProcessRunning(null)).toBe(false);
  });

  it('throws on unknown harness ID for spawnAgent', async () => {
    await expect(spawnAgent('invalid-harness', 'test task')).rejects.toThrow(
      'Unknown harness ID "invalid-harness"',
    );
  });
});
