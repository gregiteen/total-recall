import { useState, useEffect, useCallback } from 'react'
import { listApiKeys, issueApiKey, revokeApiKey } from '../api'
import type { ApiKey, IssuedApiKey } from '../api'

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newKeyName, setNewKeyName] = useState('')
  const [issuing, setIssuing] = useState(false)
  const [newlyIssued, setNewlyIssued] = useState<IssuedApiKey | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    setError(null)
    try {
      setKeys(await listApiKeys())
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(false) }, [load])

  const handleIssue = async () => {
    if (!newKeyName.trim()) return
    setIssuing(true)
    setError(null)
    try {
      const key = await issueApiKey(newKeyName.trim())
      setNewlyIssued(key)
      setNewKeyName('')
      await load(true)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setIssuing(false)
    }
  }

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Revoke key "${name}"? This cannot be undone.`)) return
    try {
      await revokeApiKey(id)
      await load(true)
    } catch (e: unknown) {
      setError((e as Error).message)
    }
  }

  const copyToken = () => {
    if (!newlyIssued) return
    navigator.clipboard.writeText(newlyIssued.token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const activeKeys = keys.filter(k => !k.revoked)
  const revokedKeys = keys.filter(k => k.revoked)

  return (
    <div className="page">
      <div className="page-header">
        <h1>API Keys</h1>
        <p>Issue and manage Personal Access Tokens to use Total Recall anywhere</p>
      </div>

      {/* New token banner — shown once after issuing */}
      {newlyIssued && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.05))',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          borderRadius: 12,
          padding: '20px 24px',
          marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 18 }}>🔑</span>
            <strong style={{ color: 'var(--accent)' }}>New key issued — copy it now! It won't be shown again.</strong>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'var(--bg-primary)', borderRadius: 8, padding: '10px 16px',
            border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 13,
            wordBreak: 'break-all',
          }}>
            <span style={{ flex: 1 }}>{newlyIssued.token}</span>
            <button className="btn btn-sm btn-primary" onClick={copyToken} style={{ flexShrink: 0, minWidth: 70 }}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
            Usage: <code>Authorization: Bearer {newlyIssued.token.slice(0, 12)}…</code>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setNewlyIssued(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Issue new key */}
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 12,
        border: '1px solid var(--border)', padding: '20px 24px', marginBottom: 24,
      }}>
        <h3 style={{ margin: '0 0 14px' }}>Issue New Key</h3>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            id="new-api-key-name"
            type="text"
            placeholder="e.g. Cursor IDE, iOS Shortcut, CI Pipeline…"
            value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleIssue() }}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 8, fontSize: 14,
              background: 'var(--bg-primary)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', outline: 'none',
            }}
          />
          <button
            className="btn btn-primary"
            onClick={handleIssue}
            disabled={issuing || !newKeyName.trim()}
            style={{ minWidth: 120 }}
          >
            {issuing ? 'Issuing…' : '+ Issue Key'}
          </button>
        </div>
      </div>

      {error && <div className="badge badge-warning" style={{ marginBottom: 16, alignSelf: 'flex-start' }}>⚠️ {error}</div>}

      {/* Active keys table */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ marginBottom: 12 }}>Active Keys ({activeKeys.length})</h3>
        {loading ? (
          <div style={{ color: 'var(--text-tertiary)', padding: 20 }}>Loading…</div>
        ) : activeKeys.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)',
            border: '1px dashed var(--border)', borderRadius: 12,
          }}>
            No active keys yet. Issue one above to connect Total Recall to any tool.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Name</th>
                  <th style={{ padding: '8px 12px' }}>Token</th>
                  <th style={{ padding: '8px 12px' }}>Requests</th>
                  <th style={{ padding: '8px 12px' }}>Last Used</th>
                  <th style={{ padding: '8px 12px' }}>Created</th>
                  <th style={{ padding: '8px 12px' }}></th>
                </tr>
              </thead>
              <tbody>
                {activeKeys.map(k => (
                  <tr key={k.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{k.name}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{k.token_preview}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span className="badge badge-accent">{k.hit_count.toLocaleString()}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--error, #ef4444)', borderColor: 'var(--error, #ef4444)' }}
                        onClick={() => handleRevoke(k.id, k.name)}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Revoked keys (collapsed) */}
      {revokedKeys.length > 0 && (
        <details style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
          <summary style={{ cursor: 'pointer', marginBottom: 8 }}>
            Revoked Keys ({revokedKeys.length})
          </summary>
          {revokedKeys.map(k => (
            <div key={k.id} style={{
              display: 'flex', gap: 16, padding: '8px 12px',
              borderBottom: '1px solid var(--border)', opacity: 0.5,
            }}>
              <span style={{ flex: 1, textDecoration: 'line-through' }}>{k.name}</span>
              <span style={{ fontFamily: 'monospace' }}>{k.token_preview}</span>
              <span>{k.hit_count} requests</span>
            </div>
          ))}
        </details>
      )}
    </div>
  )
}
