import { useMemo, useState, useEffect } from 'react'
import { getApiBase, connectClient, fetchActiveIntegrations, fetchExtensionStatus } from '../api'

type Preset = {
  id: string
  name: string
  surface: string
  command: string
  snippet: (baseUrl: string) => string
}

const PRESETS: Preset[] = [
  {
    id: 'antigravity',
    name: 'Antigravity',
    surface: '.agents/skills/total-recall/SKILL.md',
    command: 'npx total-recall connect antigravity',
    snippet: () => `Injects SSSS vault directly into Antigravity skill definitions.`
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    surface: 'GEMINI.md',
    command: 'npx total-recall connect gemini',
    snippet: () => `Compiles project memory into GEMINI.md for the Gemini CLI.`
  },
  {
    id: 'cursor',
    name: 'Cursor',
    surface: '.cursor/rules/total-recall.mdc',
    command: 'npx total-recall connect cursor',
    snippet: () => `Continuously updates Cursor workspace rules with extracted memories.`
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    surface: 'CLAUDE.md',
    command: 'npx total-recall connect claude-code',
    snippet: () => `Continuously updates Claude project instructions with extracted memories.`
  },
  {
    id: 'codex',
    name: 'Codex / OpenAI',
    surface: 'AGENTS.md',
    command: 'npx total-recall connect codex',
    snippet: () => `Injects SSSS knowledge graph into Codex target surfaces.`
  },
  {
    id: 'vscode',
    name: 'VS Code Copilot',
    surface: '.github/copilot-instructions.md',
    command: 'npx total-recall connect vscode',
    snippet: () => `Auto-compiles memory insights into Copilot repository instructions.`
  },
  {
    id: 'pi',
    name: 'Pi Coding Agent',
    surface: '~/.pi/agent/AGENTS.md',
    command: 'npx total-recall connect pi',
    snippet: () => `Symlinks the compiled global agent surface for Pi terminal use.`
  },
  {
    id: 'hermes',
    name: 'Hermes Agent',
    surface: '~/.hermes/memories/MEMORY.md',
    command: 'npx total-recall connect hermes',
    snippet: () => `Pushes truncated memory surface projections to autonomous Hermes.`
  },
  {
    id: 'dsh',
    name: 'DeepSeek Harness (dsh)',
    surface: 'AGENTS.md / ~/.dsh/memory/MEMORY.md',
    command: 'npx total-recall connect dsh',
    snippet: () => `Integrates SSSS memory and skills into DeepSeek Harness agent runtimes.`
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    surface: 'MEMORY.md',
    command: 'npx total-recall connect openclaw',
    snippet: () => `Mounts the Total Recall memory target for local OpenClaw runtimes.`
  }
]

export default function IntegrationsPage({ activeBrainId }: { activeBrainId?: string }) {
  const [copied, setCopied] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [activeIdes, setActiveIdes] = useState<string[]>([])
  const [extStatus, setExtStatus] = useState<{ available: boolean; connected: boolean } | null>(null)

  const baseUrl = useMemo(() => {
    const configured = getApiBase()
    if (configured) return configured.replace(/\/$/, '')
    return window.location.origin
  }, [])

  useEffect(() => {
    let active = true

    fetchActiveIntegrations()
      .then(res => {
        if (active && res.success && Array.isArray(res.active)) {
          setActiveIdes(res.active)
        }
      })
      .catch(e => {
        if (active) setMessage({ type: 'error', text: `Failed to fetch active integrations: ${(e as Error).message || 'Unknown error'}` })
      })

    fetchExtensionStatus()
      .then(res => {
        if (active) setExtStatus(res)
      })
      .catch(e => {
        if (active) setMessage({ type: 'error', text: `Failed to fetch extension status: ${(e as Error).message || 'Unknown error'}` })
      })

    return () => { active = false }
  }, [activeBrainId])

  const filteredPresets = useMemo(() => {
    if (activeIdes.length === 0) return PRESETS
    return PRESETS.filter(preset => activeIdes.includes(preset.id))
  }, [activeIdes])

  const copy = async (id: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(id)
    setTimeout(() => setCopied(null), 1800)
  }

  const handleConnect = async (presetId: string) => {
    setConnecting(presetId)
    setMessage(null)
    try {
      const result = await connectClient(presetId, baseUrl)
      if (result.success) {
        setMessage({ type: 'success', text: `Successfully enabled ${presetId} integration! Total Recall is now injecting memories.` })
        // Refresh active list
        const res = await fetchActiveIntegrations()
        if (res.success && Array.isArray(res.active)) {
          setActiveIdes(res.active)
        }
      } else {
        setMessage({ type: 'error', text: `Failed to enable integration: ${result.message}` })
      }
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message || 'Failed to connect.' })
    } finally {
      setConnecting(null)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Integrations</h1>
        <p>Enable automated memory injection for your local IDEs and agents</p>
      </div>

      {message && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 14,
          fontWeight: 500,
          background: message.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: message.type === 'success' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
          color: message.type === 'success' ? '#34d399' : '#f87171',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}>
          <span>{message.text}</span>
          <button 
            onClick={() => setMessage(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: 18,
              padding: '0 4px',
              lineHeight: '1',
            }}
          >
            ×
          </button>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 16,
      }}>
        {/* Chrome Extension Integration Card */}
        <div style={{
          border: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          borderRadius: 12,
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          position: 'relative',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <h3 style={{ margin: '0 0 4px' }}>Chrome Extension</h3>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Browser Overlay Panel & Capture</div>
            </div>
            {extStatus ? (
              extStatus.connected ? (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 8px',
                  borderRadius: 6,
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  fontSize: 12,
                  color: '#34d399',
                  fontWeight: 500,
                }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#10b981',
                    boxShadow: '0 0 8px #10b981',
                  }} />
                  Connected
                </span>
              ) : (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 8px',
                  borderRadius: 6,
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  fontSize: 12,
                  color: '#fbbf24',
                  fontWeight: 500,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
                  Not Connected
                </span>
              )
            ) : (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: 12,
                color: 'var(--text-tertiary)'
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#94a3b8' }} />
                Checking...
              </span>
            )}
          </div>

          <div style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 10,
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: '1.4'
          }}>
            Install the Total Recall extension to passively capture context, store quick notes, and access the active brain search overlay inside any Chrome tab.
          </div>

          <div style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 10,
            fontFamily: 'monospace',
            fontSize: 11,
            whiteSpace: 'pre-wrap',
            color: 'var(--text-tertiary)',
          }}>
            1. Download zip & unzip locally.{"\n"}
            2. Go to chrome://extensions in browser.{"\n"}
            3. Enable "Developer mode" (top right).{"\n"}
            4. Click "Load unpacked" & select unzipped folder.
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 8 }}>
            <a
              href={`${baseUrl}/api/extension/download`}
              download
              className="btn btn-sm btn-primary"
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                border: 'none',
                boxShadow: '0 2px 4px rgba(59, 130, 246, 0.3)',
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 12px',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '12px'
              }}
            >
              ⬇ Download Extension Zip
            </a>
          </div>
        </div>

        {filteredPresets.map(preset => {
          const snippet = preset.snippet(baseUrl)
          
          const isActive = activeIdes.includes(preset.id)
          
          let statusBadge = (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              borderRadius: 6,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              fontSize: 12,
              color: 'var(--text-tertiary)'
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#94a3b8' }} />
              Inactive
            </span>
          )

          if (isActive) {
            statusBadge = (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                borderRadius: 6,
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                fontSize: 12,
                color: '#34d399',
                fontWeight: 500,
              }}>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 8px #10b981',
                }} />
                Injecting Memories
              </span>
            )
          }

          return (
            <div key={preset.id} style={{
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              borderRadius: 12,
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              position: 'relative',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <h3 style={{ margin: '0 0 4px' }}>{preset.name}</h3>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Target: <code>{preset.surface}</code></div>
                </div>
                {statusBadge}
              </div>

              <div style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 10,
                fontSize: 13,
                color: 'var(--text-secondary)',
                lineHeight: '1.4'
              }}>
                {snippet}
              </div>

              <div style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 10,
                fontFamily: 'monospace',
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                color: 'var(--text-secondary)',
              }}>{preset.command}</div>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => handleConnect(preset.id)}
                  disabled={connecting !== null || isActive}
                  style={{
                    background: isActive ? 'rgba(255, 255, 255, 0.1)' : 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                    border: 'none',
                    boxShadow: isActive ? 'none' : '0 2px 4px rgba(16, 185, 129, 0.3)',
                    fontWeight: 600,
                    cursor: isActive ? 'default' : 'pointer',
                    color: isActive ? 'var(--text-tertiary)' : '#fff',
                  }}
                >
                  {connecting === preset.id ? 'Enabling...' : isActive ? 'Enabled' : 'Enable Injection'}
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => copy(preset.id, preset.command)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {copied === preset.id ? 'Copied!' : 'Copy Command'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
