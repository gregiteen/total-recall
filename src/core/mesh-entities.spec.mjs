import { describe, it, expect } from 'vitest';
import {
  meshNodeDocSlug,
  mergeLivePeersWithEntities,
  normalizeHostname,
} from './mesh.mjs';

describe('meshNodeDocSlug', () => {
  it('derives a portable slug from any hostname (no fixed device names)', () => {
    expect(meshNodeDocSlug('Node-A.Example.TS.net.')).toBe('node-a-example-ts-net');
    expect(meshNodeDocSlug('node-b.mesh')).toBe('node-b-mesh');
  });
});

describe('mergeLivePeersWithEntities', () => {
  it('prefers live online/ip and attaches vault entity variables', () => {
    const live = [
      { hostname: 'node-a.mesh', ip: '100.64.0.1', online: true, self: true, os: 'linux' },
      { hostname: 'node-b.mesh', ip: '100.64.0.2', online: true, self: false, os: 'linux' },
    ];
    const entities = [
      {
        type: 'mesh_node',
        hostname: 'node-a.mesh',
        ip: '100.64.0.99',
        role: 'build-host',
        labels: ['ci'],
        capabilities: ['gpu'],
        notes: 'primary builder',
        title: 'Builder A',
        vfs_path: 'system/mesh-nodes/node-a-mesh.md',
      },
    ];
    const merged = mergeLivePeersWithEntities(live, entities);
    const a = merged.find((n) => n.hostname === 'node-a.mesh');
    expect(a.ip).toBe('100.64.0.1'); // live IP wins
    expect(a.online).toBe(true);
    expect(a.role).toBe('build-host');
    expect(a.labels).toEqual(['ci']);
    expect(a.capabilities).toEqual(['gpu']);
    expect(a.notes).toBe('primary builder');
    expect(a.title).toBe('Builder A');
    expect(a.has_entity).toBe(true);
    expect(a.entity_path).toBe('system/mesh-nodes/node-a-mesh.md');

    const b = merged.find((n) => n.hostname === 'node-b.mesh');
    expect(b.has_entity).toBe(false);
    expect(b.role).toBeNull();
  });

  it('includes vault-only entities not currently on the mesh', () => {
    const live = [{ hostname: 'node-a.mesh', ip: '100.64.0.1', online: true, self: true, os: null }];
    const entities = [
      {
        type: 'mesh_node',
        hostname: 'node-offline.mesh',
        ip: '100.64.0.9',
        role: 'archive',
        vfs_path: 'system/mesh-nodes/node-offline-mesh.md',
      },
    ];
    const merged = mergeLivePeersWithEntities(live, entities);
    expect(merged).toHaveLength(2);
    const offline = merged.find((n) => n.hostname === 'node-offline.mesh');
    expect(offline.online).toBe(false);
    expect(offline.vault_only).toBe(true);
    expect(offline.role).toBe('archive');
  });

  it('matches entity by IP when hostnames differ in form', () => {
    const live = [{ hostname: 'node-a', ip: '100.64.0.1', online: true, self: true, os: null }];
    const entities = [
      {
        type: 'mesh_node',
        hostname: 'node-a.example.ts.net',
        ip: '100.64.0.1',
        role: 'edge',
        vfs_path: 'system/mesh-nodes/node-a.md',
      },
    ];
    const merged = mergeLivePeersWithEntities(live, entities);
    expect(merged[0].role).toBe('edge');
    expect(merged[0].has_entity).toBe(true);
  });
});

describe('normalizeHostname (entity keys)', () => {
  it('strips trailing MagicDNS dots for entity matching', () => {
    expect(normalizeHostname('node.example.ts.net.')).toBe('node.example.ts.net');
  });
});
