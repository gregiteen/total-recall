import { apiFetch, getApiBase } from './_base'

export type DrawerSide = 'right' | 'bottom'
export interface PanelRef { plugin: string; element: string }
export interface DrawerConfig {
  html: string
  chunks: string[]
  panels: PanelRef[]
  shortcuts: { label: string; href: string }[]
}
export interface DrawerRevision { config: DrawerConfig; version: string | null }
export interface WorkspaceChunk {
  key: string
  plugin: string
  id: string
  title: string
  description: string
  surfaces: string[]
  panel?: string
  operations?: string[]
  data?: string[]
  sha256: string
}

export function suggestWorkspaceChunks(plugin: string, query: string, signal?: AbortSignal) {
  return request<{ chunks: WorkspaceChunk[]; selection: { source: 'lexical' | 'decision'; keys: string[]; reason?: string } }>(
    '/api/ui-chunks/suggest', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plugin, query }), signal,
    },
  )
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await apiFetch(getApiBase() + path, options)
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('This server does not support saved drawer layouts yet.')
  }
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || data.error || 'Could not load the workspace layout.')
  return data as T
}

export function readDrawer(side: DrawerSide, signal?: AbortSignal) {
  return request<DrawerRevision>(`/api/dashboard/drawers/${side}`, { signal })
}

export function saveDrawer(side: DrawerSide, revision: DrawerRevision) {
  return request<DrawerRevision>(`/api/dashboard/drawers/${side}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(revision),
  })
}

export function findWorkspaceChunks(surface: DrawerSide | 'page', query: string, signal?: AbortSignal, plugin?: string) {
  const params = new URLSearchParams({ surface, q: query, limit: '24' })
  if (plugin) params.set('plugin', plugin)
  return request<{ chunks: WorkspaceChunk[] }>(`/api/ui-chunks?${params}`, { signal })
}

export async function readWorkspaceChunk(key: string, surface: DrawerSide | 'page', signal?: AbortSignal) {
  const [plugin, id] = key.split(':')
  const data = await request<{ chunk: WorkspaceChunk & { html: string } }>(
    `/api/ui-chunks/${encodeURIComponent(plugin)}/${encodeURIComponent(id)}?surface=${surface}`, { signal },
  )
  return data.chunk
}
