import { describe, it, expect } from 'vitest';
import { meshPeerUrl, parsePeerSource, listPeerPlugins, fetchPeerBundle } from './plugin-peers.mjs';

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body)
});

const shared = { id: 'git-sentinel', name: 'Git Sentinel', version: '1.1.0', description: 'd', use_cases: ['software-development'], sha256: 'a'.repeat(64), file_count: 3, size_bytes: 10 };

describe('plugin-peers', () => {
  it('only builds URLs inside the mesh range', () => {
    expect(meshPeerUrl('100.64.0.2', '/x')).toMatch(/^http:\/\/100\.64\.0\.2:\d+\/x$/);
    expect(() => meshPeerUrl('10.0.0.2', '/x')).toThrow(/outside the mesh range/);
    expect(() => meshPeerUrl('169.254.169.254', '/x')).toThrow();
    expect(meshPeerUrl('100.64.0.2', '/x', 3900)).toBe('http://100.64.0.2:3900/x');
  });

  it('parses peer sources', () => {
    expect(parsePeerSource('peer:mac-mini/git-sentinel')).toEqual({ hostname: 'mac-mini', id: 'git-sentinel' });
    expect(parsePeerSource('peer:mac-mini/Bad_ID')).toBeNull();
    expect(parsePeerSource('git-sentinel')).toBeNull();
  });

  it('reports no mesh honestly', async () => {
    expect(await listPeerPlugins({ meshAvailable: false })).toEqual({ mesh: { available: false, configured: false }, peers: [] });
  });

  it('reports each peer exactly as observed', async () => {
    const peers = [
      { hostname: 'a', ip: '100.64.0.2', brain_port: 3900, online: true },
      { hostname: 'b', ip: '100.64.0.3', online: false },
      { hostname: 'c', ip: '100.64.0.4', online: true },
      { hostname: 'd', ip: '100.64.0.5', online: true },
      { hostname: 'e', ip: '100.64.0.6', online: true },
      { hostname: 'me', ip: '100.64.0.1', online: true, self: true }
    ];
    const fetchImpl = async (url) => {
      if (url.includes('100.64.0.2:3900')) return response(200, { plugins: [shared, { id: 'no-hash' }] });
      if (url.includes('100.64.0.4')) return { ok: true, status: 200, headers: { get: () => 'text/html' }, json: async () => { throw new SyntaxError("Unexpected token '<'"); } };
      if (url.includes('100.64.0.5')) return response(401, {});
      if (url.includes('100.64.0.6')) throw new Error('fetch failed');
      throw new Error('connect ETIMEDOUT');
    };
    const result = await listPeerPlugins({ meshAvailable: true, peers, authorization: 'Bearer t', fetchImpl });
    const byHost = Object.fromEntries(result.peers.map(p => [p.hostname, p]));
    expect(result.mesh).toEqual({ available: true, configured: true });
    expect(byHost.me).toBeUndefined();
    expect(byHost.a.status).toBe('ok');
    expect(byHost.a.plugins.map(p => p.id)).toEqual(['git-sentinel']);
    expect(byHost.b.status).toBe('offline');
    expect(byHost.c.status).toBe('unsupported');
    expect(byHost.d.status).toBe('error');
    expect(byHost.e.status).toBe('unreachable');
    expect(byHost.e.error).toMatch(/No Total Recall server answered at 100\.64\.0\.6:\d+/);
    for (const p of byHost.a.plugins) {
      expect(Object.keys(p)).not.toEqual(expect.arrayContaining(['rating']));
    }
  });

  it('marks every peer not_configured when this node has no mesh token', async () => {
    const result = await listPeerPlugins({
      meshAvailable: true,
      peers: [{ hostname: 'a', ip: '100.64.0.2', online: true }],
      authorization: null,
      fetchImpl: async () => { throw new Error('should not be called'); }
    });
    expect(result.mesh.configured).toBe(false);
    expect(result.peers[0].status).toBe('not_configured');
  });

  it('refuses a plugin the peer does not share', async () => {
    const deps = {
      peers: [{ hostname: 'a', ip: '100.64.0.2', online: true }],
      authorization: 'Bearer t',
      fetchImpl: async () => response(200, { plugins: [] })
    };
    await expect(fetchPeerBundle('a', 'git-sentinel', deps)).rejects.toThrow(/does not share/);
    await expect(fetchPeerBundle('zzz', 'git-sentinel', deps)).rejects.toThrow(/No mesh peer/);
  });
});
