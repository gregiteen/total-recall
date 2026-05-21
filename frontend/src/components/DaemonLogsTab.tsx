import { useRef, useEffect } from 'react'

interface DaemonLogsTabProps {
  logs: string
  activeTab: string
}

export default function DaemonLogsTab({ logs, activeTab }: DaemonLogsTabProps) {
  const terminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeTab === 'logs' && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs, activeTab])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="pulse" style={{ background: '#10b981', width: 8, height: 8 }} />
          <h3 style={{ margin: 0 }}>Cognitive Daemon Stream</h3>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Auto-refreshing every 3s</span>
      </div>

      {/* Terminal Logs View */}
      <div 
        ref={terminalRef}
        style={{
          background: '#090d16',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
          fontFamily: 'Consolas, Monaco, "Andale Mono", monospace',
          fontSize: 13,
          color: '#34d399',
          lineHeight: '1.6',
          height: '460px',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.8)',
          position: 'relative'
        }}
      >
        <div style={{ borderBottom: '1px solid rgba(52, 211, 153, 0.1)', paddingBottom: 10, marginBottom: 14, display: 'flex', justifyContent: 'space-between', color: '#60a5fa', fontSize: 12 }}>
          <span>TOTAL RECALL COGNITIVE DAEMON CONSOLE // active-tunnel-listener</span>
          <span>UTC-CLOCK: {new Date().toISOString()}</span>
        </div>
        {logs}
      </div>
    </div>
  )
}
