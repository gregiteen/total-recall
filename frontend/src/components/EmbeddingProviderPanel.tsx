import { useCallback, useEffect, useState } from 'react'

import {
  fetchEmbeddingProvider,
  setEmbeddingModel,
  rediscoverEmbeddingProvider,
  type EmbeddingProviderStatus,
  type EmbeddingCandidate,
} from '../api/embeddings'

function formatSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  return `${Math.round(bytes / 1e6)} MB`
}

/**
 * Explain why a model cannot be used, rather than hiding it. An operator who
 * pulled the wrong model needs to see it listed with the reason attached.
 */
function incompatibilityReason(c: EmbeddingCandidate, dims: number): string {
  if (!c.embedding) return 'chat model — cannot embed'
  if (c.dims !== dims) return `${c.dims ?? '?'} dims — index needs ${dims}`
  return ''
}

export function EmbeddingProviderPanel() {
  const [status, setStatus] = useState<EmbeddingProviderStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setStatus(await fetchEmbeddingProvider())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onPin = useCallback(
    async (model: string | null) => {
      setBusy(true)
      try {
        await setEmbeddingModel(model)
        await load()
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
    },
    [load],
  )

  const onRediscover = useCallback(async () => {
    setBusy(true)
    try {
      await rediscoverEmbeddingProvider()
      await load()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [load])

  if (error && !status) {
    return (
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Embedding Provider</h3>
        <p role="alert">{error}</p>
      </div>
    )
  }

  if (!status) {
    return (
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Embedding Provider</h3>
        <p>Loading…</p>
      </div>
    )
  }

  const { local, fallbacks, dims } = status

  return (
    <div className="panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Embedding Provider</h3>
        <span
          data-testid="embed-availability"
          style={{ color: local.available ? 'var(--ok, #2ea043)' : 'var(--warn, #d29922)' }}
        >
          {local.available ? '● local' : '○ hosted fallback'}
        </span>
        <button type="button" onClick={onRediscover} disabled={busy}>
          Re-discover
        </button>
      </div>

      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', margin: '12px 0' }}>
        <dt>Endpoint</dt>
        <dd data-testid="embed-endpoint" style={{ margin: 0 }}>
          {local.endpoint ?? 'none reachable'}
        </dd>
        <dt>Model</dt>
        <dd data-testid="embed-selected" style={{ margin: 0 }}>
          {local.selected ?? '—'}
          {local.preferred ? ' (pinned)' : local.selected ? ' (auto)' : ''}
        </dd>
        <dt>Vector width</dt>
        <dd style={{ margin: 0 }}>{dims}</dd>
      </dl>

      {local.reason && <p role="status">{local.reason}</p>}
      {error && <p role="alert">{error}</p>}

      {local.candidates.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Model</th>
              <th style={{ textAlign: 'left' }}>Size</th>
              <th style={{ textAlign: 'left' }}>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {local.candidates.map((c) => {
              const reason = incompatibilityReason(c, dims)
              const isSelected = c.name === local.selected
              return (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td>{formatSize(c.size)}</td>
                  <td style={{ opacity: c.compatible ? 1 : 0.6 }}>
                    {c.compatible ? `${c.dims} dims` : reason}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {c.compatible && !isSelected && (
                      <button type="button" onClick={() => onPin(c.name)} disabled={busy}>
                        Use
                      </button>
                    )}
                    {isSelected && local.preferred && (
                      <button type="button" onClick={() => onPin(null)} disabled={busy}>
                        Unpin
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 12, fontSize: '0.9em', opacity: 0.8 }}>
        Fallback chain:{' '}
        {fallbacks.map((f, i) => (
          <span key={f.provider}>
            {i > 0 && ' → '}
            <span style={{ textDecoration: f.configured ? 'none' : 'line-through' }}>{f.provider}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
