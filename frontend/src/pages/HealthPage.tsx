import { useState, useEffect } from 'react'
import { fetchHealth, checkUpdate, runUpdate } from '../api'
import type { HealthData, UpdateCheckResult } from '../types'

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
  
  // Auto-Update States
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [checkMessage, setCheckMessage] = useState('')

  const handleManualCheckUpdate = async () => {
    setIsCheckingUpdate(true)
    setCheckMessage('')
    setUpdateError('')
    try {
      const data = await checkUpdate()
      setUpdateInfo(data)
      if (!data.updateAvailable) {
        setCheckMessage('System is up to date!')
        setTimeout(() => setCheckMessage(''), 3000)
      }
    } catch (e) {
      setUpdateError(`Failed to check updates: ${(e as Error).message}`)
    } finally {
      setIsCheckingUpdate(false)
    }
  }

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

    // Check for updates
    const checkVersion = async () => {
      try {
        const data = await checkUpdate()
        if (active) setUpdateInfo(data)
      } catch (e) {
        console.error('Failed to check updates', e)
      }
    }
    checkVersion()
    const updateInterval = setInterval(checkVersion, 3600000)

    return () => { 
      active = false; 
      clearInterval(interval); 
      clearInterval(updateInterval); 
    }
  }, [])

  const handleStartUpdate = async () => {
    setShowConfirmModal(false)
    setIsUpdating(true)
    setUpdateError('')
    
    try {
      await runUpdate()
      
      // Keep polling health to check when it goes down and recovers
      let serverDown = false
      const pollInterval = setInterval(async () => {
        try {
          const res = await fetchHealth()
          if (serverDown && res.status === 'healthy') {
            clearInterval(pollInterval)
            window.location.reload()
          }
        } catch {
          // Connection failed = server is offline / restarting
          serverDown = true
        }
      }, 2000)

    } catch (e) {
      setUpdateError((e as Error).message)
      setIsUpdating(false)
    }
  }

  return (
    <div className="page" style={{ position: 'relative' }}>
      {isUpdating && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(13, 17, 23, 0.9)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(8px)',
          animation: 'fadeIn 0.3s ease'
        }}>
          <div className="spinner" style={{
            width: 50,
            height: 50,
            border: '4px solid var(--border)',
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: 20
          }} />
          <h2 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Updating Total Recall...</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Applying git changes, installing npm modules, and restarting daemon.</p>
          <p style={{ color: 'var(--accent)', fontSize: 13, marginTop: 10 }}>Please do not close this window.</p>
        </div>
      )}

      {showConfirmModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          zIndex: 900,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)',
          padding: 20
        }}>
          <div className="card" style={{
            maxWidth: 450,
            width: '100%',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 24,
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
          }}>
            <h3 style={{ marginBottom: 12, color: 'var(--text-primary)' }}>Confirm Core Self-Update</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 14, lineHeight: 1.5 }}>
              This will pull the latest version of Total Recall ({updateInfo?.latestVersion}) from the git repository, reinstall dependencies, rebuild frontend bundles, and reboot the system kernel.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowConfirmModal(false)}
                style={{ padding: '8px 16px', borderRadius: 8 }}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleStartUpdate}
                style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--accent)' }}
              >
                Update Now
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>System Health</h1>
          <p>Live monitoring of your sovereign brain {lastPoll && <span>· Last poll: {lastPoll.toLocaleTimeString()}</span>}</p>
        </div>
        {updateInfo?.updateAvailable ? (
          <div className="badge badge-success" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 18px',
            borderRadius: 12,
            background: 'rgba(63, 185, 80, 0.1)',
            border: '1px solid rgba(63, 185, 80, 0.3)',
            animation: 'pulse 2s infinite'
          }}>
            <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>
              New version available: {updateInfo.latestVersion}
            </span>
            <button 
              className="btn btn-primary" 
              onClick={() => setShowConfirmModal(true)}
              style={{
                fontSize: 12,
                padding: '6px 12px',
                borderRadius: 6,
                backgroundColor: '#3fb950',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Update Now
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {checkMessage && (
              <span style={{ color: '#3fb950', fontSize: 14, fontWeight: 500, animation: 'fadeIn 0.3s ease' }}>
                {checkMessage}
              </span>
            )}
            <button
              className="btn btn-secondary"
              disabled={isCheckingUpdate}
              onClick={handleManualCheckUpdate}
              style={{
                fontSize: 13,
                padding: '8px 16px',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              {isCheckingUpdate ? 'Checking...' : 'Check for Updates'}
            </button>
          </div>
        )}
      </div>

      {error && <div className="badge badge-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}
      {updateError && <div className="badge badge-error" style={{ marginBottom: 16 }}>⚠️ Update failed: {updateError}</div>}

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
              <div className="value" style={{ color: 'var(--accent)' }}>
                {health.version} {updateInfo && !updateInfo.updateAvailable && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>(Latest)</span>}
              </div>
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
                <tr><th>Daemon Status</th><td>{health.daemon || 'unknown'}</td></tr>
                {health.cli_agents && (
                  <tr><th>CLI Agents</th><td>{health.cli_agents.join(', ')}</td></tr>
                )}
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

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
