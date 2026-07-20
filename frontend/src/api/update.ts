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
  const data = await res.json()
  // Normalize snake_case API fields for the Settings UI
  const currentVersion = data.currentVersion ?? data.current ?? ''
  const latestVersion = data.latestVersion ?? data.latest ?? ''
  // Prefer host package comparison; fall back to API flag (includes consumers behind).
  const hostBehind =
    Boolean(latestVersion && currentVersion && latestVersion !== currentVersion)
  return {
    currentVersion,
    latestVersion,
    updateAvailable: hostBehind || Boolean(data.updateAvailable ?? data.update_available),
  }
}

export async function runUpdate(): Promise<{
  success: boolean
  message: string
  summary?: {
    latest?: string
    updated?: number
    failed?: number
    up_to_date?: number
    results?: { name: string; status: string; error?: string | null }[]
  }
}> {
  const res = await apiFetch(`${API_BASE}/api/update/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: true }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || data.message || `Run update API error: ${res.status}`)
  }
  // API historically omitted success — treat finished-with-0-failures as success
  const failed = Number(data.summary?.failed ?? 0)
  const success =
    typeof data.success === 'boolean' ? data.success : failed === 0 && data.summary?.skipped !== true
  return {
    success,
    message: data.message || (success ? 'Package auto-update finished' : 'Package auto-update failed'),
    summary: data.summary,
  }
}
