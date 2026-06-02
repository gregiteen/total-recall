import { useState, useEffect, useRef } from 'react';
import { fetchHealth, fetchLogs, runAgentDiagnostics } from '../api';
import type { HealthData } from '../types';

export default function DeploymentsPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [logs, setLogs] = useState('(loading live cognitive activity console streams...)');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // CLI Agent Diagnostics state
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string | null>(null);

  const consoleEndRef = useRef<HTMLDivElement>(null);

  const fetchSystemData = async () => {
    try {
      const systemHealth = await fetchHealth();
      setHealth(systemHealth);
      
      const daemonLogs = await fetchLogs('daemon');
      setLogs(daemonLogs.content || '(no console activity streamed yet)');
      setError(null);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to sync system health.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate metrics polling on mount
    void fetchSystemData();
    const interval = setInterval(fetchSystemData, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Auto-scroll the retro console log to bottom
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleRunDiagnostics = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunningDiagnostics(true);
    setError(null);
    setSuccess(null);
    setDiagnosticLogs(null);
    try {
      const res = await runAgentDiagnostics();
      setDiagnosticLogs(res.output);
      if (res.success) {
        setSuccess('CLI Agent diagnostics completed successfully.');
      } else {
        setError('CLI Agent diagnostics finished with warnings or missing binaries.');
      }
      void fetchSystemData();
    } catch (err: unknown) {
      setError((err as Error).message || 'Diagnostics execution failed.');
    } finally {
      setRunningDiagnostics(false);
    }
  };

  const AGENTS_LIST = [
    { id: 'antigravity', name: 'Antigravity (Gemini SDK)', desc: 'Primary core developer agent' },
    { id: 'gemini', name: 'Gemini CLI', desc: 'Direct Gemini assistant binary' },
    { id: 'claude', name: 'Claude Code', desc: 'Anthropic developer CLI wrapper' },
    { id: 'codex', name: 'Codex CLI', desc: 'OpenAI agent binary integration' }
  ];


  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1>Sovereign Stack Deployments</h1>
        <p>Monitor your machine services, pull kernel intelligence models, and stream activity logs</p>
      </div>

      {error && (
        <div className="badge badge-error" style={{ marginBottom: 20, display: 'inline-flex', padding: '6px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#f87171' }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="badge badge-success" style={{ marginBottom: 20, display: 'inline-flex', padding: '6px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#34d399' }}>
          ✓ {success}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          <div>Checking deployment gateways...</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, flex: 1, minHeight: 0 }}>
          
          {/* Services Status Panels Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            
            {/* Service 1: Cognitive Daemon */}
            <div className="card" style={{ padding: 20, background: 'rgba(18, 18, 26, 0.6)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24 }}>⚙️</span>
                <div>
                  <h4 style={{ fontSize: 13, fontWeight: 600 }}>Reasoning Daemon</h4>
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>System 2 scheduler loop</p>
                </div>
              </div>
              <span className="badge" style={{
                background: health?.daemon === 'running' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: health?.daemon === 'running' ? '#10b981' : '#ef4444',
                border: health?.daemon === 'running' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
              }}>
                {health?.daemon || 'dead'}
              </span>
            </div>

            {/* Service 2: Caddy SSL Tunnel */}
            <div className="card" style={{ padding: 20, background: 'rgba(18, 18, 26, 0.6)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24 }}>🔒</span>
                <div>
                  <h4 style={{ fontSize: 13, fontWeight: 600 }}>Caddy SSL Proxy</h4>
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Reverse proxy tunnel gateway</p>
                </div>
              </div>
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                active
              </span>
            </div>

            {/* Service 3: Cloudflare Secure Tunnel */}
            <div className="card" style={{ padding: 20, background: 'rgba(18, 18, 26, 0.6)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24 }}>☁️</span>
                <div>
                  <h4 style={{ fontSize: 13, fontWeight: 600 }}>Cloudflare Secure Tunnel</h4>
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Expose tunnel behind SSL</p>
                </div>
              </div>
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                active
              </span>
            </div>

          </div>

           {/* CLI Agents Catalog & Diagnostics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24 }}>
            
            {/* Catalog */}
            <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <span style={{ fontSize: 20 }}>🧠</span>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>CLI Reasoning Agents</h3>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Headless CLI reasoning agents configured on system</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {AGENTS_LIST.map((a) => {
                  const activeAgent = health?.cli_agents?.includes(a.id);
                  return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{a.name}</span>
                          <span className="badge" style={{
                            fontSize: 9,
                            padding: '2px 6px',
                            background: activeAgent ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: activeAgent ? '#10b981' : '#ef4444',
                            border: activeAgent ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
                          }}>
                            {activeAgent ? 'available' : 'missing'}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{a.desc}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 4 }}>Registry ID: {a.id}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Diagnostics Form */}
            <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <span style={{ fontSize: 20 }}>📡</span>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>CLI Agent Diagnostics</h3>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Trigger active paths check and verify registered agents</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                  This executes a diagnostic check on registered reasoning agents (equivalent to running <code>npx total-recall upgrade --agents</code> in the background) to audit paths and verify binaries.
                </p>

                <button
                  onClick={handleRunDiagnostics}
                  disabled={runningDiagnostics}
                  style={{
                    background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                    color: '#fff',
                    padding: '10px',
                    borderRadius: 6,
                    fontWeight: 500,
                    border: 'none',
                    marginTop: 8,
                    cursor: runningDiagnostics ? 'not-allowed' : 'pointer'
                  }}
                >
                  {runningDiagnostics ? '⏳ Running Audit...' : '🚀 Run Diagnostics Audit'}
                </button>
              </div>

              {diagnosticLogs && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>Diagnostics Console Output:</span>
                  <pre style={{
                    background: '#07070a',
                    border: '1px solid var(--border)',
                    padding: 10,
                    borderRadius: 6,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: '#e6edf3',
                    whiteSpace: 'pre-wrap',
                    maxHeight: 150,
                    overflowY: 'auto'
                  }}>
                    {diagnosticLogs}
                  </pre>
                </div>
              )}
            </div>

          </div>

          {/* Active Terminal Console Logs */}
          <div className="card" style={{ flex: 1, minHeight: 300, background: '#07070a', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: '#0e0e15', padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff6b6b' }} />
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fdcb6e' }} />
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00cec9' }} />
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginLeft: 8 }}>bash — daemon-activity.log — 80x24</span>
            </div>
            
            <pre style={{
              flex: 1,
              overflowY: 'auto',
              padding: 16,
              margin: 0,
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: '#34d399',
              background: '#07070a',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}>
              {logs}
              <div ref={consoleEndRef} />
            </pre>
          </div>

        </div>
      )}

    </div>
  );
}
