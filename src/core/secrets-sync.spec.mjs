import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getSecretsChecksum, pullSecretsFromLeader, syncLoop } from './secrets-sync.mjs';
import * as leaderElection from './leader-election.mjs';

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn()
  }
}));

vi.mock('./leader-election.mjs', () => ({
  isLeader: vi.fn(),
  getLeaderInfo: vi.fn(),
}));

vi.mock('./config.mjs', () => ({
  agentDir: '/mock/agent',
  brainDir: '/mock/brain'
}));

vi.mock('./logger.mjs', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

global.fetch = vi.fn();

describe('secrets-sync module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getSecretsChecksum returns null if missing', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(getSecretsChecksum()).toBe(null);
  });

  it('getSecretsChecksum returns sha256', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('hello'));
    const hash = crypto.createHash('sha256').update('hello').digest('hex');
    expect(getSecretsChecksum()).toBe(hash);
  });

  it('pullSecretsFromLeader writes to file', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from('secrets')
    });
    
    const res = await pullSecretsFromLeader('100.64.0.1');
    expect(res).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('syncLoop does nothing if leader', async () => {
    vi.mocked(leaderElection.isLeader).mockResolvedValue(true);
    await syncLoop();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
