import { useMemo, useState, useEffect } from 'react'
import {
  getApiBase,
  connectClient,
  fetchActiveIntegrations,
  fetchExtensionStatus,
  listApiKeys,
  issueApiKey,
  revokeApiKey,
  type ApiKey,
  type IssuedApiKey,
} from '../api'

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
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [keysLoading, setKeysLoading] = useState(false)
  const [createdToken, setCreatedToken] = useState<IssuedApiKey | null>(null)
  const [tokenName, setTokenName] = useState('')
  const [tokenScope, setTokenScope] = useState('*')
  const [isIssuingToken, setIsIssuingToken] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const baseUrl = useMemo(() => {
    const configured = getApiBase()
    if (configured) return configured.replace(/\/$/, '')
    return window.location.origin
  }, [])

  const loadKeys = () => {
    setKeysLoading(true)
    listApiKeys()
      .then(res => {
        setKeys(res.keys || [])
      })
      .catch(e => {
        console.error('Failed to load keys', e)
      })
      .finally(() => {
        setKeysLoading(false)
      })
  }

  useEffect(() => {
    let active = true

    loadKeys()

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

  const handleCreateToken = async (name: string, scopes: string[]) => {
    setIsIssuingToken(true)
    setMessage(null)
    try {
      const issued = await issueApiKey(name || 'Personal Access Token', scopes)
      setCreatedToken(issued)
      setMessage({ type: 'success', text: `Generated new token "${issued.name}". Copy it below.` })
      loadKeys()
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message || 'Failed to issue token.' })
    } finally {
      setIsIssuingToken(false)
    }
  }

  const handleRevokeToken = async (id: string) => {
    setRevokingId(id)
    try {
      await revokeApiKey(id)
      setMessage({ type: 'success', text: 'Token revoked successfully.' })
      loadKeys()
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message || 'Failed to revoke token.' })
    } finally {
      setRevokingId(null)
    }
  }

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
            Download the extension package with your active brain address and access token automatically baked inside. Zero manual token entry required.
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
            4. Click "Load unpacked" & select unzipped folder.{"\n"}
            ✓ Token and brain address are pre-configured automatically.
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 8, flexWrap: 'wrap' }}>
            <a
              href={`${baseUrl}/api/extension/download`}
              download
              className="btn btn-sm btn-primary"
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                border: 'none',
                boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)',
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 14px',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '12px'
              }}
            >
              ⬇ Download Pre-Configured Extension Zip
            </a>
            <button
              className="btn btn-sm"
              onClick={() => handleCreateToken('Chrome Extension', ['*'])}
              disabled={isIssuingToken}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border)',
                fontWeight: 500,
                cursor: isIssuingToken ? 'default' : 'pointer',
                color: 'var(--text-secondary)',
                fontSize: '12px'
              }}
            >
              {isIssuingToken ? 'Generating...' : '🔑 Generate Extension Token'}
            </button>
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

      {createdToken && (
        <div style={{
          marginTop: 24,
          marginBottom: 16,
          padding: 16,
          borderRadius: 10,
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          boxShadow: '0 4px 16px rgba(16, 185, 129, 0.1)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🔑</span>
              <strong style={{ color: '#34d399', fontSize: 15 }}>Token Issued: {createdToken.name}</strong>
            </div>
            <button
              onClick={() => setCreatedToken(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                fontSize: 16,
              }}
            >
              ✕
            </button>
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-secondary)' }}>
            Make sure to copy this token now. It will not be shown again. Paste this token into the Chrome extension settings or your client authorization headers.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              readOnly
              value={createdToken.token}
              style={{
                flex: 1,
                minWidth: 260,
                background: 'var(--bg-primary)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                borderRadius: 6,
                padding: '8px 12px',
                fontFamily: 'monospace',
                fontSize: 13,
                color: '#34d399',
              }}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              className="btn btn-sm btn-primary"
              onClick={() => copy('new-token', createdToken.token)}
              style={{
                background: '#10b981',
                border: 'none',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '8px 16px',
              }}
            >
              {copied === 'new-token' ? 'Copied!' : 'Copy Token'}
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 32, borderTop: '1px solid var(--border)', paddingTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>Personal Access Tokens &amp; API Keys</h2>
            <p style={{ margin: 0, color: 'var(--text-tertiary)', fontSize: 13 }}>
              Authenticate external applications, browser extensions, and IDE daemons with your Total Recall brain.
            </p>
          </div>
        </div>

        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 16,
          marginBottom: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          <h4 style={{ margin: 0, fontSize: 14 }}>Create New Access Token</h4>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Token name (e.g. Chrome Extension, Laptop, CI)"
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              style={{
                flex: '2 1 200px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '8px 12px',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            />
            <select
              value={tokenScope}
              onChange={(e) => setTokenScope(e.target.value)}
              style={{
                flex: '1 1 140px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '8px 12px',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            >
              <option value="*">Full Access (*)</option>
              <option value="memory:read,memory:write">Memory Read/Write</option>
              <option value="memory:read">Memory Read Only</option>
            </select>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                handleCreateToken(tokenName || 'Personal Access Token', tokenScope.split(','))
                setTokenName('')
              }}
              disabled={isIssuingToken}
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                border: 'none',
                fontWeight: 600,
                cursor: isIssuingToken ? 'default' : 'pointer',
                padding: '8px 16px',
                color: '#fff',
              }}
            >
              {isIssuingToken ? 'Generating...' : 'Generate Token'}
            </button>
          </div>
        </div>

        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255, 255, 255, 0.02)' }}>
                <th style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Name</th>
                <th style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Token Prefix</th>
                <th style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Scopes</th>
                <th style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Created</th>
                <th style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Status</th>
                <th style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontWeight: 500, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keysLoading && (
                <tr>
                  <td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                    Loading tokens...
                  </td>
                </tr>
              )}
              {!keysLoading && keys.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)' }}>
                    No access tokens generated yet.
                  </td>
                </tr>
              )}
              {!keysLoading && keys.map(k => {
                const prefix = k.token_prefix || k.token_preview || 'tr_...'
                const isRevoked = k.revoked
                return (
                  <tr key={k.id} style={{ borderBottom: '1px solid var(--border)', opacity: isRevoked ? 0.5 : 1 }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>
                      {k.name}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                      {prefix}...
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontSize: 12 }}>
                      {Array.isArray(k.scopes) ? k.scopes.join(', ') : '*'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontSize: 12 }}>
                      {k.created_at ? new Date(k.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: isRevoked ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                        color: isRevoked ? '#f87171' : '#34d399',
                        border: isRevoked ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)'
                      }}>
                        {isRevoked ? 'Revoked' : 'Active'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      {!isRevoked && (
                        <button
                          className="btn btn-sm"
                          onClick={() => handleRevokeToken(k.id)}
                          disabled={revokingId === k.id}
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            color: '#f87171',
                            cursor: 'pointer',
                            fontSize: 11,
                            padding: '4px 8px'
                          }}
                        >
                          {revokingId === k.id ? 'Revoking...' : 'Revoke'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
