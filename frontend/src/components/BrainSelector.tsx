import { useState, useEffect, useRef } from 'react';
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
  const selectorRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const selectedIds = activeBrainId.split(',').filter(Boolean);
  const selectedBrains = brains.filter(b => selectedIds.includes(b.id));
  
  // Fallback to first brain if none selected
  const activeBrain = selectedBrains.length > 0 ? selectedBrains[0] : brains[0];
  
  const totalNodes = selectedBrains.length > 0
    ? selectedBrains.reduce((sum, b) => sum + b.node_count, 0)
    : (activeBrain?.node_count || 0);

  const concatenatedNames = selectedBrains.length > 0
    ? selectedBrains.map(b => b.name).join(' + ')
    : (activeBrain?.name || 'No Brain');

  const layerText = selectedBrains.length > 0
    ? selectedBrains.map(b => b.layer).filter((v, i, a) => a.indexOf(v) === i).join('/')
    : (activeBrain?.layer || 'global');

  const isMulti = selectedIds.length > 1;

  const dotBg = isMulti
    ? 'linear-gradient(135deg, #a855f7, #6366f1, #10b981)'
    : activeBrain?.layer === 'global'
      ? 'linear-gradient(135deg, #818cf8, #6366f1)'
      : 'linear-gradient(135deg, #34d399, #10b981)';

  const dotShadow = isMulti
    ? '0 0 8px rgba(168,85,247,0.6)'
    : activeBrain?.layer === 'global'
      ? '0 0 6px rgba(99,102,241,0.5)'
      : '0 0 6px rgba(16,185,129,0.5)';

  const handleRowClick = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onBrainChange(id);
  };

  const handleToggle = (id: string, e?: React.SyntheticEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (selectedIds.includes(id)) {
      const nextIds = selectedIds.filter(x => x !== id);
      onBrainChange(nextIds.join(','));
    } else {
      const nextIds = [...selectedIds, id];
      onBrainChange(nextIds.join(','));
    }
  };

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
    <div ref={selectorRef} style={{ position: 'relative' }}>
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
          background: dotBg,
          flexShrink: 0,
          boxShadow: dotShadow,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {concatenatedNames}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>
            {totalNodes} nodes · {layerText}
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
          {brains.map(brain => {
            const isSelected = selectedIds.includes(brain.id);
            return (
              <button
                key={brain.id}
                onClick={(e) => handleRowClick(brain.id, e)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: isSelected ? 'var(--accent-faint)' : 'transparent',
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
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? 'var(--accent-faint)' : 'transparent' }}
                disabled={!brain.exists}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={!brain.exists}
                  style={{
                    accentColor: 'var(--accent)',
                    cursor: brain.exists ? 'pointer' : 'not-allowed',
                    marginRight: 4,
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => handleToggle(brain.id, e)}
                />
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
            );
          })}
        </div>
      )}

      {/* Empty state when zero brains are selected */}
      {selectedIds.length === 0 && !expanded && (
        <div style={{
          marginTop: 6,
          padding: '8px 10px',
          background: 'var(--bg-tertiary)',
          borderRadius: 8,
          fontSize: 11,
          color: 'var(--text-tertiary)',
          textAlign: 'center',
        }}>
          No brain selected. Select a brain to view its memories.
        </div>
      )}
    </div>
  );
}
