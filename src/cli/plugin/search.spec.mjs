import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../core/plugin-peers.mjs', () => ({
  listPeerPlugins: vi.fn(async () => ({ mesh: { available: false, configured: false }, peers: [] })),
}));

import { listAvailable, listPeers, searchPlugins } from './search.mjs';
import { listBundledPlugins } from '../../core/plugin-loader.mjs';

describe('search.mjs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints every bundled plugin as JSON', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await listAvailable(['--json']);
    const parsed = JSON.parse(log.mock.calls[0][0]);
    expect(parsed.map(p => p.id).sort()).toEqual(listBundledPlugins().map(p => p.id).sort());
  });

  it('filters bundled plugins by text', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await listAvailable(['git', '--json']);
    expect(JSON.parse(log.mock.calls[0][0]).map(p => p.id)).toEqual(['git-sentinel']);
  });

  it('says so when this node is not on a mesh', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await listPeers([]);
    expect(log.mock.calls.map(c => c.join(' ')).join('\n')).toContain('not connected to a mesh');
  });

  it('says so when nothing matches', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await searchPlugins(['zzz-no-such-plugin']);
    expect(log.mock.calls.map(c => c.join(' ')).join('\n')).toContain('No plugins found');
  });
});
