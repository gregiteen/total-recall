import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getSecretsChecksum, pullSecretsFromLeader, syncLoop } from './secrets-sync.mjs';
import * as leaderElection from './leader-election.mjs';
import * as secretsStore from './secrets-store.mjs';
import * as throttled from './throttled-fetch.mjs';

vi.mock('node:fs', () => ({ default: { existsSync: vi.fn(), readFileSync: vi.fn() } }));
vi.mock('./leader-election.mjs', () => ({ isLeader: vi.fn(), getLeaderInfo: vi.fn() }));
vi.mock('./config.mjs', () => ({ brainDir: '/mock/brain' }));
vi.mock('./mesh-auth.mjs', () => ({ getMeshSyncAuthorization: vi.fn(async () => 'Bearer mesh-token') }));
vi.mock('./secrets-store.mjs', () => ({
  resolveSecretsPath: vi.fn(() => '/mock/brain/config/secrets.enc'),
  replaceSecretsBufferAtomic: vi.fn(),
}));
vi.mock('./throttled-fetch.mjs', () => ({ throttledFetch: vi.fn() }));
vi.mock('./logger.mjs', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

describe('secrets-sync', () => {
  beforeEach(() => vi.clearAllMocks());

  it('checksums the canonical encrypted secrets store', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('hello'));
    expect(getSecretsChecksum()).toBe(crypto.createHash('sha256').update('hello').digest('hex'));
    expect(secretsStore.resolveSecretsPath).toHaveBeenCalledWith('/mock/brain');
  });

  it('validates and atomically replaces a downloaded store', async () => {
    vi.mocked(throttled.throttledFetch).mockResolvedValue({
      ok: true,
      headers: { get: () => '7' },
      arrayBuffer: async () => Buffer.from('secrets'),
    });
    vi.mocked(secretsStore.replaceSecretsBufferAtomic).mockResolvedValue({ success: true });
    expect(await pullSecretsFromLeader('100.64.0.1')).toBe(true);
    expect(throttled.throttledFetch).toHaveBeenCalledWith(
      'http://100.64.0.1:3000/api/secrets/sync',
      { headers: { Authorization: 'Bearer mesh-token' } },
      10000,
    );
    expect(secretsStore.replaceSecretsBufferAtomic).toHaveBeenCalled();
  });

  it('rejects addresses outside the mesh range', async () => {
    expect(await pullSecretsFromLeader('138.197.199.217')).toBe(false);
    expect(throttled.throttledFetch).not.toHaveBeenCalled();
  });

  it('does nothing when this node is leader', async () => {
    vi.mocked(leaderElection.isLeader).mockResolvedValue(true);
    await syncLoop();
    expect(throttled.throttledFetch).not.toHaveBeenCalled();
  });
});
