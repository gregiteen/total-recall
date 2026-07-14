// ─── Docs domain ──────────────────────────────────────────────────────────────

import { apiFetch, API_BASE } from './_base'

// ─── Design Docs ──────────────────────────────────────────────────────────────

export async function fetchDesignDocs(): Promise<Array<{ name: string; path: string; size: number; modified: string; category: string }>> {
  const res = await apiFetch(`${API_BASE}/api/files?path=docs`)
  if (!res.ok) throw new Error(`Design docs error: ${res.status}`)
  return res.json()
}

export async function fetchDesignDocContent(path: string): Promise<{ content: string }> {
  const res = await apiFetch(`${API_BASE}/api/files?path=${encodeURIComponent(path)}&content=true`)
  if (!res.ok) throw new Error(`Design doc content error: ${res.status}`)
  return res.json()
}

// ─── Vault Documents ──────────────────────────────────────────────────────────

export interface VaultDocument extends Record<string, unknown> {
  id?: string
  type?: string
  name?: string
  path: string
  status?: string
  portability?: string
  updatedAt?: string | number
}

export interface DocsResponse {
  docs: VaultDocument[]
}

export interface DocumentResponse {
  raw: string
}

export interface SavedView {
  id: string
  name: string
  filters: Record<string, string>
}

export async function fetchDocs(brain?: string, params?: Record<string, string>): Promise<DocsResponse> {
  const p = new URLSearchParams()
  if (brain) p.set('brain', brain)
  if (params) {
    for (const [k, v] of Object.entries(params)) if (v) p.set(k, v)
  }
  const res = await apiFetch(`/api/docs?${p.toString()}`)
  if (!res.ok) throw new Error('Failed to fetch docs')
  return res.json()
}

export async function readDoc(path: string, brain?: string): Promise<DocumentResponse> {
  const p = new URLSearchParams({ path })
  if (brain) p.set('brain', brain)
  const res = await apiFetch(`/api/docs/read?${p.toString()}`)
  if (!res.ok) throw new Error('Failed to read doc')
  return res.json()
}

export async function createDoc(path: string, content: string, brain?: string) {
  const res = await apiFetch('/api/docs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content, brainId: brain })
  })
  if (!res.ok) throw new Error('Failed to create doc')
  return res.json()
}

export async function updateDoc(path: string, content: string, brain?: string) {
  const res = await apiFetch('/api/docs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content, brainId: brain })
  })
  if (!res.ok) throw new Error('Failed to update doc')
  return res.json()
}

export async function deleteDoc(path: string, brain?: string) {
  const p = new URLSearchParams({ path })
  if (brain) p.set('brain', brain)
  const res = await apiFetch(`/api/docs?${p.toString()}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete doc')
  return res.json()
}

export async function fetchViews(): Promise<SavedView[]> {
  const res = await apiFetch('/api/views')
  if (!res.ok) throw new Error('Failed to fetch views')
  return res.json()
}

export async function createView(name: string, filters: Record<string, string>) {
  const res = await apiFetch('/api/views', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, filters })
  })
  if (!res.ok) throw new Error('Failed to create view')
  return res.json()
}

export async function deleteView(id: string) {
  const res = await apiFetch(`/api/views/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete view')
  return res.json()
}

// ─── Instructions ─────────────────────────────────────────────────────────────

export async function fetchInstructions(): Promise<{ surfaces: Array<{ name: string; filename: string; size: number; lastCompiled: string; active: boolean }>; lastCompileTimestamp: string; totalNodes: number }> {
  const res = await apiFetch(`${API_BASE}/api/dashboard/instructions`)
  if (!res.ok) throw new Error(`Instructions API error: ${res.status}`)
  return res.json()
}

export async function fetchInstructionContent(name: string): Promise<{ name: string; content: string }> {
  const res = await apiFetch(`${API_BASE}/api/ssss/instructions?surface=${encodeURIComponent(name)}`)
  if (!res.ok) throw new Error(`Instruction content error: ${res.status}`)
  return res.json()
}

// ─── Help ──────────────────────────────────────────────────────────────────────

export interface HelpTopic {
  id: string
  title: string
  description: string
}

export async function fetchHelpTopics(): Promise<{ topics: HelpTopic[] }> {
  const res = await apiFetch(`${API_BASE}/api/help`)
  if (!res.ok) throw new Error('Failed to load help topics')
  return res.json()
}

export async function fetchHelpContent(topicId: string): Promise<{ topic: string; content: string }> {
  const res = await apiFetch(`${API_BASE}/api/help?topic=${encodeURIComponent(topicId)}`)
  if (!res.ok) throw new Error('Failed to load help content')
  return res.json()
}
