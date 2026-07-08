import { useState, useEffect } from 'react'
import { fetchInstructions, fetchInstructionContent, triggerRecompile } from '../api'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface Surface {
  name: string
  filename: string
  size: number
  lastCompiled: string
  active: boolean
}

interface SurfacesData {
  surfaces: Surface[]
  lastCompileTimestamp: string
  totalNodes: number
}

// ─── Known fallback surfaces when API is unavailable ────────────────────────────

const FALLBACK_SURFACES: Surface[] = [
  { name: 'AGENTS.md', filename: 'AGENTS.md', size: 0, lastCompiled: '', active: true },
  { name: 'GEMINI.md', filename: 'GEMINI.md', size: 0, lastCompiled: '', active: true },
  { name: 'CLAUDE.md', filename: 'CLAUDE.md', size: 0, lastCompiled: '', active: true },
  { name: 'INSTRUCTIONS.md', filename: 'INSTRUCTIONS.md', size: 0, lastCompiled: '', active: false },
]

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function relativeTime(iso: string): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return 'Just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ─── Simple Markdown Renderer ───────────────────────────────────────────────────

function renderMarkdown(raw: string): React.ReactNode[] {
  const lines = raw.split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      nodes.push(
        <pre key={`code-${i}`} style={{
          background: 'rgba(0,0,0,0.3)',
          padding: 12,
          borderRadius: 6,
          fontFamily: 'var(--font-mono, "JetBrains Mono", "Fira Code", monospace)',
          fontSize: 12,
          lineHeight: 1.6,
          overflowX: 'auto',
          margin: '8px 0',
          border: '1px solid rgba(255,255,255,0.04)',
          color: 'var(--text-primary)',
        }}>
          <code>{codeLines.join('\n')}</code>
        </pre>
      )
      continue
    }

    // Headings
    if (line.startsWith('### ')) {
      nodes.push(<h3 key={`h3-${i}`} style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '16px 0 6px' }}>{inlineFormat(line.slice(4))}</h3>)
      i++; continue
    }
    if (line.startsWith('## ')) {
      nodes.push(<h2 key={`h2-${i}`} style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '20px 0 8px', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>{inlineFormat(line.slice(3))}</h2>)
      i++; continue
    }
    if (line.startsWith('# ')) {
      nodes.push(<h1 key={`h1-${i}`} style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: '24px 0 10px' }}>{inlineFormat(line.slice(2))}</h1>)
      i++; continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      nodes.push(
        <blockquote key={`bq-${i}`} style={{
          borderLeft: '3px solid var(--accent)',
          paddingLeft: 12,
          margin: '8px 0',
          color: 'var(--text-secondary)',
          fontStyle: 'italic',
          fontSize: 13,
        }}>
          {inlineFormat(line.slice(2))}
        </blockquote>
      )
      i++; continue
    }

    // List item
    if (line.startsWith('- ') || line.startsWith('* ')) {
      nodes.push(
        <div key={`li-${i}`} style={{ display: 'flex', gap: 8, margin: '3px 0', fontSize: 13, color: 'var(--text-primary)' }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0 }}>•</span>
          <span>{inlineFormat(line.slice(2))}</span>
        </div>
      )
      i++; continue
    }

    // Empty line
    if (line.trim() === '') {
      nodes.push(<div key={`br-${i}`} style={{ height: 8 }} />)
      i++; continue
    }

    // Paragraph
    nodes.push(<p key={`p-${i}`} style={{ margin: '4px 0', fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)' }}>{inlineFormat(line)}</p>)
    i++
  }

  return nodes
}

function inlineFormat(text: string): React.ReactNode {
  // Process inline: **bold**, *italic*, `code`
  const parts: React.ReactNode[] = []
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2]) {
      parts.push(<strong key={match.index} style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{match[2]}</strong>)
    } else if (match[3]) {
      parts.push(<em key={match.index} style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>{match[3]}</em>)
    } else if (match[4]) {
      parts.push(
        <code key={match.index} style={{
          background: 'rgba(108,92,231,0.15)',
          padding: '1px 5px',
          borderRadius: 3,
          fontFamily: 'var(--font-mono, "JetBrains Mono", "Fira Code", monospace)',
          fontSize: '0.9em',
          color: 'var(--accent)',
        }}>{match[4]}</code>
      )
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts.length === 1 ? parts[0] : <>{parts}</>
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function InstructionsPage() {
  const [surfaces, setSurfaces] = useState<Surface[]>([])
  const [selected, setSelected] = useState<Surface | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [lastCompiled, setLastCompiled] = useState('')
  const [totalNodes, setTotalNodes] = useState(0)
  const [isFallback, setIsFallback] = useState(false)

  // ─── Data Loading ─────────────────────────────────────────────────────────────

  const loadSurfaces = async () => {
    setLoading(true)
    setError(null)
    try {
      const data: SurfacesData = await fetchInstructions()

      // Handle case where API returns surfaces array
      if (data.surfaces && Array.isArray(data.surfaces)) {
        setSurfaces(data.surfaces)
        setLastCompiled(data.lastCompileTimestamp || '')
        setTotalNodes(data.totalNodes || 0)
        setIsFallback(false)
        if (data.surfaces.length > 0) {
          const first = data.surfaces[0]
          setSelected(first)
          void loadContent(first.name)
        }
      } else {
        // API returned unexpected format — use fallback
        applyFallback()
      }
    } catch {
      applyFallback()
    } finally {
      setLoading(false)
    }
  }

  const applyFallback = () => {
    setSurfaces(FALLBACK_SURFACES)
    setIsFallback(true)
    setLastCompiled('')
    setTotalNodes(0)
    const first = FALLBACK_SURFACES[0]
    setSelected(first)
    setContent('Content unavailable — recompile to regenerate')
  }

  const loadContent = async (name: string) => {
    setContentLoading(true)
    try {
      const data = await fetchInstructionContent(name)
      setContent(data.content || 'Empty surface — no compiled content yet.')
    } catch {
      setContent('Content unavailable — recompile to regenerate')
    } finally {
      setContentLoading(false)
    }
  }

  const handleSelect = (surface: Surface) => {
    setSelected(surface)
    void loadContent(surface.name)
  }

  const handleRecompile = async () => {
    setCompiling(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await triggerRecompile()
      setSuccess(result.message || 'Surfaces recompiled successfully!')
      setTimeout(() => setSuccess(null), 5000)
      // Refresh surfaces after recompile
      void loadSurfaces()
    } catch (err: unknown) {
      setError((err as Error).message || 'Recompilation failed.')
      setTimeout(() => setError(null), 8000)
    } finally {
      setCompiling(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- legitimate data fetch on mount
    void loadSurfaces()
  }, [])

  // ─── Derived Stats ───────────────────────────────────────────────────────────

  const activeSurfaces = surfaces.filter(s => s.active).length
  const totalSize = surfaces.reduce((sum, s) => sum + (s.size || 0), 0)

  const stats = [
    { id: 'stat-total', label: 'Total Surfaces', value: surfaces.length, icon: '📄', color: 'var(--accent)' },
    { id: 'stat-active', label: 'Active Surfaces', value: activeSurfaces, icon: '✅', color: 'var(--success)' },
    { id: 'stat-nodes', label: 'Total Memory Nodes', value: totalNodes || '—', icon: '🧠', color: 'var(--warning)' },
    { id: 'stat-compiled', label: 'Last Compiled', value: lastCompiled ? relativeTime(lastCompiled) : 'Never', icon: '🕐', color: 'var(--text-secondary)' },
  ]

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="page" id="instructions-page">

      {/* Page Header */}
      <div className="page-header" id="instructions-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1>Instruction Surfaces</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            Compiled rule shims injected into agent context windows
            {isFallback && <span style={{ color: 'var(--warning)', marginLeft: 8, fontSize: 11 }}>⚠ Fallback mode</span>}
          </p>
        </div>
        <button
          id="btn-recompile-all"
          className="btn btn-primary"
          onClick={() => void handleRecompile()}
          disabled={compiling}
          style={{
            background: compiling ? 'var(--bg-secondary)' : 'linear-gradient(135deg, var(--accent), #8b7cf7)',
            color: '#fff',
            border: 'none',
            padding: '10px 20px',
            borderRadius: 8,
            fontWeight: 600,
            cursor: compiling ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            transition: 'all 0.2s ease',
          }}
        >
          {compiling ? (
            <>
              <span style={{
                width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite', display: 'inline-block',
              }} />
              Recompiling…
            </>
          ) : (
            <>🔄 Recompile All</>
          )}
        </button>
      </div>

      {/* Status Banners */}
      {error && (
        <div id="instructions-error" style={{
          marginBottom: 16, padding: '10px 16px', borderRadius: 8,
          background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)',
          color: 'var(--error)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div id="instructions-success" style={{
          marginBottom: 16, padding: '10px 16px', borderRadius: 8,
          background: 'rgba(0,206,201,0.1)', border: '1px solid rgba(0,206,201,0.3)',
          color: 'var(--success)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          ✓ {success}
        </div>
      )}

      {/* Stats Cards Row */}
      <div id="instructions-stats" style={{
        display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap',
      }}>
        {stats.map((stat) => (
          <div key={stat.id} id={stat.id} className="card" style={{
            flex: '1 1 180px',
            padding: '18px 20px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            backdropFilter: 'blur(12px)',
            borderRadius: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            transition: 'all 0.2s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>{stat.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{stat.label}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: stat.color, letterSpacing: -0.5 }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Main Split Layout */}
      <div id="instructions-layout" style={{
        display: 'flex', gap: 20, flex: 1, minHeight: 0, overflow: 'hidden',
      }}>

        {/* Left Panel — Surface List */}
        <div id="surface-list-panel" style={{
          width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}>
          <div className="card" style={{
            padding: 16,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            backdropFilter: 'blur(12px)',
            borderRadius: 10,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}>
            <h3 style={{
              fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)',
              textTransform: 'uppercase', letterSpacing: 0.5,
              borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 12,
            }}>
              Surfaces ({surfaces.length})
            </h3>

            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                Loading surfaces…
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, overflowY: 'auto' }}>
                {surfaces.map((surface) => {
                  const isActive = selected?.name === surface.name
                  return (
                    <div
                      key={surface.name}
                      id={`surface-item-${surface.name.replace(/[^a-zA-Z0-9]/g, '-')}`}
                      onClick={() => handleSelect(surface)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect(surface) }}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        background: isActive ? 'rgba(108,92,231,0.12)' : 'transparent',
                        borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                        position: 'relative',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(108,92,231,0.08)'
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 600,
                          color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                        }}>
                          {surface.name}
                        </span>
                        {surface.active && (
                          <span style={{
                            width: 7, height: 7, borderRadius: '50%',
                            background: 'var(--success)',
                            boxShadow: '0 0 6px rgba(0,206,201,0.4)',
                            display: 'inline-block', flexShrink: 0,
                          }} />
                        )}
                      </div>
                      <div style={{
                        display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-tertiary)',
                      }}>
                        <span>{formatBytes(surface.size)}</span>
                        {surface.lastCompiled && <span>{relativeTime(surface.lastCompiled)}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Total size footer */}
            {!loading && surfaces.length > 0 && (
              <div style={{
                borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 10,
                fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', justifyContent: 'space-between',
              }}>
                <span>Total</span>
                <span>{formatBytes(totalSize)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel — Content Viewer */}
        <div id="surface-content-panel" style={{
          flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0,
        }}>
          <div className="card" style={{
            padding: 24,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            backdropFilter: 'blur(12px)',
            borderRadius: 10,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Content Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 16,
            }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {selected ? selected.name : 'Select a surface'}
                </h2>
                {selected && (
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, display: 'flex', gap: 12 }}>
                    <span>{formatBytes(selected.size)}</span>
                    {selected.lastCompiled && <span>Compiled {relativeTime(selected.lastCompiled)}</span>}
                    {selected.active && (
                      <span className="badge badge-success" style={{
                        fontSize: 10, padding: '1px 8px', borderRadius: 4,
                        background: 'rgba(0,206,201,0.12)', color: 'var(--success)',
                        border: '1px solid rgba(0,206,201,0.2)',
                      }}>
                        Active
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Content Body */}
            <div id="surface-content-body" style={{
              flex: 1, overflowY: 'auto', overflowX: 'hidden',
              paddingRight: 8,
            }}>
              {contentLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  <div style={{
                    width: 28, height: 28, border: '3px solid var(--border)',
                    borderTopColor: 'var(--accent)', borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                    margin: '0 auto 12px',
                  }} />
                  Loading surface content…
                </div>
              ) : !selected ? (
                <div style={{
                  padding: 60, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14,
                }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                  Select a surface from the left to view its compiled content
                </div>
              ) : (
                <div style={{ lineHeight: 1.6 }}>
                  {renderMarkdown(content)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Inline keyframe for spinner */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        /* Responsive: stack panels vertically at 768px */
        @media (max-width: 768px) {
          #instructions-layout {
            flex-direction: column !important;
          }
          #surface-list-panel {
            width: 100% !important;
            max-height: 260px;
          }
          #instructions-stats {
            flex-direction: column !important;
          }
          #instructions-stats .card {
            flex: 1 1 100% !important;
          }
        }
      `}</style>
    </div>
  )
}
