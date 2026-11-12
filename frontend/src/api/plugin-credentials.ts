import { apiFetch, API_BASE } from './_base'
import type { PluginInfo } from './plugins'

export async function readSavedPluginCredentials() {
  const response = await apiFetch(`${API_BASE}/api/plugins/auth/secrets?catalog=0`)
  if (!response.ok) throw new Error('Could not check saved credentials.')
  const payload = await response.json()
  const rows = Array.isArray(payload) ? payload : payload?.keys
  if (!Array.isArray(rows)) throw new Error('Could not check saved credentials.')
  return new Set<string>(rows.filter(row => typeof row?.key === 'string' && row.set !== false).map(row => row.key))
}

export async function savePluginCredential(plugin: PluginInfo, key: string, value: string, brainId?: string) {
  const runtime = plugin.manifest?.runtime as { modules?: { credentials?: string } } | undefined
  const route = runtime?.modules?.credentials
    ? `/api/plugins/${encodeURIComponent(plugin.id)}/credentials${brainId ? `?brain=${encodeURIComponent(brainId)}` : ''}`
    : '/api/plugins/auth/secrets'
  const response = await apiFetch(API_BASE + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value, tags: [`plugin:${plugin.id}`] }),
  })
  if (!response.ok) throw new Error('Could not verify and save the credential.')
}
