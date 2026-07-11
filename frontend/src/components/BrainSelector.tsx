import { useState, useEffect, useRef } from 'react'
import { getApiBase } from '../api'

interface BrainInfo {
  id: string
  name: string
  layer: 'global' | 'project'
  path: string
  project_root?: string
  exists: boolean
  node_count: number
  registered_at?: string
  last_compiled: string | null
}

interface BrainSelectorProps {
  activeBrainId: string
  onBrainChange: (brainId: string) => void
}

function layerDot(layer: string, multi = false): string {
  if (multi) return 'linear-gradient(135deg, #60a5fa, #34d399)'
  if (layer === 'global') return 'linear-gradient(135deg, #60a5fa, #2563eb)'
  return 'linear-gradient(135deg, #34d399, #059669)'
}

export default function BrainSelector({ activeBrainId, onBrainChange }: BrainSelectorProps) {
  const [brains, setBrains] = useState<BrainInfo[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(true)
  const selectorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const base = getApiBase()
    fetch(`${base}/api/brains`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        setBrains(data.brains || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
        setExpanded(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedIds = activeBrainId.split(',').filter(Boolean)
  const selectedBrains = brains.filter((b) => selectedIds.includes(b.id))
  const primary = selectedBrains[0] || brains[0]
  const isMulti = selectedIds.length > 1
  const totalNodes = selectedBrains.reduce((sum, b) => sum + (b.node_count || 0), 0) || primary?.node_count || 0

  const label = isMulti
    ? `${selectedIds.length} brains`
    : primary?.name || 'Brain'

  const handleToggle = (id: string, e: React.SyntheticEvent) => {
    e.stopPropagation()
    if (selectedIds.includes(id)) {
      onBrainChange(selectedIds.filter((x) => x !== id).join(','))
    } else {
      onBrainChange([...selectedIds, id].join(','))
    }
  }

  if (loading) {
    return (
      <div className="brain-selector-trigger" style={{ opacity: 0.6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Brains…</span>
      </div>
    )
  }

  if (brains.length === 0) return null

  return (
    <div ref={selectorRef} className="brain-selector" style={{ position: 'relative' }}>
      <button
        type="button"
        className="brain-selector-trigger"
        onClick={() => setExpanded((v) => !v)}
        title="Select brain layers"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          background: expanded ? 'rgba(59, 130, 246, 0.12)' : 'rgba(148, 163, 184, 0.06)',
          border: `1px solid ${expanded ? 'var(--border-accent)' : 'var(--border)'}`,
          borderRadius: 8,
          cursor: 'pointer',
          color: 'var(--text-primary)',
          textAlign: 'left',
          transition: 'all 0.15s',
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: layerDot(primary?.layer || 'global', isMulti),
            boxShadow: isMulti
              ? '0 0 6px rgba(52, 211, 153, 0.5)'
              : '0 0 6px rgba(59, 130, 246, 0.45)',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>
          {totalNodes}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{
            opacity: 0.45,
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
            flexShrink: 0,
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div
          className="brain-selector-menu"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            marginBottom: 6,
            background: 'linear-gradient(165deg, rgba(18, 26, 43, 0.98), rgba(8, 12, 22, 0.99))',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 -8px 28px rgba(0,0,0,0.45)',
            overflow: 'hidden',
            zIndex: 1000,
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              padding: '6px 10px',
              fontSize: 9,
              fontWeight: 700,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              borderBottom: '1px solid var(--border)',
            }}
          >
            Brains · multi-select
          </div>
          {brains.map((brain) => {
            const isSelected = selectedIds.includes(brain.id)
            return (
              <div
                key={brain.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (!brain.exists) return
                  onBrainChange(brain.id)
                  setExpanded(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && brain.exists) {
                    onBrainChange(brain.id)
                    setExpanded(false)
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  cursor: brain.exists ? 'pointer' : 'not-allowed',
                  opacity: brain.exists ? 1 : 0.45,
                  background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                  borderLeft: isSelected ? '2px solid #3b82f6' : '2px solid transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => {
                  if (brain.exists) e.currentTarget.style.background = 'rgba(148, 163, 184, 0.08)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isSelected ? 'rgba(59, 130, 246, 0.12)' : 'transparent'
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={!brain.exists}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => handleToggle(brain.id, e)}
                  style={{
                    width: 13,
                    height: 13,
                    accentColor: '#3b82f6',
                    cursor: brain.exists ? 'pointer' : 'not-allowed',
                    margin: 0,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: layerDot(brain.layer),
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {brain.name}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 1 }}>
                    {brain.node_count}n
                    {brain.layer === 'project' && brain.project_root
                      ? ` · ${brain.project_root.split('/').pop()}`
                      : ''}
                    {!brain.exists ? ' · missing' : ''}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    padding: '2px 5px',
                    borderRadius: 4,
                    flexShrink: 0,
                    background:
                      brain.layer === 'global'
                        ? 'rgba(59, 130, 246, 0.15)'
                        : 'rgba(16, 185, 129, 0.12)',
                    color: brain.layer === 'global' ? '#93c5fd' : '#6ee7b7',
                  }}
                >
                  {brain.layer === 'global' ? 'G' : 'P'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
