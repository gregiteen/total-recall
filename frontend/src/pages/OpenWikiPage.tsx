import { useState, useEffect, useRef } from 'react';
import {
  runSandbox,
  fetchOpenWikiNodes,
} from '../api';
import type { MemoryNode } from '../types';

// ─── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '10px 14px',
  fontSize: 14,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border)',
  backdropFilter: 'blur(12px)',
  borderRadius: 10,
  padding: 24,
};

const outputStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: 16,
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 13,
  lineHeight: 1.6,
  color: 'var(--text-secondary)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 280,
  overflowY: 'auto',
  marginTop: 16,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-secondary)',
};

const badgeStyle = (bg: string, fg: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '3px 10px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  background: bg,
  color: fg,
  letterSpacing: 0.4,
});

const nodeCardStyle: React.CSSProperties = {
  ...cardStyle,
  padding: 18,
  cursor: 'pointer',
  transition: 'border-color 0.2s, transform 0.15s',
};

const pillStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 3,
  fontSize: 11,
  fontWeight: 500,
  background: 'rgba(108,92,231,0.15)',
  color: 'var(--accent)',
  marginRight: 4,
  marginBottom: 4,
};

const drawerOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  zIndex: 8000,
  display: 'flex',
  justifyContent: 'flex-end',
};

const drawerPanel: React.CSSProperties = {
  width: '100%',
  maxWidth: 560,
  height: '100%',
  background: 'var(--bg-primary)',
  borderLeft: '1px solid var(--border)',
  overflowY: 'auto',
  padding: 32,
  animation: 'slideInRight 0.25s ease-out',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function excerpt(node: MemoryNode, maxLen = 200): string {
  const text = node.body || node.content || node.excerpt || '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

function categoryColor(cat: string): { bg: string; fg: string } {
  const map: Record<string, { bg: string; fg: string }> = {
    invariant: { bg: 'rgba(255,107,107,0.15)', fg: 'var(--error)' },
    preference: { bg: 'rgba(108,92,231,0.15)', fg: 'var(--accent)' },
    fact: { bg: 'rgba(0,206,201,0.15)', fg: 'var(--success)' },
    concept: { bg: 'rgba(253,203,110,0.15)', fg: 'var(--warning)' },
    pattern: { bg: 'rgba(108,92,231,0.15)', fg: 'var(--accent)' },
    decision: { bg: 'rgba(253,203,110,0.15)', fg: 'var(--warning)' },
    lore: { bg: 'rgba(158,158,158,0.15)', fg: 'var(--text-secondary)' },
  };
  return map[cat] || { bg: 'rgba(158,158,158,0.12)', fg: 'var(--text-secondary)' };
}

// ─── Component ─────────────────────────────────────────────────────────────────

function brainLabel(brainId: string): string {
  if (!brainId || brainId === 'global') return 'Global brain';
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

export default function OpenWikiPage({ activeBrainId = 'global' }: { activeBrainId?: string }) {
  // Status
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [statusLoading, setStatusLoading] = useState(true);

  // Ingestion
  const [wikiPath, setWikiPath] = useState('.');
  const [cmdOutput, setCmdOutput] = useState('');
  const [cmdRunning, setCmdRunning] = useState(false);
  const [cmdError, setCmdError] = useState(false);

  // Node Browser
  const [nodes, setNodes] = useState<MemoryNode[]>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<MemoryNode | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // ── Data Fetching (scoped to selected brain / repos) ──

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

  useEffect(() => {
    void fetchNodes(activeBrainId || 'global');
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
        // Refresh nodes after successful ingestion
        await fetchNodes(activeBrainId || 'global');
      }
    } catch (e) {
      setCmdOutput((e as Error).message);
      setCmdError(true);
    } finally {
      setCmdRunning(false);
    }
  };

  const handleInit = () => {
    runCliCommand('npx -y openwiki --init');
  };

  const handleIngest = () => {
    const safePath = wikiPath.trim() || '.';
    runCliCommand(`npx total-recall ingest openwiki ${JSON.stringify(safePath)}`);
  };

  // ── Drawer close on outside click ──
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
      setSelectedNode(null);
    }
  };

  // ── Render ──

  return (
    <div className="page">
      {/* Inline keyframes for drawer animation */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        .openwiki-node-card:hover {
          border-color: var(--accent) !important;
          transform: translateY(-2px);
        }
      `}</style>

      <div className="page-header">
        <h1>📚 OpenWiki Browser</h1>
        <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>
          Auto-document your codebase with OpenWiki and ingest nodes into memory.
          Scoped to <strong style={{ color: 'var(--text-primary)' }}>{brainLabel(activeBrainId)}</strong>
          {' '}— change the brain selector to switch repos.
        </p>
      </div>

      {/* ── Status Banner ── */}
      <div
        id="openwiki-status-banner"
        style={{
          ...cardStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 24,
          padding: '16px 24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {statusLoading ? (
            <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Checking status…</span>
          ) : initialized ? (
            <>
              <span style={badgeStyle('rgba(0,206,201,0.15)', 'var(--success)')}>Initialized</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                {nodeCount} node{nodeCount !== 1 ? 's' : ''} in {brainLabel(activeBrainId)}
              </span>
            </>
          ) : (
            <span style={badgeStyle('rgba(255,107,107,0.15)', 'var(--error)')}>Not Initialized</span>
          )}
        </div>
        <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'var(--font-mono, monospace)' }}>
          openwiki · total-recall integration
        </span>
      </div>

      {/* ── Ingestion Section ── */}
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
          Ingestion
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="openwiki-path" style={labelStyle}>OpenWiki Directory</label>
            <input
              id="openwiki-path"
              type="text"
              placeholder="Path to OpenWiki directory (default: current project root)"
              value={wikiPath}
              onChange={e => setWikiPath(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              id="openwiki-init"
              className="btn btn-ghost"
              onClick={handleInit}
              disabled={cmdRunning}
            >
              {cmdRunning ? '⏳' : '⚙'} Initialize OpenWiki
            </button>
            <button
              id="openwiki-ingest"
              className="btn btn-primary"
              onClick={handleIngest}
              disabled={cmdRunning}
            >
              {cmdRunning ? '⏳ Ingesting…' : '📥 Ingest into Memory'}
            </button>
          </div>
        </div>

        {cmdOutput && (
          <div
            id="openwiki-cmd-output"
            style={{ ...outputStyle, borderColor: cmdError ? 'var(--error)' : 'var(--border)' }}
          >
            {cmdOutput}
          </div>
        )}
      </div>

      {/* ── Node Browser ── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
          Node Browser
        </h2>

        {nodesLoading && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
            Loading nodes…
          </div>
        )}

        {!nodesLoading && nodes.length === 0 && (
          <div
            id="openwiki-empty-state"
            style={{
              ...cardStyle,
              textAlign: 'center',
              padding: '48px 24px',
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 15, maxWidth: 440, margin: '0 auto' }}>
              No OpenWiki nodes for <strong>{brainLabel(activeBrainId)}</strong>. Switch the brain
              selector, or initialize / ingest OpenWiki into this project’s vault.
            </p>
          </div>
        )}

        {!nodesLoading && nodes.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 14,
            }}
          >
            {nodes.map(node => {
              const cc = categoryColor(node.category);
              return (
                <div
                  key={node.slug}
                  id={`openwiki-node-${node.slug}`}
                  className="openwiki-node-card"
                  style={nodeCardStyle}
                  onClick={() => setSelectedNode(node)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') setSelectedNode(node); }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {node.title}
                    </span>
                    <span style={badgeStyle(cc.bg, cc.fg)}>{node.category}</span>
                  </div>

                  {node.tags && node.tags.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      {node.tags.slice(0, 5).map(tag => (
                        <span key={tag} style={pillStyle}>{tag}</span>
                      ))}
                      {node.tags.length > 5 && (
                        <span style={{ ...pillStyle, background: 'rgba(158,158,158,0.12)', color: 'var(--text-secondary)' }}>
                          +{node.tags.length - 5}
                        </span>
                      )}
                    </div>
                  )}

                  <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                    {excerpt(node)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Slide-out Drawer ── */}
      {selectedNode && (
        <div style={drawerOverlay} onClick={handleOverlayClick}>
          <div ref={drawerRef} style={drawerPanel} id="openwiki-node-drawer">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px', wordBreak: 'break-word' }}>
                  {selectedNode.title}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {(() => { const cc = categoryColor(selectedNode.category); return <span style={badgeStyle(cc.bg, cc.fg)}>{selectedNode.category}</span>; })()}
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono, monospace)' }}>
                    {selectedNode.slug}
                  </span>
                </div>
              </div>
              <button
                id="openwiki-drawer-close"
                className="btn btn-ghost"
                onClick={() => setSelectedNode(null)}
                style={{ fontSize: 18, padding: '4px 10px', flexShrink: 0 }}
                aria-label="Close drawer"
              >
                ✕
              </button>
            </div>

            {selectedNode.tags && selectedNode.tags.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {selectedNode.tags.map(tag => (
                  <span key={tag} style={pillStyle}>{tag}</span>
                ))}
              </div>
            )}

            {selectedNode.importance && (
              <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Importance:</strong> {selectedNode.importance}/5
                {selectedNode.modality && (
                  <span> · <strong style={{ color: 'var(--text-primary)' }}>Modality:</strong> {selectedNode.modality}</span>
                )}
                {selectedNode.priority && (
                  <span> · <strong style={{ color: 'var(--text-primary)' }}>Priority:</strong> {selectedNode.priority}</span>
                )}
              </div>
            )}

            <div
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 20,
                fontSize: 14,
                lineHeight: 1.7,
                color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {selectedNode.body || selectedNode.content || selectedNode.excerpt || 'No content available.'}
            </div>

            {selectedNode.related && selectedNode.related.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Related: </span>
                {selectedNode.related.map(slug => (
                  <span key={slug} style={{ ...pillStyle, background: 'rgba(158,158,158,0.12)', color: 'var(--text-secondary)' }}>
                    {slug}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
