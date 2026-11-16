// ─── Config domain ────────────────────────────────────────────────────────────

import { apiFetch, API_BASE } from './_base'
import type { ConfigJson } from './_base'

export async function fetchConfig(name: string): Promise<string> {
  const res = await apiFetch(`${API_BASE}/api/config/${name}`)
  if (!res.ok) throw new Error(`Config API error: ${res.status}`)
  const data = await res.json()
  return data.content
}

export async function saveConfig(name: string, content: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/config/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error(`Config API error: ${res.status}`)
}

export async function fetchConfigJson(): Promise<ConfigJson> {
  const res = await apiFetch(`${API_BASE}/api/config-json`)
  if (!res.ok) {
    let detail = `Config JSON API error: ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) detail = body.error
    } catch { /* ignore */ }
    throw new Error(detail)
  }
  return res.json()
}

/** Name what a rejected save did and did not apply, so a partial result is never read as all-or-nothing. */
export function describeSaveFailure(status: number, body: unknown): string {
  const b = (body && typeof body === 'object' ? body : {}) as { error?: unknown; applied?: unknown; failed?: unknown; not_attempted?: unknown }
  let detail = typeof b.error === 'string' && b.error ? b.error : `Config JSON API error: ${status}`
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  const applied = list(b.applied)
  const notAttempted = list(b.not_attempted)
  if (Array.isArray(b.applied) || typeof b.failed === 'string') {
    detail += ` Applied: ${applied.length ? applied.join(', ') : 'nothing'}.`
    if (typeof b.failed === 'string') detail += ` Failed: ${b.failed}.`
    if (notAttempted.length) detail += ` Not attempted: ${notAttempted.join(', ')}.`
  }
  return detail
}

export async function saveConfigJson(config: ConfigJson): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/config-json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) {
    let body: unknown = null
    try { body = await res.json() } catch { /* ignore */ }
    throw new Error(describeSaveFailure(res.status, body))
  }
}
