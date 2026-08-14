import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchLeader,
  fetchNodes as fetchMeshNodes,
  refreshElection,
  fetchMeshLatency,
  fetchLanDiscovery,
  fetchMeshInterfaces,
  fetchDeviceIo,
  registerLanMeshNodes,
  fetchElectionHistory,
  logElectionObservation,
  fetchEnrollmentStatus,
  enrollThisNode,
} from '../api/mesh';
import { fetchHeadscaleNodes, fetchPreAuthKeys, fetchHeadscaleUsers, createPreAuthKey, deleteHeadscaleNode, fetchHeadscalePolicy, saveHeadscalePolicy, buildMeshSshPolicy } from '../api/headscale';
import type {
  MeshNode,
  LeaderInfo,
  LanHost,
  MeshInterfaceSummary,
  DeviceIoProfile,
  EnrollmentStatus,
} from '../api/mesh';
import type { HeadscaleNode, PreAuthKey as HeadscalePreAuthKey, HeadscaleUser } from '../api/headscale';
import { MeshTopology } from '../components/MeshTopology';
import { EmbeddingProviderPanel } from '../components/EmbeddingProviderPanel';
import { LatencySparkline } from '../components/LatencySparkline';
import './MeshPage.css';

const POLL_BASE_MS = 5000;
const POLL_MAX_MS = 30000;
const LATENCY_HISTORY_MAX = 24;

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
  /** Rolling RTT samples per hostname for sparklines (from this node). */
  const [latencyHistory, setLatencyHistory] = useState<Record<string, number[]>>({});
  const [electionLog, setElectionLog] = useState<ElectionLogEntry[]>([]);
  const [lanHosts, setLanHosts] = useState<LanHost[]>([]);
  const [localInterfaces, setLocalInterfaces] = useState<MeshInterfaceSummary[]>([]);
  const [lanTrCount, setLanTrCount] = useState(0);
  const [deviceIo, setDeviceIo] = useState<DeviceIoProfile | null>(null);
  const [uiHints, setUiHints] = useState<string[]>([]);
  const [enrollment, setEnrollment] = useState<EnrollmentStatus | null>(null);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState<string | null>(null);
  // Mesh SSH is a property of the control server, not of this node, so it is
  // tracked separately from enrollment.
  const [sshPolicy, setSshPolicy] = useState<{ configured: boolean; fileMode?: boolean } | null>(null);
  const [sshBusy, setSshBusy] = useState(false);
  const [sshMsg, setSshMsg] = useState<string | null>(null);
  const [lanRegisterBusy, setLanRegisterBusy] = useState(false);
  const [lanRegisterMsg, setLanRegisterMsg] = useState<string | null>(null);
  const prevLeaderRef = useRef<string | null>(null);
  const pollMsRef = useRef(POLL_BASE_MS);
  const electionHistoryLoadedRef = useRef(false);
  
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
      const at = new Date().toISOString();
      setElectionLog((prev) => [
        { at, hostname: l.hostname, ip: l.ip, note },
        ...prev,
      ].slice(0, 50));
      prevLeaderRef.current = key;
      // Persist to SSSS event store (best-effort; de-duped server-side).
      logElectionObservation({ hostname: l.hostname, ip: l.ip, note }).catch(() => {});
    }
  }, []);

  const pushLatencySamples = useCallback((sample: Record<string, number | null>) => {
    setLatencyMs(sample);
    setLatencyHistory((prev) => {
      const next = { ...prev };
      for (const [host, ms] of Object.entries(sample)) {
        if (ms == null || !Number.isFinite(ms)) continue;
        const series = [...(next[host] || []), ms].slice(-LATENCY_HISTORY_MAX);
        next[host] = series;
      }
      return next;
    });
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
          .then((lat) => pushLatencySamples(lat.latency_ms || {}))
          .catch(() => { /* peers may be unreachable */ });
        // Load durable election history once per mount.
        if (!electionHistoryLoadedRef.current) {
          electionHistoryLoadedRef.current = true;
          fetchElectionHistory()
            .then((events) => {
              if (!events.length) return;
              setElectionLog((prev) => {
                const seen = new Set(prev.map((e) => `${e.at}|${e.hostname}|${e.note}`));
                const fromVault: ElectionLogEntry[] = events
                  .filter((e) => e.at && (e.hostname || e.ip))
                  .map((e) => ({
                    at: e.at,
                    hostname: e.hostname || e.ip || 'unknown',
                    ip: e.ip || '',
                    note: e.note || 'observed',
                  }))
                  .filter((e) => !seen.has(`${e.at}|${e.hostname}|${e.note}`));
                return [...fromVault, ...prev].slice(0, 50);
              });
            })
            .catch(() => { /* optional */ });
        }
        fetchMeshInterfaces()
          .then((iface) => setLocalInterfaces(iface.summary || []))
          .catch(() => { /* optional */ });
        // LAN discovery is heavier — probe TR brains on LAN; do not fail the page.
        fetchLanDiscovery({ probe: true, limit: 24 })
          .then((lan) => {
            setLanHosts(lan.hosts || []);
            setLanTrCount(lan.tr_reachable_count || 0);
          })
          .catch(() => { /* ARP may be unavailable */ });
        fetchDeviceIo()
          .then((ioRes) => {
            setDeviceIo(ioRes.io || null);
            setUiHints(ioRes.ui_hints || ioRes.io?.ui_hints || []);
          })
          .catch(() => { /* optional */ });
        // Neither of these should ever take the page down — both are optional
        // capabilities that may simply not be configured yet.
        void (async () => {
          try {
            const p = await fetchHeadscalePolicy();
            setSshPolicy({ configured: p.configured, fileMode: p.fileMode });
          } catch {
            setSshPolicy(null);
          }
        })();
        // Enrollment state drives the join banner; never fail the page on it.
        fetchEnrollmentStatus()
          .then(setEnrollment)
          .catch(() => { /* optional */ });
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
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load ${activeTab} data`);
      // Back off polling on errors to reduce long-task pressure.
      pollMsRef.current = Math.min(POLL_MAX_MS, pollMsRef.current * 1.5);
    } finally {
      setLoading(false);
    }
  }, [activeTab, newKeyUser, recordLeaderChange, pushLatencySamples]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh election state');
    }
  }

  async function handleRegisterLanPeers() {
    setLanRegisterBusy(true);
    setLanRegisterMsg(null);
    try {
      const res = await registerLanMeshNodes({ probe: true, limit: 24 });
      setLanRegisterMsg(
        `Registered ${res.registration?.written_count ?? 0} of ${res.registration?.attempted ?? 0} TR-reachable LAN hosts as mesh_node entities.`,
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'LAN register failed');
    } finally {
      setLanRegisterBusy(false);
    }
  }

  async function handleEnableMeshSsh() {
    setSshBusy(true);
    setSshMsg(null);
    try {
      await saveHeadscalePolicy(buildMeshSshPolicy());
      const next = await fetchHeadscalePolicy();
      setSshPolicy({ configured: next.configured, fileMode: next.fileMode });
      setSshMsg('Mesh SSH enabled. Nodes pick this up automatically.');
    } catch (err) {
      setSshMsg(err instanceof Error ? err.message : 'Could not enable mesh SSH');
    } finally {
      setSshBusy(false);
    }
  }

  async function handleEnroll() {
    setEnrollBusy(true);
    setEnrollMsg(null);
    try {
      const result = await enrollThisNode();
      setEnrollment(result.status);
      if (result.ok && result.changed) {
        setEnrollMsg(`Enrolled on the mesh via ${result.method || 'control server'}.`);
      } else if (result.ok) {
        setEnrollMsg('This node is already enrolled.');
      } else if (result.auth_url) {
        setEnrollMsg('Approve the registration link below to finish joining.');
      } else {
        setEnrollMsg(result.hint || result.reason || 'Enrollment did not complete.');
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enrollment failed');
    } finally {
      setEnrollBusy(false);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pre-auth key');
    }
  }

  async function handleDeleteNode(id: string) {
    if (!confirm('Are you sure you want to delete this node from Headscale?')) return;
    try {
      await deleteHeadscaleNode(id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete node');
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

      {enrollment && !enrollment.enrolled && (
        <div className="alert alert-warning mesh-enrollment-banner" style={{ marginBottom: '24px' }} data-testid="enrollment-banner">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <strong>This node is not on the mesh</strong>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                {enrollment.state === 'client_unavailable'
                  ? 'No Tailscale client detected. Install Tailscale (or set TR_TAILSCALE_BIN) to join the mesh.'
                  : enrollment.can_auto_enroll
                    ? `Ready to enroll automatically against ${enrollment.login_server}.`
                    : enrollment.login_server
                      ? `Control server ${enrollment.login_server} — add a Headscale API key to enroll without approving in a browser.`
                      : 'No control server configured. Add a Headscale API key with its URL, or set TR_HEADSCALE_URL.'}
              </div>
              {enrollment.auth_url && (
                <div style={{ fontSize: 13, marginTop: 8 }}>
                  Pending registration:{' '}
                  <a href={enrollment.auth_url} target="_blank" rel="noreferrer noopener">
                    approve this node
                  </a>
                </div>
              )}
              {enrollMsg && (
                <div style={{ fontSize: 13, marginTop: 8, color: 'var(--accent-hover)' }}>{enrollMsg}</div>
              )}
            </div>
            {enrollment.client_available && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleEnroll}
                disabled={enrollBusy}
              >
                {enrollBusy ? 'Enrolling…' : 'Enroll this node'}
              </button>
            )}
          </div>
        </div>
      )}

      {activeTab === 'mesh' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Without a policy the control server routes packets but authorises
              nothing, so every machine falls back to its own SSH keys. */}
          {sshPolicy && !sshPolicy.configured && (
            <div className="alert alert-warning" data-testid="mesh-ssh-banner">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <strong>Mesh SSH is off</strong>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    {sshPolicy.fileMode
                      ? 'The control server stores its policy in a file, so it cannot be managed here. Set policy.mode: database in the control server config to enable this.'
                      : 'Nodes can reach each other, but each still needs its own SSH keys. Enabling mesh SSH lets the control server authorise connections instead.'}
                  </div>
                  {sshMsg && (
                    <div style={{ fontSize: 13, marginTop: 8, color: 'var(--accent-hover)' }}>{sshMsg}</div>
                  )}
                </div>
                {!sshPolicy.fileMode && (
                  <button type="button" className="btn btn-primary" onClick={handleEnableMeshSsh} disabled={sshBusy}>
                    {sshBusy ? 'Enabling…' : 'Enable mesh SSH'}
                  </button>
                )}
              </div>
            </div>
          )}
          {sshPolicy?.configured && sshMsg && (
            <div className="alert alert-success" data-testid="mesh-ssh-ok">{sshMsg}</div>
          )}
          {/* Which mesh node actually serves embeddings, and which model it uses. */}
          <div className="card">
            <EmbeddingProviderPanel />
          </div>
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
                  <dt style={{ color: 'var(--text-secondary)' }}>Transports</dt>
                  <dd style={{ margin: 0 }}>
                    {selectedNode.transports?.length ? selectedNode.transports.join(', ') : '—'}
                  </dd>
                  <dt style={{ color: 'var(--text-secondary)' }}>LAN IP</dt>
                  <dd style={{ margin: 0 }}>{selectedNode.lan_ip || '—'}</dd>
                  <dt style={{ color: 'var(--text-secondary)' }}>Interfaces</dt>
                  <dd style={{ margin: 0 }}>
                    {(selectedNode.interfaces?.length
                      ? selectedNode.interfaces
                      : selectedNode.self
                        ? localInterfaces
                        : []
                    ).length === 0
                      ? '—'
                      : (selectedNode.interfaces?.length ? selectedNode.interfaces : localInterfaces)
                          .map((i) => `${i.name} (${i.kind})`)
                          .join(', ')}
                  </dd>
                  <dt style={{ color: 'var(--text-secondary)' }}>I/O channels</dt>
                  <dd style={{ margin: 0 }}>
                    {(selectedNode.self ? deviceIo?.channels : selectedNode.io?.channels)?.length
                      ? (selectedNode.self ? deviceIo?.channels : selectedNode.io?.channels)!.join(', ')
                      : '—'}
                  </dd>
                  <dt style={{ color: 'var(--text-secondary)' }}>UI hints</dt>
                  <dd style={{ margin: 0, fontSize: 12 }}>
                    {(selectedNode.self ? uiHints : selectedNode.ui_hints || selectedNode.io?.ui_hints)?.length
                      ? (selectedNode.self ? uiHints : selectedNode.ui_hints || selectedNode.io?.ui_hints)!.join(' · ')
                      : '—'}
                  </dd>
                  <dt style={{ color: 'var(--text-secondary)' }}>Scope</dt>
                  <dd style={{ margin: 0 }}>{selectedNode.self ? 'This node' : 'Peer'}</dd>
                </dl>
              ) : (
                <p style={{ color: 'var(--text-secondary)' }}>Click a node in the topology to inspect it.</p>
              )}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>This host — I/O for agent UI</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 0 }}>
              Channels (screen, touch, mic, speaker, …) and UI hints so agents can generate UI for the right surfaces.
              Stored as mesh_node entity variables; vault overrides live detection.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {(deviceIo?.channels || []).map((ch) => (
                <span key={ch} className="badge badge-leader">{ch}</span>
              ))}
              {!deviceIo?.channels?.length && (
                <span style={{ color: 'var(--text-secondary)' }}>Detecting…</span>
              )}
            </div>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 12px', fontSize: 13 }}>
              <dt style={{ color: 'var(--text-secondary)' }}>Display</dt>
              <dd style={{ margin: 0 }}>
                {deviceIo?.display?.present
                  ? `yes${deviceIo.display.touch ? ' · touch' : ''}${deviceIo.display.width && deviceIo.display.height ? ` · ${deviceIo.display.width}×${deviceIo.display.height}` : ''}`
                  : deviceIo?.headless
                    ? 'headless'
                    : '—'}
              </dd>
              <dt style={{ color: 'var(--text-secondary)' }}>Audio</dt>
              <dd style={{ margin: 0 }}>
                in: {deviceIo?.audio?.input ? 'yes' : 'no'} · out: {deviceIo?.audio?.output ? 'yes' : 'no'}
              </dd>
              <dt style={{ color: 'var(--text-secondary)' }}>Camera</dt>
              <dd style={{ margin: 0 }}>{deviceIo?.camera?.present ? 'yes' : 'no'}</dd>
              <dt style={{ color: 'var(--text-secondary)' }}>Input</dt>
              <dd style={{ margin: 0 }}>
                kb: {deviceIo?.input?.keyboard ? 'yes' : 'no'} · pointer: {deviceIo?.input?.pointer ? 'yes' : 'no'} · touch: {deviceIo?.input?.touch ? 'yes' : 'no'}
              </dd>
              <dt style={{ color: 'var(--text-secondary)' }}>UI hints</dt>
              <dd style={{ margin: 0 }}>{uiHints.length ? uiHints.join(' · ') : '—'}</dd>
            </dl>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Local interfaces</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 0 }}>
                Kinds are classified from OS interface names (wifi / ethernet / vpn_overlay / …). Variables of this host, not hardcoded devices.
              </p>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Kind</th>
                    <th>IPv4</th>
                  </tr>
                </thead>
                <tbody>
                  {localInterfaces.map((iface) => (
                    <tr key={iface.name}>
                      <td>{iface.name}</td>
                      <td><span className="badge badge-follower">{iface.kind}</span></td>
                      <td style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 12 }}>
                        {(iface.ipv4 || []).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                  {localInterfaces.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
                        No external interfaces reported
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <h3 style={{ margin: 0 }}>
                  LAN discovery
                  {lanTrCount > 0 ? (
                    <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: 'var(--accent-hover)' }}>
                      {lanTrCount} Total Recall reachable
                    </span>
                  ) : null}
                </h3>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={lanRegisterBusy || lanTrCount === 0}
                  onClick={handleRegisterLanPeers}
                  title="Create/update mesh_node vault entities for TR-reachable LAN hosts"
                >
                  {lanRegisterBusy ? 'Registering…' : 'Register TR peers'}
                </button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 0 }}>
                Hosts from the OS neighbor/ARP table on private LAN ranges. TR-reachable means /health answered on the brain port.
                Register upserts entity docs (hostname lan-&lt;ip&gt;) without hardcoding fleet names.
              </p>
              {lanRegisterMsg && (
                <p style={{ fontSize: 12, color: 'var(--accent-hover)' }}>{lanRegisterMsg}</p>
              )}
              <table className="data-table">
                <thead>
                  <tr>
                    <th>IP</th>
                    <th>MAC</th>
                    <th>IF</th>
                    <th>TR</th>
                  </tr>
                </thead>
                <tbody>
                  {lanHosts.map((h) => (
                    <tr key={h.ip}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{h.ip}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)' }}>{h.mac}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{h.interface || '—'}</td>
                      <td>
                        {h.tr_reachable ? (
                          <span className="badge badge-online">
                            yes{h.tr_latency_ms != null ? ` ${h.tr_latency_ms}ms` : ''}
                          </span>
                        ) : (
                          <span className="badge badge-offline">no</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {lanHosts.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
                        No LAN neighbors discovered (ARP empty or unavailable)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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

          <div className="card">
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Latency matrix (from this node)</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 0 }}>
              Measured via <code>GET /api/mesh/latency</code> through the fetch gate. Full N×N requires each peer to report; this row is what <em>this</em> host measures.
            </p>
            <div className="latency-matrix-wrap">
              <table className="latency-matrix" data-testid="latency-matrix">
                <thead>
                  <tr>
                    <th className="from-label">From → To</th>
                    {meshNodes.map((n) => (
                      <th key={`col-${n.hostname}`}>{n.hostname}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const selfNode = meshNodes.find((n) => n.self) || meshNodes[0];
                    if (!selfNode) {
                      return (
                        <tr>
                          <td colSpan={Math.max(meshNodes.length + 1, 2)} style={{ color: 'var(--text-secondary)' }}>
                            No mesh nodes yet
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr>
                        <td className="from-label">{selfNode.hostname} (this)</td>
                        {meshNodes.map((n) => {
                          const ms = n.self ? 0 : latencyMs[n.hostname];
                          const label =
                            n.self
                              ? '0 ms'
                              : ms != null
                                ? `${ms} ms`
                                : n.online
                                  ? '…'
                                  : '—';
                          return (
                            <td
                              key={`cell-${n.hostname}`}
                              className={`rtt-cell${n.self ? ' is-self' : ''}`}
                              title={n.self ? 'self' : undefined}
                            >
                              <div>{label}</div>
                              {!n.self && (
                                <LatencySparkline
                                  values={latencyHistory[n.hostname] || []}
                                  title={`RTT trend to ${n.hostname}`}
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
            <table className="data-table" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>Peer</th>
                  <th>RTT</th>
                  <th>Trend</th>
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
                    <td>
                      {n.self ? (
                        '—'
                      ) : (
                        <LatencySparkline
                          values={latencyHistory[n.hostname] || []}
                          title={`RTT trend to ${n.hostname}`}
                        />
                      )}
                    </td>
                  </tr>
                ))}
                {meshNodes.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>No peers</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Election history</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 0 }}>
              Durable SSSS events (<code>mesh_election</code>) plus this session.
            </p>
            {electionLog.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No leader changes recorded yet.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 220, overflowY: 'auto' }} data-testid="election-history">
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
