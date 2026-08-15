import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchLeader,
  fetchNodes,
  refreshElection,
  fetchElectionHistory,
  logElectionObservation,
  fetchAccessProposals,
  importAccessFromSshConfig,
  setNodeAccess,
} from './mesh';
import * as base from './_base';

vi.mock('./_base', () => ({
  get: vi.fn(),
  post: vi.fn(),
}));

describe('mesh api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchLeader calls GET /api/mesh/leader', async () => {
    vi.mocked(base.get).mockResolvedValue({ leader: { hostname: 'foo', ip: '1.2.3.4' } });
    const res = await fetchLeader();
    expect(base.get).toHaveBeenCalledWith('/api/mesh/leader');
    expect(res.hostname).toBe('foo');
  });

  it('fetchNodes calls GET /api/mesh/nodes', async () => {
    vi.mocked(base.get).mockResolvedValue({ nodes: [] });
    const res = await fetchNodes();
    expect(base.get).toHaveBeenCalledWith('/api/mesh/nodes');
    expect(res).toEqual([]);
  });

  it('refreshElection calls POST /api/mesh/election/refresh', async () => {
    vi.mocked(base.post).mockResolvedValue({ leader: { hostname: 'foo', ip: '1.2.3.4' } });
    await refreshElection();
    expect(base.post).toHaveBeenCalledWith('/api/mesh/election/refresh', {});
  });

  it('fetchElectionHistory calls GET /api/mesh/election/history', async () => {
    vi.mocked(base.get).mockResolvedValue({ events: [{ hostname: 'a', ip: '1', note: 'x', at: 't' }] });
    const res = await fetchElectionHistory();
    expect(base.get).toHaveBeenCalledWith('/api/mesh/election/history');
    expect(res).toHaveLength(1);
  });

  it('logElectionObservation calls POST /api/mesh/election/log', async () => {
    vi.mocked(base.post).mockResolvedValue({ success: true, recorded: true });
    await logElectionObservation({ hostname: 'a', ip: '1', note: 'observed' });
    expect(base.post).toHaveBeenCalledWith('/api/mesh/election/log', {
      hostname: 'a',
      ip: '1',
      note: 'observed',
    });
  });

  it('fetchAccessProposals calls GET /api/mesh/access/proposals', async () => {
    vi.mocked(base.get).mockResolvedValue({ proposals: [], missing_access: [], checked_at: 't' });
    await fetchAccessProposals();
    expect(base.get).toHaveBeenCalledWith('/api/mesh/access/proposals');
  });

  // Proposing and applying are separate calls on purpose: a wrong login written
  // to the vault is worse than none, because it then looks authored.
  it('importAccessFromSshConfig calls POST /api/mesh/access/import', async () => {
    vi.mocked(base.post).mockResolvedValue({ success: true, attempted: 0, saved: 0, failed: 0, results: [] });
    await importAccessFromSshConfig();
    expect(base.post).toHaveBeenCalledWith('/api/mesh/access/import', {});
  });

  it('setNodeAccess posts the fields it was given, so an empty one can clear', async () => {
    vi.mocked(base.post).mockResolvedValue({ success: true, path: 'p', access: {} });
    await setNodeAccess({ node: 'node-b.mesh', ssh_user: 'operator', identity_file: '' });
    expect(base.post).toHaveBeenCalledWith('/api/mesh/access', {
      node: 'node-b.mesh',
      ssh_user: 'operator',
      identity_file: '',
    });
  });
});
