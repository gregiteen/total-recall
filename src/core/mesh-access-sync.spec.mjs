import { describe, expect, it } from 'vitest';
import {
  parseRemoteNodeDocs,
  planAccessFromPeerDocs,
  remoteNodeDocsCommand,
  syncAccessFromPeers,
} from './mesh-access-sync.mjs';

const MARKER = '@@TR-MESH-NODE-DOC@@';

function doc(hostname, access, extra = '') {
  return `\n${MARKER}\n---\ntype: mesh_node\nhostname: ${JSON.stringify(hostname)}\n${extra}access: ${JSON.stringify(access)}\n---\n\nbody\n`;
}

describe('parseRemoteNodeDocs', () => {
  it('splits concatenated entities and keeps only mesh nodes', () => {
    const output =
      doc('box.mesh.example', { ssh_user: 'alice', source: 'self' }) +
      `\n${MARKER}\n---\ntype: note\nhostname: x\n---\n` +
      `\n${MARKER}\nnot yaml at all: [\n`;
    const docs = parseRemoteNodeDocs(output);
    expect(docs).toHaveLength(1);
    expect(docs[0].hostname).toBe('box.mesh.example');
    expect(docs[0].access.ssh_user).toBe('alice');
  });

  it('reads from the global brain and never fails on an empty directory', () => {
    const command = remoteNodeDocsCommand();
    expect(command).toContain('$HOME/.agent/skills/total-recall/memory-vault/system/mesh-nodes');
    expect(command.trim().endsWith('true')).toBe(true);
  });
});

describe('planAccessFromPeerDocs', () => {
  const local = [
    { hostname: 'me.mesh.example', self: true, access: {} },
    { hostname: 'box.mesh.example', ip: '100.64.0.2', access: {} },
    { hostname: 'laptop.mesh.example', ip: '100.64.0.6', access: { ssh_user: 'guess' } },
    { hostname: 'cloud.mesh.example', ip: '100.64.0.1', access: { ssh_user: 'root', verified_at: 't' } },
  ];

  it("learns a peer's own account, which is the one authority on it", () => {
    const docs = parseRemoteNodeDocs(doc('box.mesh.example', { ssh_user: 'alice', source: 'self' }));
    expect(planAccessFromPeerDocs(local, docs, 'box.mesh.example')).toEqual([
      { hostname: 'box.mesh.example', access: { ssh_user: 'alice', source: 'mesh:box' } },
    ]);
  });

  it('lets a node describing itself correct an unverified entry, but not a verified one', () => {
    const laptopSelf = parseRemoteNodeDocs(doc('laptop.mesh.example', { ssh_user: 'bob', source: 'self' }));
    expect(planAccessFromPeerDocs(local, laptopSelf, 'laptop.mesh.example')[0].access.ssh_user).toBe('bob');

    const cloudSelf = parseRemoteNodeDocs(doc('cloud.mesh.example', { ssh_user: 'admin', source: 'self' }));
    expect(planAccessFromPeerDocs(local, cloudSelf, 'cloud.mesh.example')).toEqual([]);
  });

  it("copies a third party's entry only when it was verified, and only into a gap", () => {
    const docs = parseRemoteNodeDocs(
      doc('box.mesh.example', { ssh_user: 'unverified', source: 'manual' }) +
        doc('laptop.mesh.example', { ssh_user: 'carol', verified_at: 't' }),
    );
    // box: unverified third-party entry is ignored; laptop: local already has a user.
    expect(planAccessFromPeerDocs(local, docs, 'cloud.mesh.example')).toEqual([]);

    const verified = parseRemoteNodeDocs(doc('box.mesh.example', { ssh_user: 'dave', verified_at: 't', ssh_port: 2222 }));
    expect(planAccessFromPeerDocs(local, verified, 'cloud.mesh.example')).toEqual([
      { hostname: 'box.mesh.example', access: { ssh_user: 'dave', ssh_port: 2222, source: 'mesh:cloud' } },
    ]);
  });

  it('never copies a key path and never touches this machine', () => {
    const docs = parseRemoteNodeDocs(
      doc('box.mesh.example', { ssh_user: 'alice', source: 'self', identity_file: '/peer/id_key' }) +
        doc('me.mesh.example', { ssh_user: 'someone', verified_at: 't' }),
    );
    const plan = planAccessFromPeerDocs(local, docs, 'box.mesh.example');
    expect(plan).toHaveLength(1);
    expect(plan[0].access).not.toHaveProperty('identity_file');
  });
});

describe('syncAccessFromPeers', () => {
  it('reads reachable peers, skips ones without a login, and saves what it learns', async () => {
    const nodes = [
      { hostname: 'me.mesh.example', self: true, ip: '100.64.0.4', access: {} },
      { hostname: 'cloud.mesh.example', ip: '100.64.0.1', online: true, access: { ssh_user: 'root', verified_at: 't' } },
      { hostname: 'box.mesh.example', ip: '100.64.0.2', online: true, access: {} },
    ];
    const saved = [];
    const result = await syncAccessFromPeers({
      listNodes: () => nodes,
      exec: async (host) => ({
        success: true,
        stdout: host.startsWith('cloud')
          ? doc('box.mesh.example', { ssh_user: 'alice', verified_at: 't' })
          : '',
      }),
      save: async (hostname, access) => {
        saved.push({ hostname, access });
        return { written: true };
      },
    });

    expect(result.peers).toEqual([
      { hostname: 'cloud.mesh.example', read: true, documents: 1 },
      { hostname: 'box.mesh.example', read: false, reason: 'no login recorded' },
    ]);
    expect(saved).toEqual([
      { hostname: 'box.mesh.example', access: { ssh_user: 'alice', source: 'mesh:cloud' } },
    ]);
    expect(result.learned[0]).toMatchObject({ hostname: 'box.mesh.example', from: 'cloud.mesh.example', written: true });
  });
});
