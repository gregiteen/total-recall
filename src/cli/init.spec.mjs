import { describe, it, expect } from 'vitest';
import init, { connectDetectedClients } from './init.mjs';

describe('init.mjs', () => {
  it('exports default', () => {
    expect(init).toBeDefined();
  });
});

describe('connectDetectedClients', () => {
  it('connects each detected IDE once so compile writes its instruction shim', async () => {
    const calls = [];
    const connected = await connectDetectedClients(
      [
        { clients: ['claude-code'] },
        { clients: ['antigravity', 'gemini'] },
        { clients: ['claude-code'] },
      ],
      { connectFn: async (args) => { calls.push(args[0]); } },
    );
    expect(calls).toEqual(['claude-code', 'antigravity']);
    expect(connected).toEqual(['claude-code', 'antigravity']);
  });

  it('skips targets with no known connect client and keeps going after a failure', async () => {
    const connected = await connectDetectedClients(
      [{ clients: ['not-a-client'] }, { clients: ['codex'] }, { clients: ['claude-code'] }],
      { connectFn: async ([c]) => { if (c === 'codex') throw new Error('boom'); } },
    );
    expect(connected).toEqual(['claude-code']);
  });
});
