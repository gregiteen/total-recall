// ─── Sessions domain ──────────────────────────────────────────────────────────

import { apiFetch, API_BASE } from './_base'

export interface SessionSummary {
  id: string
  filename: string
  title: string
  date: string
  source: string | null
  project: string | null
  count: number
  modified: string
  size: number
}

export async function fetchSessions(limit = 50, offset = 0): Promise<{ total: number; sessions: SessionSummary[] }> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  const res = await apiFetch(`${API_BASE}/api/sessions?${params}`)
  if (!res.ok) throw new Error(`Sessions API error: ${res.status}`)
  return res.json()
}

export async function deleteSession(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/sessions/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete session: ${res.status}`)
}
