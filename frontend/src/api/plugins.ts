// ─── Plugins domain ───────────────────────────────────────────────────────────
//
// Every field here is something the node can verify: the manifest, where the
// plugin came from, its content hash, whether it is shared, and — for peers —
// whether that peer answered. There are no ratings, reviews or install counts.

import { apiFetch, API_BASE } from "./_base"

export type PluginSourceKind = "bundled" | "public" | "peer" | "git" | "local" | "link"

export interface PluginSource {
  kind: PluginSourceKind
  ref: string
  peer_hostname?: string | null
}

export interface PluginTask {
  intent: string
  schedule: string
  command: string
  last_run: string | null
}

export interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  author: string | null
  license: string | null
  homepage: string | null
  use_cases: string[]
  valid: boolean
  errors: string[]
  scope: "project" | "global"
  linked: boolean
  dir: string
  shared: boolean
  mesh_shared: boolean
  share_url: string | null
  source: PluginSource
  installed_at: string | null
  sha256: string | null
  installed_sha256: string | null
  modified_since_install: boolean
  file_count: number | null
  size_bytes: number | null
  categories: Array<{ name: string; description?: string; node_type?: string }>
  tasks: PluginTask[]
  openwiki_hubs: Array<{ title?: string; path: string }>
  cli: { command: string | null; subcommands: Array<{ name: string; description?: string }> } | null
  has_generator: boolean
  manifest?: Record<string, unknown>
}

export interface BundledPlugin {
  id: string
  name: string
  version: string
  description: string
  use_cases: string[]
  categories: Array<{ name: string; description?: string }>
  tasks: Array<{ intent: string; schedule: string; command: string }>
  cli: { command: string; subcommands: Array<{ name: string; description?: string }> } | null
  installed: boolean
}

export interface PeerPlugin {
  id: string
  name: string
  version: string
  description: string
  use_cases: string[]
  sha256: string
  file_count: number
  size_bytes: number
  installed: boolean
  same_as_installed: boolean
}

export type PeerStatus = "ok" | "offline" | "unreachable" | "not_configured" | "unsupported" | "error"

export interface PeerNode {
  hostname: string
  ip: string
  online: boolean
  os: string | null
  status: PeerStatus
  error?: string
  plugins: PeerPlugin[]
}

export interface PeersResponse {
  mesh: { available: boolean; configured: boolean }
  peers: PeerNode[]
}

type Result = { success: boolean; message?: string; error?: string; plugin?: PluginInfo }

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

async function post(url: string, body: unknown, method = "POST"): Promise<Result & Record<string, any>> {
  try {
    const res = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const data = await readJson(res)
    if (!res.ok) return { success: false, error: data.error || data.message || `Request failed (${res.status})` }
    return { success: true, ...data }
  } catch (err: any) {
    return { success: false, error: err?.message || "Network error" }
  }
}

export async function fetchPlugins(): Promise<PluginInfo[]> {
  try {
    const res = await apiFetch(`${API_BASE}/api/plugins`)
    if (!res.ok) return []
    const data = await readJson(res)
    return Array.isArray(data.plugins) ? data.plugins : []
  } catch {
    return []
  }
}

export async function fetchPlugin(id: string): Promise<PluginInfo | null> {
  try {
    const res = await apiFetch(`${API_BASE}/api/plugins/${encodeURIComponent(id)}`)
    if (!res.ok) return null
    const data = await readJson(res)
    return data.plugin || null
  } catch {
    return null
  }
}

export async function fetchBundledPlugins(): Promise<BundledPlugin[]> {
  try {
    const res = await apiFetch(`${API_BASE}/api/plugins/available`)
    if (!res.ok) return []
    const data = await readJson(res)
    return Array.isArray(data.plugins) ? data.plugins : []
  } catch {
    return []
  }
}

/** Asks every mesh peer live; `null` means this node could not ask at all. */
export async function fetchPeerPlugins(): Promise<PeersResponse | null> {
  try {
    const res = await apiFetch(`${API_BASE}/api/plugins/peers`)
    if (!res.ok) return null
    const data = await readJson(res)
    return { mesh: data.mesh || { available: false, configured: false }, peers: Array.isArray(data.peers) ? data.peers : [] }
  } catch {
    return null
  }
}

export function installPlugin(options: { source: string; link?: boolean; global?: boolean }): Promise<Result> {
  return post(`${API_BASE}/api/plugins/install`, options)
}

export function removePlugin(id: string, global = false): Promise<Result> {
  return post(`${API_BASE}/api/plugins/${encodeURIComponent(id)}${global ? "?global=true" : ""}`, undefined, "DELETE")
}

export function setPluginShared(id: string, shared: boolean): Promise<Result> {
  return post(`${API_BASE}/api/plugins/${encodeURIComponent(id)}/share`, { shared })
}

export async function runPluginCommand(
  id: string,
  subcommand = "",
  args: string[] = []
): Promise<{ success: boolean; output?: string; error?: string; exitCode?: number | null; timedOut?: boolean }> {
  const res = await post(`${API_BASE}/api/plugins/${encodeURIComponent(id)}/run`, { subcommand, args })
  if (res.error) return { success: false, error: res.error }
  return { success: !!res.ok, output: res.output || "", exitCode: res.exitCode, timedOut: res.timedOut }
}

export async function fetchPluginReadme(id: string): Promise<string> {
  try {
    const res = await apiFetch(`${API_BASE}/api/plugins/${encodeURIComponent(id)}/readme`)
    if (!res.ok) return ""
    const data = await readJson(res)
    return data.readme || ""
  } catch {
    return ""
  }
}
