// ─── Research domain ──────────────────────────────────────────────────────────

import { apiFetch, API_BASE } from './_base'
import type { ResearchItem } from './_base'

export interface ResearchQueueResponse {
  counts: { pending: number; in_progress: number; done: number; failed: number }
  total: number
  items: ResearchItem[]
}

export async function listResearch(status?: string): Promise<ResearchQueueResponse> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  const res = await apiFetch(`${API_BASE}/api/research?${params}`)
  if (!res.ok) throw new Error(`Research API error: ${res.status}`)
  return res.json()
}

export async function createResearch(topic: string, priority?: string, notes?: string): Promise<ResearchItem> {
  const res = await apiFetch(`${API_BASE}/api/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, priority, notes }),
  })
  if (!res.ok) throw new Error(`Research API error: ${res.status}`)
  return res.json()
}

export async function patchResearch(id: string, updates: Record<string, unknown>): Promise<unknown> {
  const res = await apiFetch(`${API_BASE}/api/research/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(`Research PATCH error: ${res.status}`)
  return res.json()
}

export async function deleteResearch(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/research/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Research DELETE error: ${res.status}`)
}
