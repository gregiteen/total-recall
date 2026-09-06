// ─── Plugins domain ───────────────────────────────────────────────────────────

import { apiFetch, API_BASE } from "./_base"

export interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  valid: boolean
  errors: string[]
  dir: string
  rating: number
  reviewCount: number
  installCount: string
  userRating?: number | null
  userReview?: string | null
  verified?: boolean
  categories: Array<{ name: string; description?: string }>
  tasks: Array<{ intent: string; schedule: string }>
  openwiki_hubs: Array<{ title: string; path: string }>
  tools: Array<{ name: string; description?: string }>
  cli?: { command: string; handler: string } | null
  manifest?: Record<string, unknown>
}

export interface CatalogPlugin {
  id: string
  name: string
  version: string
  description: string
  tags: string[]
  author: string
  sourceUrl: string
  rating: number
  reviewCount: number
  installCount: string
  userRating?: number | null
  verified?: boolean
  isInstalled: boolean
}

export interface PluginsResponse {
  success: boolean
  count: number
  plugins: PluginInfo[]
}

export interface CatalogResponse {
  success: boolean
  catalog: CatalogPlugin[]
}

export async function fetchPlugins(): Promise<PluginInfo[]> {
  try {
    const res = await apiFetch(`${API_BASE}/api/plugins`)
    if (!res.ok) return []
    const data: PluginsResponse = await res.json()
    return Array.isArray(data.plugins) ? data.plugins : []
  } catch {
    return []
  }
}

export async function fetchPlugin(id: string): Promise<PluginInfo | null> {
  try {
    const res = await apiFetch(`${API_BASE}/api/plugins/${encodeURIComponent(id)}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.plugin || null
  } catch {
    return null
  }
}

export async function fetchPluginCatalog(): Promise<CatalogPlugin[]> {
  try {
    const res = await apiFetch(`${API_BASE}/api/plugins/catalog`)
    if (!res.ok) return []
    const data: CatalogResponse = await res.json()
    return Array.isArray(data.catalog) ? data.catalog : []
  } catch {
    return []
  }
}

export async function installPlugin(options: { source: string; link?: boolean; global?: boolean }): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await apiFetch(`${API_BASE}/api/plugins/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options)
    })
    const data = await res.json()
    if (!res.ok) {
      return { success: false, error: data.error || data.message || "Failed to install plugin" }
    }
    return { success: true, message: data.message }
  } catch (err: any) {
    return { success: false, error: err.message || "Network error" }
  }
}

export async function removePlugin(id: string, global = false): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await apiFetch(`${API_BASE}/api/plugins/${encodeURIComponent(id)}?global=${global ? "true" : "false"}`, {
      method: "DELETE"
    })
    const data = await res.json()
    if (!res.ok) {
      return { success: false, error: data.error || data.message || "Failed to remove plugin" }
    }
    return { success: true, message: data.message }
  } catch (err: any) {
    return { success: false, error: err.message || "Network error" }
  }
}

export async function ratePlugin(id: string, rating: number, review?: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await apiFetch(`${API_BASE}/api/plugins/${encodeURIComponent(id)}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, review })
    })
    const data = await res.json()
    if (!res.ok) {
      return { success: false, error: data.error || data.message || "Failed to submit rating" }
    }
    return { success: true, message: data.message }
  } catch (err: any) {
    return { success: false, error: err.message || "Network error" }
  }
}
