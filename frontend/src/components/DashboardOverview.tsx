import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchHealth } from '../api'
import { fetchMemoryStats, fetchVaultStatus } from '../api/memory'
import { fetchLeader, fetchNodes, type LeaderInfo, type MeshNode } from '../api/mesh'
import type { HealthData } from '../types'

interface DashboardOverviewProps {
  activeBrainId: string
}

function formatUptime(seconds?: number): string {
  if (!seconds || seconds < 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return iso
  return new Date(parsed).toLocaleString()
}

export default function DashboardOverview({ activeBrainId }: DashboardOverviewProps) {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [vault, setVault] = useState<{ totalNodes?: number; node_count?: number; categories?: Record<string, number>; embeddings?: number | { vault_nodes?: number; session_chunks?: number }; lastCompiled?: string; last_compile?: string } | null>(null)
  const [stats, setStats] = useState<{ total: number; byCategory: Record<string, number> } | null>(null)
  const [nodes, setNodes] = useState<MeshNode[] | null>(null)
  const [leader, setLeader] = useState<LeaderInfo | null>(null)

  useEffect(() => {
    let active = true
    void Promise.resolve(fetchHealth()).then(data => { if (active && data) setHealth(data) }).catch(() => {})
    void Promise.resolve(fetchVaultStatus()).then(data => { if (active && data) setVault(data) }).catch(() => {})
    void Promise.resolve(fetchMemoryStats()).then(data => { if (active && data) setStats(data) }).catch(() => {})
    void Promise.resolve(fetchNodes()).then(data => { if (active && data) setNodes(data) }).catch(() => {})
    void Promise.resolve(fetchLeader()).then(data => { if (active && data) setLeader(data) }).catch(() => {})
    return () => { active = false }
  }, [])

  const serverOk = health ? health.status !== 'unreachable' : false
  const daemonOk = health?.daemon === 'running'
  const brainLabel = activeBrainId === 'global'
    ? 'Global Brain'
    : activeBrainId.startsWith('project:')
      ? activeBrainId.slice('project:'.length)
      : activeBrainId

  const totalNodes = vault?.totalNodes ?? vault?.node_count ?? stats?.total ?? 0
  const embeddings = typeof vault?.embeddings === 'object' && vault.embeddings !== null
    ? (vault.embeddings.vault_nodes ?? 0)
    : (vault?.embeddings ?? 0)
  const lastCompiled = vault?.lastCompiled || vault?.last_compile
  const byCategory = stats?.byCategory ?? vault?.categories ?? {}
  const onlineMesh = nodes?.filter(n => n.online).length ?? 0
  const totalMesh = nodes?.length ?? 0

  return (
    <section
      aria-label="Main dashboard"
      style={{ padding: 'clamp(12px, 3vw, 24px)', maxWidth: '1120px', width: '100%', boxSizing: 'border-box', minWidth: 0, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem' }}>System Dashboard</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Live runtime, memory vault, rules, and mesh status across Total Recall.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link to="/memory" className="btn btn-primary btn-sm">Open Memory</Link>
          <Link to="/rules" className="btn btn-ghost btn-sm">Rules</Link>
          <Link to="/graph" className="btn btn-ghost btn-sm">Graph</Link>
          <Link to="/settings" className="btn btn-ghost btn-sm">Settings</Link>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: '12px', minWidth: 0 }}>
        <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Server</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: '4px', color: serverOk ? '#22c55e' : '#ef4444' }}>
            {!health ? 'Checking…' : serverOk ? 'Online' : 'Unreachable'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
            {health?.version ? `v${health.version}` : '—'} · Uptime {formatUptime(health?.uptime_seconds)}
          </div>
        </div>

        <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Daemon</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: '4px', color: daemonOk ? '#22c55e' : 'var(--text-primary)' }}>
            {!health ? 'Checking…' : daemonOk ? 'Running' : (health.daemon ?? 'Unknown')}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
            Background indexing &amp; sync
          </div>
        </div>

        <Link to="/memory" style={{ textDecoration: 'none', color: 'inherit', padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Active Brain</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: '4px', overflowWrap: 'anywhere' }}>
            {brainLabel}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
            {totalNodes} nodes · {embeddings} vectors
          </div>
        </Link>

        <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Mesh Fleet</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: '4px' }}>
            {nodes === null ? 'Checking…' : `${onlineMesh} / ${totalMesh} Online`}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '4px', overflowWrap: 'anywhere' }}>
            {leader?.hostname ? `Leader: ${leader.hostname}` : 'Tailscale / Headscale mesh'}
          </div>
        </div>
      </div>

      <section aria-label="Vault breakdown" style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Memory &amp; Rules Breakdown</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
            Last compiled: {formatDate(lastCompiled)}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(130px, 100%), 1fr))', gap: '10px', minWidth: 0 }}>
          {Object.entries(byCategory).length === 0 ? (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No category stats available yet.</span>
          ) : (
            Object.entries(byCategory).map(([category, count]) => (
              <div key={category} style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{category}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '2px' }}>{count}</div>
              </div>
            ))
          )}
        </div>
      </section>

      {nodes && nodes.length > 0 && (
        <section aria-label="Mesh nodes" style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Mesh Nodes</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: '10px', minWidth: 0 }}>
            {nodes.map(node => (
              <div key={node.hostname} style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minWidth: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, overflowWrap: 'anywhere' }}>{node.hostname}</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>{node.ip || node.os || '—'}</div>
                </div>
                <span className={`badge ${node.online ? 'badge-success' : ''}`}>
                  {node.online ? 'Online' : 'Offline'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}
