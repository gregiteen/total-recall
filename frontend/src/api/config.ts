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
  if (!res.ok) throw new Error(`Config JSON API error: ${res.status}`)
  return res.json()
}

export async function saveConfigJson(config: ConfigJson): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/config-json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) throw new Error(`Config JSON API error: ${res.status}`)
}
