/**
 * Sharing mesh login accounts between nodes.
 *
 * A node is only as reachable as its login account is known, and that account
 * used to be typed in by hand, per brain, per machine. Every node now records
 * its own account on its own entity (see `patchOwnMeshNode`), and this module
 * spreads those records: it reads the node entities of each peer this machine
 * can already reach and fills in accounts it does not know yet. One reachable
 * peer is enough to learn the rest.
 *
 * Only accounts and ports travel. Key paths are local facts and are never
 * copied: a path that exists here means nothing anywhere else. Nothing here
 * guesses — an account is only ever taken from a node's own record or from a
 * record another node verified.
 *
 * Portability (open source): no hostname, account or path is hardcoded.
 */

import matter from 'gray-matter';

const DOC_MARKER = '@@TR-MESH-NODE-DOC@@';

/** Shell command that prints a peer's global-brain node entities, one per marker. */
export function remoteNodeDocsCommand() {
  const dir = '"$HOME/.agent/skills/total-recall/memory-vault/system/mesh-nodes"';
  return `for f in ${dir}/*.md; do [ -f "$f" ] && printf '\\n${DOC_MARKER}\\n' && cat "$f"; done; true`;
}

/** Parse the output of `remoteNodeDocsCommand` into node entity objects. */
export function parseRemoteNodeDocs(output = '') {
  return String(output)
    .split(DOC_MARKER)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      try {
        return matter(chunk).data;
      } catch {
        return null;
      }
    })
    .filter((doc) => doc && doc.type === 'mesh_node' && doc.hostname);
}

function hostKey(value) {
  return String(value || '').toLowerCase().split('.')[0].replace(/[^a-z0-9]/g, '');
}

/**
 * Decide which accounts a peer's entities can teach this machine.
 *
 * A peer's record fills a gap; it never overrides an account this machine has
 * already verified. The one exception is a node describing itself
 * (`source: 'self'`), which is authoritative over any unverified entry.
 */
export function planAccessFromPeerDocs(localNodes, peerDocs, peerName) {
  const selfFirst = [...peerDocs].sort(
    (a, b) =>
      Number(hostKey(b.hostname) === hostKey(peerName)) -
      Number(hostKey(a.hostname) === hostKey(peerName)),
  );
  const byHost = new Map();
  for (const doc of selfFirst) {
    const remote = doc.access || {};
    if (!remote.ssh_user) continue;
    const describesItself = hostKey(doc.hostname) === hostKey(peerName);
    // A third party's entry is only worth copying if someone verified it.
    if (!describesItself && !remote.verified_at && remote.source !== 'self') continue;

    const local = localNodes.find(
      (n) => hostKey(n.hostname) === hostKey(doc.hostname) || (doc.ip && String(n.ip) === String(doc.ip)),
    );
    if (!local || local.self || byHost.has(local.hostname)) continue;

    const current = local.access || {};
    const fillsGap = !current.ssh_user;
    const correctsEntry =
      describesItself && remote.source === 'self' && !current.verified_at && current.ssh_user !== remote.ssh_user;
    if (!fillsGap && !correctsEntry) continue;

    byHost.set(local.hostname, {
      hostname: local.hostname,
      access: {
        ssh_user: remote.ssh_user,
        ...(remote.ssh_port ? { ssh_port: remote.ssh_port } : {}),
        source: `mesh:${hostKey(peerName) || 'peer'}`,
      },
    });
  }
  return [...byHost.values()];
}

/**
 * Learn login accounts from every peer this machine can already reach.
 *
 * @returns {Promise<{ peers: object[], learned: object[] }>}
 */
export async function syncAccessFromPeers(options = {}) {
  const { vaultRoot } = options;
  const mesh = await import('./mesh.mjs');
  const { resolveNodeAccess } = await import('./mesh-access.mjs');
  const exec = options.exec || mesh.execMeshCommand;
  const list = options.listNodes || (() => mesh.listEnrichedMeshNodes(vaultRoot));
  const save =
    options.save || ((hostname, patch) => mesh.setMeshNodeAccess(hostname, patch, { vaultRoot }));

  const peers = [];
  const learned = [];
  for (const node of list().filter((n) => !n.self && n.online !== false)) {
    if (!resolveNodeAccess(node).complete) {
      peers.push({ hostname: node.hostname, read: false, reason: 'no login recorded' });
      continue;
    }
    let res;
    try {
      res = await exec(node.hostname, remoteNodeDocsCommand(), { vaultRoot, timeoutMs: 15_000 });
    } catch (err) {
      peers.push({ hostname: node.hostname, read: false, reason: err.message });
      continue;
    }
    if (!res?.success) {
      peers.push({ hostname: node.hostname, read: false, reason: res?.stderr || 'failed' });
      continue;
    }
    const docs = parseRemoteNodeDocs(res.stdout);
    peers.push({ hostname: node.hostname, read: true, documents: docs.length });

    for (const update of planAccessFromPeerDocs(list(), docs, node.hostname)) {
      const result = await save(update.hostname, update.access);
      learned.push({ ...update, from: node.hostname, written: !!result?.written });
    }
  }
  return { peers, learned };
}
