// ─── Update domain ────────────────────────────────────────────────────────────

import { apiFetch, API_BASE } from './_base'

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
}

export async function checkUpdate(): Promise<UpdateCheckResult> {
  const res = await apiFetch(`${API_BASE}/api/update/check`)
  if (!res.ok) throw new Error(`Check update API error: ${res.status}`)
  return res.json()
}

export async function runUpdate(): Promise<{ success: boolean; message: string }> {
  const res = await apiFetch(`${API_BASE}/api/update/run`, { method: 'POST' })
  if (!res.ok) throw new Error(`Run update API error: ${res.status}`)
  return res.json()
}
