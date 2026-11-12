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
export interface PluginDesign { revision: string | null; css: string; components: string[] }
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

export interface SavedPageSummary { id: string; title: string; version: string }
export interface SavedPage extends SavedPageSummary { chunks: WorkspaceChunk[] }

export function listSavedPages(brainId: string, signal: AbortSignal) {
  return request<{ pages: SavedPageSummary[] }>(
    `/api/workspace/pages?brain=${encodeURIComponent(brainId)}`, { signal },
  )
}

export function readSavedPage(id: string, brainId: string, signal: AbortSignal) {
  return request<SavedPage>(
    `/api/workspace/pages/${encodeURIComponent(id)}?brain=${encodeURIComponent(brainId)}`, { signal },
  )
}

export function readWorkspaceComposition(plugin: string, signal: AbortSignal, brainId?: string) {
  const scope = brainId ? `?brain=${encodeURIComponent(brainId)}` : ''
  return request<{ chunks: WorkspaceChunk[]; version: string | null }>(
    `/api/ui-chunks/${encodeURIComponent(plugin)}/composition/current${scope}`, { signal },
  )
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await apiFetch(getApiBase() + path, { cache: 'no-store', ...options })
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

export function findWorkspaceChunks(
  surface: DrawerSide | 'page', query: string, signal?: AbortSignal, plugin?: string,
  brainId?: string, page?: { limit: number; offset: number },
) {
  const params = new URLSearchParams({ surface, q: query, limit: String(page?.limit ?? 24) })
  if (page) params.set('offset', String(page.offset))
  if (plugin) params.set('plugin', plugin)
  if (brainId) params.set('brain', brainId)
  return request<{ chunks: WorkspaceChunk[]; total: number }>(`/api/ui-chunks?${params}`, { signal })
}

export function readPluginDesign(plugin: string, revision: string | null, signal: AbortSignal, brainId?: string) {
  const params = new URLSearchParams()
  if (revision) params.set('revision', revision)
  if (brainId) params.set('brain', brainId)
  const query = params.size ? `?${params}` : ''
  return request<PluginDesign | { unchanged: true }>(
    `/api/ui-chunks/${encodeURIComponent(plugin)}/design/revision${query}`, { signal },
  )
}

export async function readWorkspaceChunk(key: string, surface: DrawerSide | 'page', signal?: AbortSignal, brainId?: string) {
  const [plugin, id] = key.split(':')
  const params = new URLSearchParams({ surface })
  if (brainId) params.set('brain', brainId)
  const data = await request<{ chunk: WorkspaceChunk & { html: string } }>(
    `/api/ui-chunks/${encodeURIComponent(plugin)}/${encodeURIComponent(id)}?${params}`, { signal },
  )
  return data.chunk
}
