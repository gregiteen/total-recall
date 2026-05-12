import { useState, useEffect } from 'react'
import { fetchHealth } from '../api'
import type { HealthData } from '../types'

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${seconds % 60}s`
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [error, setError] = useState('')
  const [lastPoll, setLastPoll] = useState<Date | null>(null)

  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const data = await fetchHealth()
        if (active) {
          setHealth(data)
          setError('')
          setLastPoll(new Date())
        }
      } catch (e) {
        if (active) setError((e as Error).message)
      }
    }

    poll()
    const interval = setInterval(poll, 5000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  return (
    <div className="page">
      <div className="page-header">
        <h1>System Health</h1>
        <p>Live monitoring of your sovereign brain {lastPoll && <span>· Last poll: {lastPoll.toLocaleTimeString()}</span>}</p>
      </div>

      {error && <div className="badge badge-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}

      {health ? (
        <>
          <div className="health-grid">
            <div className="stat-card healthy">
              <div className="value" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span className="pulse" /> {health.status}
              </div>
              <div className="label">Status</div>
            </div>
            <div className="stat-card">
              <div className="value" style={{ color: 'var(--accent)' }}>{health.version}</div>
              <div className="label">Version</div>
            </div>
            <div className="stat-card">
              <div className="value" style={{ color: 'var(--text-primary)' }}>{formatUptime(health.uptime_seconds)}</div>
              <div className="label">Uptime</div>
            </div>
            <div className="stat-card">
              <div className="value" style={{ color: 'var(--text-primary)', fontSize: 16 }}>{new Date(health.timestamp).toLocaleString()}</div>
              <div className="label">Server Time</div>
            </div>
          </div>

          <div className="health-log">
            <h3>System Info</h3>
            <table>
              <tbody>
                <tr><th>Status</th><td>{health.status}</td></tr>
                <tr><th>Version</th><td>{health.version}</td></tr>
                <tr><th>Uptime</th><td>{formatUptime(health.uptime_seconds)}</td></tr>
                <tr><th>Timestamp</th><td>{health.timestamp}</td></tr>
                <tr><th>Polling</th><td>Every 5 seconds</td></tr>
              </tbody>
            </table>
          </div>
        </>
      ) : !error ? (
        <div className="health-grid">
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 100 }} />)}
        </div>
      ) : null}
    </div>
  )
}
