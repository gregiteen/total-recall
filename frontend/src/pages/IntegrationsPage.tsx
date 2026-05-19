import { useMemo, useState } from 'react'
import { getApiBase } from '../api'

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
    id: 'cursor',
    name: 'Cursor',
    surface: '.cursor/rules/total-recall.mdc',
    scopes: 'ssss:read, memory:read, mcp:use',
    command: 'npx total-recall connect cursor',
    snippet: baseUrl => `Discovery: ${baseUrl}/.well-known/total-recall.json\nMCP: ${baseUrl}/mcp`
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    surface: 'CLAUDE.md',
    scopes: 'ssss:read, memory:read, mcp:use',
    command: 'npx total-recall connect claude-code',
    snippet: baseUrl => `Read CLAUDE.md from the repo root.\nMCP: ${baseUrl}/mcp`
  },
  {
    id: 'codex',
    name: 'Codex',
    surface: 'AGENTS.md',
    scopes: 'ssss:read, memory:read, mcp:use',
    command: 'npx total-recall connect codex',
    snippet: baseUrl => `Read AGENTS.md from the repo root.\nDiscovery: ${baseUrl}/.well-known/total-recall.json`
  },
  {
    id: 'ultrachat',
    name: 'UltraChat',
    surface: 'OpenAI-compatible provider',
    scopes: 'models:read, chat:write, ssss:read',
    command: 'npx total-recall connect ultrachat --brain <brain-url>',
    snippet: baseUrl => `Base URL: ${baseUrl}/v1\nModel: total-recall/gemma4\nModels: ${baseUrl}/v1/models`
  },
  {
    id: 'mcp',
    name: 'MCP Client',
    surface: 'Streamable HTTP MCP',
    scopes: 'mcp:use, ssss:read, memory:read',
    command: 'npx total-recall connect mcp --brain <brain-url>',
    snippet: baseUrl => `URL: ${baseUrl}/mcp\nHeader: Authorization: Bearer <PAT>`
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
  const baseUrl = useMemo(() => {
    const configured = getApiBase()
    if (configured) return configured.replace(/\/$/, '')
    return window.location.origin
  }, [])

  const copy = async (id: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(id)
    setTimeout(() => setCopied(null), 1800)
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Integrations</h1>
        <p>Connect IDEs, UltraChat, MCP clients, and scripts to this Total Recall brain</p>
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
        {PRESETS.map(preset => {
          const snippet = preset.snippet(baseUrl)
          return (
            <div key={preset.id} style={{
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              borderRadius: 12,
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              <div>
                <h3 style={{ margin: '0 0 4px' }}>{preset.name}</h3>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{preset.surface}</div>
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

              <button
                className="btn btn-sm btn-primary"
                onClick={() => copy(preset.id, `${preset.command}\n\n${snippet}`)}
                style={{ alignSelf: 'flex-start' }}
              >
                {copied === preset.id ? 'Copied' : 'Copy Setup'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
