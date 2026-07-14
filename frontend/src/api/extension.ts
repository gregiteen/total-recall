// ─── Extension domain ─────────────────────────────────────────────────────────

import { apiFetch, API_BASE } from './_base'

export async function fetchExtensionStatus(): Promise<{ available: boolean; connected: boolean }> {
  const res = await apiFetch(`${API_BASE}/api/extension/status`)
  if (!res.ok) return { available: false, connected: false }
  return res.json()
}
