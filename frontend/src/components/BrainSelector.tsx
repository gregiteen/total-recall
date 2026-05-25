import { useState, useEffect } from 'react';
import { getApiBase } from '../api';

interface BrainInfo {
  id: string;
  name: string;
  layer: 'global' | 'project';
  path: string;
  project_root?: string;
  exists: boolean;
  node_count: number;
  registered_at?: string;
  last_compiled: string | null;
}

interface BrainSelectorProps {
  activeBrainId: string;
  onBrainChange: (brainId: string) => void;
}

export default function BrainSelector({ activeBrainId, onBrainChange }: BrainSelectorProps) {
  const [brains, setBrains] = useState<BrainInfo[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = getApiBase();
    fetch(`${base}/api/brains`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setBrains(data.brains || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const activeBrain = brains.find(b => b.id === activeBrainId) || brains[0];

  if (loading) {
    return (
      <div style={{
        padding: '8px 10px',
        background: 'var(--bg-tertiary)',
        borderRadius: 8,
        fontSize: 11,
        color: 'var(--text-tertiary)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span style={{ animation: 'spin 0.8s linear infinite', display: 'inline-block' }}>⟳</span>
        Loading brains…
      </div>
    );
  }

  if (brains.length === 0) return null;

  return (
    <div style={{ position: 'relative' }}>
      {/* Active brain pill */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          padding: '8px 10px',
          background: expanded ? 'var(--accent-faint)' : 'var(--bg-tertiary)',
          border: `1px solid ${expanded ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 8,
          cursor: 'pointer',
          color: 'var(--text-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          transition: 'all 0.15s',
          textAlign: 'left',
        }}
        title="Switch brain layer"
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: activeBrain?.layer === 'global'
            ? 'linear-gradient(135deg, #818cf8, #6366f1)'
            : 'linear-gradient(135deg, #34d399, #10b981)',
          flexShrink: 0,
          boxShadow: activeBrain?.layer === 'global'
            ? '0 0 6px rgba(99,102,241,0.5)'
            : '0 0 6px rgba(16,185,129,0.5)',
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeBrain?.name || 'No Brain'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>
            {activeBrain?.node_count || 0} nodes · {activeBrain?.layer}
          </div>
        </div>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s', flexShrink: 0, opacity: 0.5 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown */}
      {expanded && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          right: 0,
          marginBottom: 4,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          zIndex: 1000,
        }}>
          <div style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Brain Layers
          </div>
          {brains.map(brain => (
            <button
              key={brain.id}
              onClick={() => { onBrainChange(brain.id); setExpanded(false); }}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: brain.id === activeBrainId ? 'var(--accent-faint)' : 'transparent',
                border: 'none',
                cursor: brain.exists ? 'pointer' : 'not-allowed',
                color: brain.exists ? 'var(--text-primary)' : 'var(--text-tertiary)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                textAlign: 'left',
                opacity: brain.exists ? 1 : 0.5,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (brain.exists) (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = brain.id === activeBrainId ? 'var(--accent-faint)' : 'transparent' }}
              disabled={!brain.exists}
            >
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: brain.layer === 'global'
                  ? 'linear-gradient(135deg, #818cf8, #6366f1)'
                  : 'linear-gradient(135deg, #34d399, #10b981)',
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 11 }}>
                  {brain.name}
                  {brain.id === activeBrainId && <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.6 }}>✓</span>}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>
                  {brain.node_count} nodes
                  {brain.layer === 'project' && brain.project_root && (
                    <span> · {brain.project_root.split('/').pop()}</span>
                  )}
                  {!brain.exists && ' · not found'}
                </div>
              </div>
              <span style={{
                fontSize: 9,
                padding: '1px 5px',
                borderRadius: 4,
                background: brain.layer === 'global'
                  ? 'rgba(99,102,241,0.15)'
                  : 'rgba(16,185,129,0.15)',
                color: brain.layer === 'global' ? '#818cf8' : '#34d399',
                fontWeight: 600,
                flexShrink: 0,
              }}>
                {brain.layer}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
