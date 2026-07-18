import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchLeader,
  fetchNodes as fetchMeshNodes,
  refreshElection,
  fetchMeshLatency,
} from '../api/mesh';
import { fetchHeadscaleNodes, fetchPreAuthKeys, fetchHeadscaleUsers, createPreAuthKey, deleteHeadscaleNode } from '../api/headscale';
import type { MeshNode, LeaderInfo } from '../api/mesh';
import type { HeadscaleNode, PreAuthKey as HeadscalePreAuthKey, HeadscaleUser } from '../api/headscale';
import { MeshTopology } from '../components/MeshTopology';
import './MeshPage.css';

const POLL_BASE_MS = 5000;
const POLL_MAX_MS = 30000;

interface ElectionLogEntry {
  at: string;
  hostname: string;
  ip: string;
  note: string;
}

export function MeshPage() {
  const [activeTab, setActiveTab] = useState<'mesh'|'headscale-nodes'|'preauthkeys'|'users'>('mesh');

  // Mesh State
  const [meshNodes, setMeshNodes] = useState<MeshNode[]>([]);
  const [leader, setLeader] = useState<LeaderInfo | null>(null);
  const [selectedNode, setSelectedNode] = useState<MeshNode | null>(null);
  const [latencyMs, setLatencyMs] = useState<Record<string, number | null>>({});
  const [electionLog, setElectionLog] = useState<ElectionLogEntry[]>([]);
  const prevLeaderRef = useRef<string | null>(null);
  const pollMsRef = useRef(POLL_BASE_MS);
  
  // Headscale State
  const [hsNodes, setHsNodes] = useState<HeadscaleNode[]>([]);
  const [hsKeys, setHsKeys] = useState<HeadscalePreAuthKey[]>([]);
  const [hsUsers, setHsUsers] = useState<HeadscaleUser[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Key form state
  const [newKeyUser, setNewKeyUser] = useState('default');
  const [newKeyReusable, setNewKeyReusable] = useState(false);
  const [newKeyEphemeral, setNewKeyEphemeral] = useState(false);
  const [newKeyExpiration, setNewKeyExpiration] = useState('2099-12-31T23:59:59Z');

  const recordLeaderChange = useCallback((l: LeaderInfo | null, note: string) => {
    if (!l) return;
    const key = `${l.hostname}|${l.ip}`;
    if (prevLeaderRef.current === key && note === 'observed') return;
    if (prevLeaderRef.current !== key || note !== 'observed') {
      setElectionLog((prev) => [
        { at: new Date().toISOString(), hostname: l.hostname, ip: l.ip, note },
        ...prev,
      ].slice(0, 50));
      prevLeaderRef.current = key;
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'mesh') {
        const [n, l] = await Promise.all([fetchMeshNodes(), fetchLeader()]);
        setMeshNodes(n);
        setLeader(l);
        recordLeaderChange(l, 'observed');
        // Latency is slower — best-effort, do not fail the page.
        fetchMeshLatency()
          .then((lat) => setLatencyMs(lat.latency_ms || {}))
          .catch(() => { /* peers may be unreachable */ });
        pollMsRef.current = POLL_BASE_MS;
      } else if (activeTab === 'headscale-nodes') {
        const nodes = await fetchHeadscaleNodes();
        setHsNodes(nodes);
      } else if (activeTab === 'preauthkeys') {
        const keys = await fetchPreAuthKeys(newKeyUser || 'default');
        setHsKeys(keys);
      } else if (activeTab === 'users') {
        const users = await fetchHeadscaleUsers();
        setHsUsers(users);
      }
    } catch (err: any) {
      setError(err.message || `Failed to load ${activeTab} data`);
      // Back off polling on errors to reduce long-task pressure.
      pollMsRef.current = Math.min(POLL_MAX_MS, pollMsRef.current * 1.5);
    } finally {
      setLoading(false);
    }
  }, [activeTab, newKeyUser, recordLeaderChange]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      await loadData();
      if (cancelled) return;
      timer = setTimeout(tick, pollMsRef.current);
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeTab, loadData]);

  async function handleRefreshElection() {
    try {
      const l = await refreshElection();
      recordLeaderChange(l, 'manual refresh');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to refresh election state');
    }
  }

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createPreAuthKey({
        user: newKeyUser,
        reusable: newKeyReusable,
        ephemeral: newKeyEphemeral,
        expiration: newKeyExpiration
      });
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create pre-auth key');
    }
  }

  async function handleDeleteNode(id: string) {
    if (!confirm('Are you sure you want to delete this node from Headscale?')) return;
    try {
      await deleteHeadscaleNode(id);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete node');
    }
  }

  return (
    <div className="page-container mesh-page">
      <div className="page-header">
        <h1>Mesh Operations Center</h1>
        {activeTab === 'mesh' && (
          <button
            onClick={handleRefreshElection}
            className="btn btn-primary"
          >
            Refresh Election
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border)' }}>
        <button 
          className={`btn ${activeTab === 'mesh' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('mesh')}
          style={activeTab === 'mesh' ? {} : { borderBottom: 'none' }}
        >
          Daemon Status
        </button>
        <button 
          className={`btn ${activeTab === 'headscale-nodes' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('headscale-nodes')}
        >
          Headscale Nodes
        </button>
        <button 
          className={`btn ${activeTab === 'preauthkeys' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('preauthkeys')}
        >
          Pre-Auth Keys
        </button>
        <button 
          className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('users')}
        >
          Users
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '24px' }}>{error}</div>}

      {activeTab === 'mesh' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Topology</h3>
              <MeshTopology
                nodes={meshNodes}
                leader={leader}
                latencyMs={latencyMs}
                selectedHostname={selectedNode?.hostname}
                onSelectNode={setSelectedNode}
              />
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Node Detail</h3>
              {selectedNode ? (
                <dl className="mesh-node-detail" style={{ margin: 0, display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 12px' }}>
                  <dt style={{ color: 'var(--text-secondary)' }}>Title</dt>
                  <dd style={{ margin: 0 }}>{selectedNode.title || selectedNode.hostname}</dd>
                  <dt style={{ color: 'var(--text-secondary)' }}>Hostname</dt>
                  <dd style={{ margin: 0 }}>{selectedNode.hostname}</dd>
                  <dt style={{ color: 'var(--text-secondary)' }}>IP</dt>
                  <dd style={{ margin: 0 }}>{selectedNode.ip || '—'}</dd>
                  <dt style={{ color: 'var(--text-secondary)' }}>Online</dt>
                  <dd style={{ margin: 0 }}>
                    {selectedNode.online ? 'yes' : 'no'}
                    {selectedNode.vault_only ? ' (vault-only entity)' : ''}
                  </dd>
                  <dt style={{ color: 'var(--text-secondary)' }}>OS</dt>
                  <dd style={{ margin: 0 }}>{selectedNode.os || 'Unknown'}</dd>
                  <dt style={{ color: 'var(--text-secondary)' }}>Election</dt>
                  <dd style={{ margin: 0 }}>
                    {selectedNode.hostname === leader?.hostname || selectedNode.ip === leader?.ip ? 'LEADER' : 'FOLLOWER'}
                  </dd>
                  <dt style={{ color: 'var(--text-secondary)' }}>Entity role</dt>
                  <dd style={{ margin: 0 }}>{selectedNode.role || '—'}</dd>
                  <dt style={{ color: 'var(--text-secondary)' }}>Labels</dt>
                  <dd style={{ margin: 0 }}>
                    {selectedNode.labels?.length ? selectedNode.labels.join(', ') : '—'}
                  </dd>
                  <dt style={{ color: 'var(--text-secondary)' }}>Capabilities</dt>
                  <dd style={{ margin: 0 }}>
                    {selectedNode.capabilities?.length ? selectedNode.capabilities.join(', ') : '—'}
                  </dd>
                  <dt style={{ color: 'var(--text-secondary)' }}>Notes</dt>
                  <dd style={{ margin: 0 }}>{selectedNode.notes || selectedNode.description || '—'}</dd>
                  <dt style={{ color: 'var(--text-secondary)' }}>Latency</dt>
                  <dd style={{ margin: 0 }}>
                    {selectedNode.self
                      ? 'self'
                      : latencyMs[selectedNode.hostname] != null
                        ? `${latencyMs[selectedNode.hostname]} ms`
                        : 'n/a'}
                  </dd>
                  <dt style={{ color: 'var(--text-secondary)' }}>Entity</dt>
                  <dd style={{ margin: 0 }}>
                    {selectedNode.has_entity
                      ? selectedNode.entity_path || 'vault mesh_node'
                      : 'live discovery only (no vault entity yet)'}
                  </dd>
                  <dt style={{ color: 'var(--text-secondary)' }}>Scope</dt>
                  <dd style={{ margin: 0 }}>{selectedNode.self ? 'This node' : 'Peer'}</dd>
                </dl>
              ) : (
                <p style={{ color: 'var(--text-secondary)' }}>Click a node in the topology to inspect it.</p>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Hostname</th>
                  <th>Mesh IP</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Latency</th>
                  <th>Operating System</th>
                  <th>Node</th>
                </tr>
              </thead>
              <tbody>
                {meshNodes.map(node => {
                  const isNodeLeader = node.hostname === leader?.hostname || node.ip === leader?.ip;
                  return (
                    <tr
                      key={node.hostname}
                      className={isNodeLeader ? 'is-leader' : ''}
                      onClick={() => setSelectedNode(node)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isNodeLeader && <span title="Leader" style={{ color: 'var(--accent-hover)' }}>👑</span>}
                        {node.hostname}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{node.ip}</td>
                      <td>
                        <span className={`badge ${isNodeLeader ? 'badge-leader' : 'badge-follower'}`}>
                          {isNodeLeader ? 'LEADER' : 'FOLLOWER'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${node.online ? 'badge-online' : 'badge-offline'}`}>
                          {node.online ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {node.self ? '—' : latencyMs[node.hostname] != null ? `${latencyMs[node.hostname]} ms` : '—'}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{node.os || 'Unknown'}</td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{node.self ? 'This node' : 'Peer'}</td>
                    </tr>
                  );
                })}
                {meshNodes.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px' }}>
                      No mesh nodes found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Latency (from this node)</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Peer</th>
                    <th>RTT</th>
                  </tr>
                </thead>
                <tbody>
                  {meshNodes.map((n) => (
                    <tr key={`lat-${n.hostname}`}>
                      <td>{n.hostname}</td>
                      <td>
                        {n.self
                          ? '0 ms (self)'
                          : latencyMs[n.hostname] != null
                            ? `${latencyMs[n.hostname]} ms`
                            : n.online
                              ? 'measuring…'
                              : 'offline'}
                      </td>
                    </tr>
                  ))}
                  {meshNodes.length === 0 && (
                    <tr>
                      <td colSpan={2} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>No peers</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Election history</h3>
              {electionLog.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>No leader changes observed this session.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 220, overflowY: 'auto' }}>
                  {electionLog.map((e, i) => (
                    <li key={`${e.at}-${i}`} style={{ marginBottom: 8 }}>
                      <strong>{e.hostname}</strong> ({e.ip}) — {e.note}
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {new Date(e.at).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'headscale-nodes' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>IP Addresses</th>
                <th>User</th>
                <th>Client Version</th>
                <th>Last Seen</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {hsNodes.map(node => (
                <tr key={node.id}>
                  <td>{node.id}</td>
                  <td style={{ fontWeight: 500 }}>{node.name}</td>
                  <td>{node.ipAddresses.join(', ')}</td>
                  <td>{typeof node.user === 'object' ? node.user?.name : (node.user || '')}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{node.clientVersion}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {new Date(node.lastSeen).toLocaleString()}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => handleDeleteNode(node.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {hsNodes.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px' }}>
                    No Headscale nodes found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'preauthkeys' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="card">
            <h3>Generate Pre-Auth Key</h3>
            <form onSubmit={handleCreateKey} style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', marginTop: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>User</label>
                <input className="input" value={newKeyUser} onChange={e => setNewKeyUser(e.target.value)} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Expiration</label>
                <input type="datetime-local" className="input" value={newKeyExpiration.slice(0,16)} onChange={e => setNewKeyExpiration(new Date(e.target.value).toISOString())} required />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '8px' }}>
                <input type="checkbox" checked={newKeyReusable} onChange={e => setNewKeyReusable(e.target.checked)} id="reusable" />
                <label htmlFor="reusable" style={{ fontSize: '14px' }}>Reusable</label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '8px' }}>
                <input type="checkbox" checked={newKeyEphemeral} onChange={e => setNewKeyEphemeral(e.target.checked)} id="ephemeral" />
                <label htmlFor="ephemeral" style={{ fontSize: '14px' }}>Ephemeral</label>
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading}>Generate Key</button>
            </form>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Key</th>
                  <th>User</th>
                  <th>Reusable</th>
                  <th>Ephemeral</th>
                  <th>Used</th>
                  <th>Expiration</th>
                </tr>
              </thead>
              <tbody>
                {hsKeys.map(key => (
                  <tr key={key.id}>
                    <td>{key.id}</td>
                    <td style={{ fontFamily: 'monospace' }}>{key.key}</td>
                    <td>{key.user}</td>
                    <td>{key.reusable ? 'Yes' : 'No'}</td>
                    <td>{key.ephemeral ? 'Yes' : 'No'}</td>
                    <td>
                      <span className={`badge ${key.used ? 'badge-offline' : 'badge-online'}`}>
                        {key.used ? 'USED' : 'UNUSED'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      {new Date(key.expiration).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {hsKeys.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px' }}>
                      No pre-auth keys found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {hsUsers.map(user => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td style={{ fontWeight: 500 }}>{user.name}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {new Date(user.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {hsUsers.length === 0 && !loading && (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px' }}>
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
