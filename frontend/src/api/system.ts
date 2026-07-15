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
