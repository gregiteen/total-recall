import React, { useState, useEffect, useRef } from 'react';
import {
  runSandbox,
  fetchOpenWikiNodes,
  fetchHealth
} from '../api';
import type { MemoryNode } from '../types';
import type { HealthData } from '../types';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function excerpt(node: MemoryNode, maxLen = 140): string {
  const text = node.body || node.content || node.excerpt || '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

function categoryColor(cat: string): { bg: string; fg: string; icon: string } {
  const map: Record<string, { bg: string; fg: string; icon: string }> = {
    invariant: { bg: 'rgba(239, 68, 68, 0.15)', fg: '#ef4444', icon: '⚡' },
    preference: { bg: 'rgba(59, 130, 246, 0.15)', fg: '#3b82f6', icon: '⭐' },
    fact: { bg: 'rgba(16, 185, 129, 0.15)', fg: '#10b981', icon: '📌' },
    concept: { bg: 'rgba(245, 158, 11, 0.15)', fg: '#f59e0b', icon: '💡' },
    pattern: { bg: 'rgba(139, 92, 246, 0.15)', fg: '#8b5cf6', icon: '🔄' },
    decision: { bg: 'rgba(236, 72, 153, 0.15)', fg: '#ec4899', icon: '⚖️' },
    lore: { bg: 'rgba(156, 163, 175, 0.15)', fg: '#9ca3af', icon: '📜' },
  };
  return map[cat] || { bg: 'rgba(148, 163, 184, 0.12)', fg: '#94a3b8', icon: '📄' };
}

function brainLabel(brainId: string): string {
  if (!brainId || brainId === 'global') return 'Global System Brain';
  return brainId
    .split(',')
    .map((id) => {
      const t = id.trim();
      if (t === 'global') return 'Global';
      if (t.startsWith('project:')) return t.slice('project:'.length);
      if (t.startsWith('tenant:')) return `tenant:${t.slice('tenant:'.length)}`;
      return t;
    })
    .join(' + ');
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function OpenWikiPage({ activeBrainId = 'global' }: { activeBrainId?: string }) {
  // Status & Health
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [statusLoading, setStatusLoading] = useState(true);
  const [health, setHealth] = useState<HealthData | null>(null);

  // Ingestion
  const [wikiPath, setWikiPath] = useState('.');
  const [cmdOutput, setCmdOutput] = useState('');
  const [cmdRunning, setCmdRunning] = useState(false);
  const [cmdError, setCmdError] = useState(false);
  const [showIngestion, setShowIngestion] = useState(false);

  // Node Browser
  const [nodes, setNodes] = useState<MemoryNode[]>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<MemoryNode | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // ── Data Fetching ──

  const fetchNodes = async (brainId: string) => {
    setNodesLoading(true);
    setStatusLoading(true);
    try {
      const results = await fetchOpenWikiNodes(brainId);
      setNodes(results);
      setNodeCount(results.length);
      setInitialized(results.length > 0);
      setSelectedNode(null);
    } catch {
      setNodes([]);
      setInitialized(false);
    } finally {
      setNodesLoading(false);
      setStatusLoading(false);
    }
  };

  const fetchHealthData = async () => {
    try {
      const data = await fetchHealth();
      setHealth(data);
    } catch {
      setHealth(null);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    const initFetch = async () => {
      // Optimistically trigger background ingest to keep nodes fresh
      try {
        const code = `
const { execSync } = require('child_process');
try {
  execSync('npx total-recall ingest openwiki .', { encoding: 'utf8', timeout: 15000 });
} catch (e) {
  // Silent fail in background
}`;
        // Fire and forget background ingestion
        void runSandbox(code, 15000).then(() => {
          // Re-fetch nodes after background ingest completes
          void fetchNodes(activeBrainId || 'global');
        });
      } catch (e) {
        // ignore
      }
      
      await fetchNodes(activeBrainId || 'global');
    };

    void initFetch();
    void fetchHealthData();
    const interval = setInterval(fetchHealthData, 15000);
    return () => clearInterval(interval);
  }, [activeBrainId]);

  // ── Ingestion Handlers ──

  const runCliCommand = async (command: string) => {
    setCmdRunning(true);
    setCmdOutput('');
    setCmdError(false);
    try {
      const code = `
const { execSync } = require('child_process');
try {
  const out = execSync(${JSON.stringify(command)}, { encoding: 'utf8', timeout: 60000 });
  console.log(out);
} catch (e) {
  console.error(e.stderr || e.message);
  process.exit(1);
}`;
      const result = await runSandbox(code, 60000);
      setCmdOutput(result.output);
      setCmdError(!result.success);
      if (result.success) {
        await fetchNodes(activeBrainId || 'global');
      }
    } catch (e) {
      setCmdOutput((e as Error).message);
      setCmdError(true);
    } finally {
      setCmdRunning(false);
    }
  };

  // ── Drawer close on outside click ──
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
      setSelectedNode(null);
    }
  };

  return (
    <div className="dashboard-wrapper">
      <style>{`
        .dashboard-wrapper {
          padding: 32px 40px 100px;
          max-width: 1400px;
          margin: 0 auto;
          animation: fade-in 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .dashboard-header-sticky {
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(7, 11, 20, 0.85);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          padding: 24px 0;
          margin-bottom: 32px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }

        .stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
          margin-bottom: 32px;
        }

        .stat-card {
          background: rgba(23, 32, 51, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 24px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
          transition: all 0.3s ease;
        }
        
        .stat-card:hover {
          border-color: rgba(255, 255, 255, 0.12);
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
        }

        .stat-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; height: 100%;
          background: radial-gradient(circle at top right, rgba(255,255,255,0.03), transparent 60%);
          pointer-events: none;
        }

        .node-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }

        .node-card {
          background: rgba(23, 32, 51, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 14px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .node-card:hover {
          background: rgba(36, 51, 82, 0.5);
          border-color: rgba(59, 130, 246, 0.4);
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        }

        .node-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          z-index: 8000;
          display: flex;
          justify-content: flex-end;
          animation: fade-in 0.2s ease-out;
        }

        .drawer-panel {
          width: 100%;
          maxWidth: 600px;
          height: 100%;
          background: var(--bg-primary);
          border-left: 1px solid var(--border);
          overflow-y: auto;
          padding: 40px;
          box-shadow: -8px 0 40px rgba(0,0,0,0.5);
          animation: slide-in-right 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .btn-primary {
          background: linear-gradient(135deg, var(--accent), #2563eb);
          color: #fff;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
        }
        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
        }
        .btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }

        .btn-ghost {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-primary);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 500;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .btn-ghost:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }
        
        .pulse-dot {
          width: 10px; height: 10px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 12px rgba(16, 185, 129, 0.6);
          animation: pulse 2s infinite;
        }

        .terminal-log {
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 16px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          color: #a8b2d1;
          white-space: pre-wrap;
          max-height: 240px;
          overflow-y: auto;
          margin-top: 16px;
        }

        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
          100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
      `}</style>

      {/* ── Dashboard Header ── */}
      <div className="dashboard-header-sticky">
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0, background: 'linear-gradient(to right, #fff, #93c5fd)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.5px' }}>
            System Dashboard
          </h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 15 }}>
            Overview for <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{brainLabel(activeBrainId)}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn-ghost" onClick={() => setShowIngestion(!showIngestion)}>
            {showIngestion ? 'Hide Operations' : '⚙️ Operations'}
          </button>
        </div>
      </div>

      {/* ── Top Level Stats ── */}
      <div className="stat-grid">
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🧠</div>
            {statusLoading ? <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Syncing...</span> : (
              <span style={{ fontSize: 12, fontWeight: 600, color: initialized ? '#10b981' : '#f59e0b', background: initialized ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', padding: '4px 10px', borderRadius: 20 }}>
                {initialized ? 'Active' : 'Uninitialized'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>OpenWiki Nodes</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{nodeCount}</div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>⚡</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {health?.status !== 'unreachable' && <div className="pulse-dot" />}
              <span style={{ fontSize: 12, fontWeight: 600, color: health?.status !== 'unreachable' ? '#10b981' : '#ef4444' }}>
                {health?.status !== 'unreachable' ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Server Status</div>
          <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
            {health?.version ? `v${health.version}` : 'Unknown'}
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🛡️</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#8b5cf6', background: 'rgba(139,92,246,0.1)', padding: '4px 10px', borderRadius: 20 }}>
              {health?.daemon === 'running' ? 'Protected' : 'Standard'}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Daemon Process</div>
          <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2, textTransform: 'capitalize' }}>
            {health?.daemon || 'Offline'}
          </div>
        </div>
      </div>

      {/* ── Operations / Ingestion (Collapsible) ── */}
      {showIngestion && (
        <div className="stat-card" style={{ marginBottom: 32, padding: 32, animation: 'fade-in 0.3s ease-out' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 20px' }}>Repository Operations</h2>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500 }}>Target Directory</label>
              <input
                type="text"
                placeholder="Path to directory (default: .)"
                value={wikiPath}
                onChange={e => setWikiPath(e.target.value)}
                style={{ width: '100%', padding: '12px 16px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white', outline: 'none' }}
              />
            </div>
            <button className="btn-ghost" onClick={() => runCliCommand('npx -y openwiki --init')} disabled={cmdRunning}>
              {cmdRunning ? '⏳ Working...' : 'Initialize OpenWiki'}
            </button>
            <button className="btn-primary" onClick={() => runCliCommand(`npx total-recall ingest openwiki ${JSON.stringify(wikiPath.trim() || '.')}`)} disabled={cmdRunning}>
              {cmdRunning ? '⏳ Ingesting...' : 'Ingest into Memory'}
            </button>
          </div>
          {cmdOutput && (
            <div className="terminal-log" style={{ borderColor: cmdError ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255,255,255,0.08)' }}>
              {cmdOutput}
            </div>
          )}
        </div>
      )}

      {/* ── Node Browser ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Knowledge Graph</h2>
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{nodes.length} nodes loaded</span>
        </div>

        {nodesLoading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)', fontSize: 15 }}>
            <div style={{ display: 'inline-block', width: 24, height: 24, border: '2px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 16 }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div>Syncing nodes...</div>
          </div>
        ) : nodes.length === 0 ? (
          <div className="stat-card" style={{ textAlign: 'center', padding: '64px 24px' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.8 }}>📭</div>
            <h3 style={{ fontSize: 18, margin: '0 0 8px' }}>No Knowledge Nodes Found</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 440, margin: '0 auto 24px', lineHeight: 1.6 }}>
              The vault for <strong>{brainLabel(activeBrainId)}</strong> is empty. Use the operations panel to ingest a repository or change your active brain.
            </p>
            <button className="btn-primary" onClick={() => setShowIngestion(true)}>Open Operations</button>
          </div>
        ) : (
          <div className="node-grid">
            {nodes.map(node => {
              const cc = categoryColor(node.category);
              return (
                <div
                  key={node.slug}
                  className="node-card"
                  onClick={() => setSelectedNode(node)}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, lineHeight: 1.3, color: '#f8fafc' }}>
                      {node.title}
                    </h3>
                    <div className="node-badge" style={{ background: cc.bg, color: cc.fg }}>
                      {cc.icon} {node.category}
                    </div>
                  </div>
                  
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6, margin: '0 0 16px', flex: 1 }}>
                    {excerpt(node)}
                  </p>

                  {node.tags && node.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {node.tags.slice(0, 4).map(tag => (
                        <span key={tag} style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 4, color: 'var(--text-tertiary)' }}>
                          #{tag}
                        </span>
                      ))}
                      {node.tags.length > 4 && (
                        <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.02)', padding: '2px 8px', borderRadius: 4, color: 'var(--text-tertiary)' }}>
                          +{node.tags.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Slide-out Drawer ── */}
      {selectedNode && (
        <div className="drawer-overlay" onClick={handleOverlayClick}>
          <div className="drawer-panel" ref={drawerRef}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  {(() => { const cc = categoryColor(selectedNode.category); return <span className="node-badge" style={{ background: cc.bg, color: cc.fg }}>{cc.icon} {selectedNode.category}</span>; })()}
                  <span style={{ fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{selectedNode.slug}</span>
                </div>
                <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{selectedNode.title}</h2>
              </div>
              <button className="btn-ghost" onClick={() => setSelectedNode(null)} style={{ padding: '8px 12px', fontSize: 16 }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: 16, marginBottom: 24, background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
              {selectedNode.importance !== undefined && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>Importance</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{selectedNode.importance}/5</div>
                </div>
              )}
              {selectedNode.modality && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>Modality</div>
                  <div style={{ fontSize: 14, fontWeight: 600, textTransform: 'capitalize' }}>{selectedNode.modality}</div>
                </div>
              )}
              {selectedNode.priority && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>Priority</div>
                  <div style={{ fontSize: 14, fontWeight: 600, textTransform: 'capitalize' }}>{selectedNode.priority}</div>
                </div>
              )}
            </div>

            <div style={{
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              padding: 24,
              fontSize: 15,
              lineHeight: 1.8,
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
            }}>
              {selectedNode.body || selectedNode.content || selectedNode.excerpt || 'No content available.'}
            </div>

            {selectedNode.tags && selectedNode.tags.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 8, fontWeight: 500 }}>TAGS</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {selectedNode.tags.map(tag => (
                    <span key={tag} style={{ fontSize: 12, background: 'rgba(255,255,255,0.08)', padding: '4px 10px', borderRadius: 6 }}>#{tag}</span>
                  ))}
                </div>
              </div>
            )}
            
            {selectedNode.related && selectedNode.related.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 8, fontWeight: 500 }}>RELATED NODES</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {selectedNode.related.map(slug => (
                    <span key={slug} style={{ fontSize: 12, background: 'var(--bg-hover)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 6, color: 'var(--text-secondary)' }}>{slug}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
