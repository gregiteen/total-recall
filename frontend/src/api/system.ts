// ─── System domain ────────────────────────────────────────────────────────────

import { apiFetch, API_BASE } from './_base'
import type { HealthData, UsageData } from './_base'
import type { Task, FileNode } from '../types'

export async function fetchHealth(): Promise<HealthData> {
  const res = await apiFetch(API_BASE + '/health')
  if (!res.ok) throw new Error(`Health API error: ${res.status}`)
  return res.json()
}

export async function fetchUsageStats(): Promise<UsageData> {
  const res = await apiFetch(`${API_BASE}/api/usage`)
  if (!res.ok) throw new Error(`Usage API error: ${res.status}`)
  return res.json()
}

/** One provider's reported spend, or the reason we could not read it. */
export interface ProviderUsageEntry {
  label: string
  /** `ok` carries numbers; every other state carries a `reason` instead. */
  state: 'ok' | 'no_key' | 'needs_admin_key' | 'unsupported' | 'error'
  reason?: string
  secret_name?: string
  total_cost?: number
  currency?: string
  balance?: number
  /** True when the figure is lifetime-to-date rather than the requested window. */
  lifetime?: boolean
}

export interface ProviderUsage {
  fetched_at: string
  window_days: number
  from_cache?: boolean
  providers: Record<string, ProviderUsageEntry>
}

/**
 * Spend as the providers report it, rather than estimated from local token counts.
 * Served from an hourly cache unless `refresh` is set.
 */
export async function fetchProviderUsage(refresh = false): Promise<ProviderUsage> {
  const res = await apiFetch(`${API_BASE}/api/usage/providers${refresh ? '?refresh=1' : ''}`)
  if (!res.ok) throw new Error(`Provider usage API error: ${res.status}`)
  return res.json()
}

export async function fetchLogs(type: 'server' | 'daemon'): Promise<{ content: string }> {
  const res = await apiFetch(`${API_BASE}/api/logs/${type}`)
  if (!res.ok) throw new Error(`Logs API error: ${res.status}`)
  return res.json()
}

export async function triggerRecompile(): Promise<{ success: boolean; message: string }> {
  const res = await apiFetch(`${API_BASE}/api/vault/compile`, { method: 'POST' })
  if (!res.ok) throw new Error(`Recompile API error: ${res.status}`)
  return res.json()
}

export async function triggerDream(): Promise<{ success: boolean; status: string }> {
  const res = await apiFetch(`${API_BASE}/api/dream`, { method: 'POST' })
  if (!res.ok) throw new Error(`Dream Cycle API error: ${res.status}`)
  return res.json()
}

export async function runAgentDiagnostics(): Promise<{ success: boolean; output: string }> {
  const res = await apiFetch(`${API_BASE}/api/diagnostics/agents`, { method: 'POST' })
  if (!res.ok) throw new Error(`Diagnostics API error: ${res.status}`)
  return res.json()
}

export async function restartDaemon(): Promise<{ success: boolean; message: string; pid?: number }> {
  const res = await apiFetch(`${API_BASE}/api/daemon/restart`, { method: 'POST' })
  if (!res.ok) throw new Error(`Restart daemon API error: ${res.status}`)
  return res.json()
}

export interface RestartResult {
  success: boolean
  scheduled: boolean
  message: string
  supervisor?: { supervised: boolean; kind: string | null; label: string | null; reason: string }
}

/**
 * Restart the brain server itself. Answers 409 on a host where nothing would
 * respawn the process — that is a real answer, not a failure, so the message is
 * surfaced rather than thrown.
 */
export async function restartServer(): Promise<RestartResult> {
  const res = await apiFetch(`${API_BASE}/api/server/restart`, { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok && res.status !== 409) {
    throw new Error(data.message || data.error || `Restart server API error: ${res.status}`)
  }
  return {
    success: Boolean(data.success),
    scheduled: Boolean(data.scheduled),
    message: data.message || (data.scheduled ? 'Server restarting.' : 'Server did not restart.'),
    supervisor: data.supervisor,
  }
}

export async function fetchBrains(): Promise<Record<string, unknown>[]> {
  const res = await apiFetch(`${API_BASE}/api/brains`)
  const data = await res.json()
  return data.brains || []
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function listTasks(): Promise<Task[]> {
  const res = await apiFetch(API_BASE + '/api/tasks')
  if (!res.ok) throw new Error(`Tasks API error: ${res.status}`)
  return res.json()
}

export async function createTask(category: string, target: string, body: string, priority?: number): Promise<{ slug: string }> {
  const res = await apiFetch(API_BASE + '/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, target, body, priority }),
  })
  if (!res.ok) throw new Error(`Tasks API error: ${res.status}`)
  return res.json()
}

// ─── Files ────────────────────────────────────────────────────────────────────

export async function listFiles(): Promise<FileNode[]> {
  const res = await apiFetch(API_BASE + '/api/files')
  if (!res.ok) throw new Error(`Files API error: ${res.status}`)
  return res.json()
}

// ─── Scripts ──────────────────────────────────────────────────────────────────

export interface ScriptFile {
  name: string
  size: number
  modified: string
}

export async function listScripts(): Promise<ScriptFile[]> {
  const res = await apiFetch(`${API_BASE}/api/scripts`)
  if (!res.ok) throw new Error(`Failed to list scripts: ${res.status}`)
  return res.json()
}

export async function readScript(name: string): Promise<{ name: string; content: string }> {
  const res = await apiFetch(`${API_BASE}/api/scripts/${name}`)
  if (!res.ok) throw new Error(`Failed to read script: ${res.status}`)
  return res.json()
}

export async function saveScript(name: string, content: string): Promise<{ success: boolean; message: string }> {
  const res = await apiFetch(`${API_BASE}/api/scripts/${name}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error(`Failed to save script: ${res.status}`)
  return res.json()
}

export async function runScript(name: string): Promise<{ success: boolean; output: string; exitCode: number }> {
  const res = await apiFetch(`${API_BASE}/api/scripts/${name}/run`, {
    method: "POST"
  })
  if (!res.ok) throw new Error(`Failed to run script: ${res.status}`)
  return res.json()
}

// ─── Share ────────────────────────────────────────────────────────────────────

export async function shareToApi(payload: { url: string; action: string; title?: string; tags?: string[] }): Promise<{ success: boolean; message?: string }> {
  const res = await apiFetch(`${API_BASE}/api/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Share API error: ${res.status}`)
  return res.json()
}

// ─── OKF ──────────────────────────────────────────────────────────────────────

export async function runOkfLint(): Promise<{ results: Array<{ slug: string; field: string; severity: string; message: string }>; summary: { total: number; errors: number; warnings: number } }> {
  const res = await apiFetch(`${API_BASE}/api/sandbox`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'const { execSync } = require("child_process"); console.log(JSON.stringify({ output: execSync("npx total-recall lint --okf 2>&1 || true", { encoding: "utf-8" }) }));', timeout: 30000 }),
  })
  if (!res.ok) throw new Error(`OKF lint error: ${res.status}`)
  return res.json()
}

export async function triggerOkfExport(path: string, options: { stripSsss?: boolean; format?: string; scope?: string }): Promise<{ success: boolean; message: string; path?: string }> {
  const args = [`export ${path} --okf`]
  if (options.stripSsss) args.push('--strip-ssss')
  if (options.format) args.push(`--format ${options.format}`)
  if (options.scope === 'global') args.push('--global')
  if (options.scope === 'project') args.push('--project')

  const res = await apiFetch(`${API_BASE}/api/sandbox`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: `const { execSync } = require("child_process"); try { const out = execSync("npx total-recall ${args.join(' ')} 2>&1", { encoding: "utf-8" }); console.log(JSON.stringify({ success: true, message: out })); } catch(e) { console.log(JSON.stringify({ success: false, message: e.stdout || e.message })); }`, timeout: 60000 }),
  })
  if (!res.ok) throw new Error(`OKF export error: ${res.status}`)
  return res.json()
}

// ─── Sync / Decisions ─────────────────────────────────────────────────────────

export async function postDecision(id: string, action: string, notes?: string): Promise<{ success: boolean; droplet_response?: unknown }> {
  const res = await apiFetch(`${API_BASE}/api/sync/remote-vault/proposals/${id}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, notes }),
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || `Decision API error: ${res.status}`)
  }
  return res.json()
}
