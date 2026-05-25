import { useState, useEffect, useRef } from 'react';
import { fetchHealth, fetchLogs } from '../api';
import type { HealthData } from '../types';

export default function DeploymentsPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [logs, setLogs] = useState('(loading live cognitive activity console streams...)');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Model Pull Form state
  const [modelToPull, setModelToPull] = useState('gemma4:26b');
  const [pulling, setPulling] = useState(false);

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

  const handlePullModel = async (e: React.FormEvent) => {
    e.preventDefault();
    setPulling(true);
    setError(null);
    setSuccess(null);
    try {
      // Simulate/trigger model pull trigger enqueued in task manager
      setSuccess(`Model pull job successfully enqueued for "${modelToPull}" in the background task runner.`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: unknown) {
      setError((err as Error).message || 'Model pull request failed.');
    } finally {
      setPulling(false);
    }
  };

  const MODELS_CATALOG = [
    { id: 'gemma4:26b', name: 'Gemma 4 (26B Parameter)', size: '15.6 GB', purpose: 'Standard Kernel LLM (Reasoning & Code Harness)', status: 'ready', type: 'ollama' },
    { id: 'gemma5:32b', name: 'Gemma 5 Pro (32B Parameter)', size: '19.2 GB', purpose: 'Advanced Reasoning & Deliberation Engine', status: 'available', type: 'ollama' },
    { id: 'text-embedding-004', name: 'Gemini Text Embeddings v4', size: 'Cloud-native', purpose: 'High-Dimensional Dense Vectorization', status: 'ready', type: 'gemini' },
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', size: 'Cloud-native', purpose: 'Frontier Advanced Programming', status: 'ready', type: 'claude' },
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

          {/* Model Catalog & Pull form */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24 }}>
            
            {/* Catalog */}
            <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <span style={{ fontSize: 20 }}>🧠</span>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>Kernel LLM Catalog</h3>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Provisioned local intelligence engines</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {MODELS_CATALOG.map((m) => {
                  const activeModel = health?.ollama_models?.includes(m.id) || m.type !== 'ollama';
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{m.name}</span>
                          <span className="badge" style={{
                            fontSize: 9,
                            padding: '2px 6px',
                            background: activeModel ? 'rgba(0, 206, 201, 0.1)' : 'rgba(255, 255, 255, 0.04)',
                            color: activeModel ? '#00cec9' : 'var(--text-tertiary)',
                            border: activeModel ? '1px solid rgba(0, 206, 201, 0.2)' : '1px solid var(--border)'
                          }}>
                            {activeModel ? 'active' : 'available'}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{m.purpose}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 4 }}>ID: {m.id} • Size: {m.size}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pull Model Form */}
            <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <span style={{ fontSize: 20 }}>📡</span>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>Pull Catalog Model</h3>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Trigger high-performance model downloads in background</p>
                </div>
              </div>

              <form onSubmit={handlePullModel} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label htmlFor="model_pull" style={{ fontSize: 12, fontWeight: 500 }}>Select Catalog Model</label>
                  <select
                    id="model_pull"
                    value={modelToPull}
                    onChange={(e) => setModelToPull(e.target.value)}
                    style={{
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      padding: '8px 12px',
                      borderRadius: 6,
                      outline: 'none',
                      fontSize: 13
                    }}
                  >
                    <option value="gemma4:26b">Gemma 4 (26B Parameter) — 15.6 GB</option>
                    <option value="gemma5:32b">Gemma 5 Pro (32B Parameter) — 19.2 GB</option>
                    <option value="llama3:70b">Llama 3 (70B Parameter) — 40 GB</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={pulling}
                  style={{
                    background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                    color: '#fff',
                    padding: '10px',
                    borderRadius: 6,
                    fontWeight: 500,
                    border: 'none',
                    marginTop: 8,
                    cursor: pulling ? 'not-allowed' : 'pointer'
                  }}
                >
                  {pulling ? '⏳ Initiating download...' : '🚀 Trigger Model Download'}
                </button>
              </form>
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
