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
  return {
    currentVersion,
    latestVersion,
    updateAvailable: Boolean(data.updateAvailable ?? data.update_available),
  }
}

export interface UpdateRestartInfo {
  /** true when the update replaced the code this server is running */
  required: boolean
  /** true when a restart into that code has been scheduled */
  scheduled: boolean
  reason: string
}

export async function runUpdate(): Promise<{
  success: boolean
  message: string
  restart?: UpdateRestartInfo
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
    restart: data.restart
      ? {
          required: Boolean(data.restart.required),
          scheduled: Boolean(data.restart.scheduled),
          reason: String(data.restart.reason ?? ''),
        }
      : undefined,
    summary: data.summary,
  }
}
