import { useMemo, useState, useEffect } from 'react'
import { getApiBase, listApiKeys, connectClient, fetchActiveIntegrations, fetchExtensionStatus } from '../api'
import type { ApiKey } from '../api'

type Preset = {
  id: string
  name: string
  surface: string
  scopes: string
  command: string
  snippet: (baseUrl: string) => string
}

const PRESETS: Preset[] = [
  {
    id: 'antigravity',
    name: 'Antigravity',
    surface: 'AGENTS.md',
    scopes: 'ssss:read, memory:read',
    command: 'npx total-recall connect antigravity',
    snippet: baseUrl => `Read AGENTS.md from the repo root.\nDiscovery: ${baseUrl}/.well-known/total-recall.json`
  },
  {
    id: 'cursor',
    name: 'Cursor',
    surface: '.cursor/rules/total-recall.mdc',
    scopes: 'ssss:read, memory:read',
    command: 'npx total-recall connect cursor',
    snippet: baseUrl => `Discovery: ${baseUrl}/.well-known/total-recall.json`
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    surface: 'CLAUDE.md',
    scopes: 'ssss:read, memory:read',
    command: 'npx total-recall connect claude-code',
    snippet: () => `Read CLAUDE.md from the repo root.`
  },
  {
    id: 'codex',
    name: 'Codex',
    surface: 'AGENTS.md',
    scopes: 'ssss:read, memory:read',
    command: 'npx total-recall connect codex',
    snippet: baseUrl => `Read AGENTS.md from the repo root.\nDiscovery: ${baseUrl}/.well-known/total-recall.json`
  },
  {
    id: 'http-api',
    name: 'HTTP host app',
    surface: 'OpenAI-compatible provider',
    scopes: 'models:read, chat:write, ssss:read',
    command: 'npx total-recall connect http-api --brain <brain-url>',
    snippet: baseUrl => `Base URL: ${baseUrl}/v1\nModel: total-recall/gemma4\nModels: ${baseUrl}/v1/models`
  },
  {
    id: 'generic',
    name: 'Generic Client',
    surface: 'REST + OpenAI-compatible API',
    scopes: 'models:read, chat:write, memory:read',
    command: 'npx total-recall connect generic --brain <brain-url>',
    snippet: baseUrl => `POST ${baseUrl}/v1/chat/completions\nGET ${baseUrl}/api/ssss\nAuthorization: Bearer <PAT>`
  }
]

export default function IntegrationsPage() {
  const [copied, setCopied] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [activeIdes, setActiveIdes] = useState<string[]>([])
  const [extStatus, setExtStatus] = useState<{ available: boolean; connected: boolean } | null>(null)

  const baseUrl = useMemo(() => {
    const configured = getApiBase()
    if (configured) return configured.replace(/\/$/, '')
    return window.location.origin
  }, [])

  useEffect(() => {
    let active = true
    listApiKeys()
      .then(res => {
        if (active) setKeys(res.keys || [])
      })
      .catch(e => {
        if (active) setMessage({ type: 'error', text: `Failed to list API keys: ${(e as Error).message || 'Unknown error'}` })
      })

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
  }, [])

  const filteredPresets = useMemo(() => {
    if (activeIdes.length === 0) return PRESETS
    return PRESETS.filter(preset => {
      if (['http-api', 'generic'].includes(preset.id)) {
        return true
      }
      return activeIdes.includes(preset.id)
    })
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
        setMessage({ type: 'success', text: `Successfully connected ${presetId}! All config files have been automatically updated.` })
        // Refresh keys to show registered/connected status badge
        const res = await listApiKeys()
        setKeys(res.keys || [])
      } else {
        setMessage({ type: 'error', text: `Failed to connect: ${result.message}` })
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
        <p>Connect IDEs, UltraChat, and scripts to this Total Recall brain</p>
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

      {/* Explanatory Banner */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.4)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 20,
        marginBottom: 22,
        color: 'var(--text-secondary)',
        fontSize: 14,
        lineHeight: '1.5',
      }}>
        <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>💡 How Integrations Work</strong>
        Total Recall acts as a secure, local-first semantic memory hub. To give your development environments (Cursor, Claude Code, etc.) access to your memory vault and instruction layers, they communicate as API clients using secure tokens.
        <br />
        <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          The status badges below dynamically inspect whether your workspace has successfully registered its connection token and communicated with your active brain.
        </span>
      </div>

      <div style={{
        border: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        borderRadius: 12,
        padding: 18,
        marginBottom: 22,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
        fontSize: 13,
      }}>
        <div>
          <div style={{ color: 'var(--text-tertiary)', marginBottom: 4 }}>Discovery</div>
          <code>{baseUrl}/.well-known/total-recall.json</code>
        </div>
        <div>
          <div style={{ color: 'var(--text-tertiary)', marginBottom: 4 }}>Chat API</div>
          <code>{baseUrl}/v1/chat/completions</code>
        </div>
        <div>
          <div style={{ color: 'var(--text-tertiary)', marginBottom: 4 }}>Model</div>
          <code>total-recall/gemma4</code>
        </div>
      </div>

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

          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Scopes utilized: <code>chat:write, memory:read, memory:write</code>
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
          
          // Match keys by name (e.g. "Cursor Link", "Claude Code Link", "Codex Link")
          // Guard: some legacy rows stored a non-string name object
          const matchingKey = keys.find(k => {
            const rawName = k?.name
            const name =
              typeof rawName === 'string'
                ? rawName
                : rawName && typeof rawName === 'object' && typeof (rawName as { name?: unknown }).name === 'string'
                  ? String((rawName as { name: string }).name)
                  : ''
            if (!name || k.revoked) return false
            const n = name.toLowerCase()
            if (preset.id === 'cursor') return n.includes('cursor')
            if (preset.id === 'claude-code') return n.includes('claude')
            if (preset.id === 'codex') return n.includes('codex') || n.includes('agents')
            if (preset.id === 'antigravity') return n.includes('antigravity')
            if (preset.id === 'grok') return n.includes('grok') || n.includes('xai')
            if (preset.id === 'http-api') return n.includes('http') || n.includes('host')
            return false
          })

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
              Not Connected
            </span>
          )

          if (matchingKey) {
            if (matchingKey.hit_count > 0 || preset.id === 'antigravity') {
              const lastUsedStr = matchingKey.last_used_at 
                ? ` (Active ${new Date(matchingKey.last_used_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
                : preset.id === 'antigravity'
                  ? ' (Active Now)'
                  : ''
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
                  Connected{lastUsedStr}
                </span>
              )
            } else {
              statusBadge = (
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
                  Registered (Pending Activity)
                </span>
              )
            }
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
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{preset.surface}</div>
                </div>
                {statusBadge}
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Recommended scopes: <code>{preset.scopes}</code>
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

              <div style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 10,
                fontFamily: 'monospace',
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                color: 'var(--text-secondary)',
              }}>{snippet}</div>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => handleConnect(preset.id)}
                  disabled={connecting !== null}
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                    border: 'none',
                    boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {connecting === preset.id ? 'Connecting...' : 'Connect'}
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => copy(preset.id, `${preset.command}\n\n${snippet}`)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {copied === preset.id ? 'Copied!' : 'Copy Config'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
