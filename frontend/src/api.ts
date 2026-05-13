// ─── API helpers for Total Recall backend ────────────────────────────────────────

import type { HealthData, MemoryNode, SandboxResult } from './types'

let API_BASE = localStorage.getItem('TOTAL_RECALL_API_BASE') || ''

export function getApiBase() { return API_BASE }
export function setApiBase(url: string) {
  API_BASE = url
  localStorage.setItem('TOTAL_RECALL_API_BASE', url)
  window.location.reload()
}

// ─── Global 401 handler ────────────────────────────────────────────────────────
// Components can register a callback to be notified when any request gets 401.
// App.tsx registers this on mount to flip auth state → shows login screen.
type UnauthedCallback = () => void
let onUnauthed: UnauthedCallback | null = null
export function registerUnauthedCallback(cb: UnauthedCallback) { onUnauthed = cb }
export function clearUnauthedCallback() { onUnauthed = null }

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { credentials: 'include', ...options })
  if (res.status === 401) {
    onUnauthed?.()
  }
  return res
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

export async function checkSession(): Promise<boolean> {
  try {
    const res = await fetch(API_BASE + '/auth/me', { credentials: 'include' })
    return res.ok
  } catch {
    return false
  }
}

export async function login(password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password }),
    })
    if (res.ok) return { ok: true }
    const data = await res.json().catch(() => ({}))
    return { ok: false, error: data.error || 'Invalid password' }
  } catch {
    return { ok: false, error: 'Network error — is the server running?' }
  }
}

export async function logout(): Promise<void> {
  await fetch(API_BASE + '/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
}

// ─── Chat ──────────────────────────────────────────────────────────────────────

export async function sendChat(messages: { role: string; content: string }[], signal?: AbortSignal): Promise<string> {
  const res = await apiFetch(API_BASE + '/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
  if (!res.ok) throw new Error(`Chat API error: ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? '(empty response)'
}

export async function fetchChatHistory(): Promise<{ role: string; content: string }[]> {
  const res = await apiFetch(API_BASE + '/v1/chat/history')
  if (!res.ok) throw new Error(`Chat history error: ${res.status}`)
  const data = await res.json()
  return data.messages ?? []
}

// ─── TTS (Kokoro-82M) ──────────────────────────────────────────────────────────

export async function fetchTtsStatus(): Promise<{ enabled: boolean }> {
  try {
    const res = await apiFetch(API_BASE + '/api/tts/status')
    if (!res.ok) return { enabled: false }
    return res.json()
  } catch {
    return { enabled: false }
  }
}

export async function fetchTtsAudio(text: string): Promise<Blob | null> {
  const res = await apiFetch(API_BASE + '/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (res.status === 503) return null  // Kokoro not configured — caller should fall back.
  if (!res.ok) throw new Error(`TTS error: ${res.status}`)
  return res.blob()
}

// ─── Health ────────────────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<HealthData> {
  const res = await apiFetch(API_BASE + '/health')
  if (!res.ok) throw new Error(`Health API error: ${res.status}`)
  return res.json()
}

// ─── MCP ───────────────────────────────────────────────────────────────────────

async function mcpCall(toolName: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const toolRes = await apiFetch(API_BASE + '/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sync-rpc': 'true',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  })

  if (!toolRes.ok) throw new Error(`MCP tool error: ${toolRes.status}`)

  const data = await toolRes.json()
  if (data.error) throw new Error(data.error.message)

  const content = data.result?.content?.[0]?.text
  return content ? JSON.parse(content) : null
}

export async function listMemory(category?: string, status?: string): Promise<MemoryNode[]> {
  const args: Record<string, string> = {}
  if (category) args.category = category
  if (status) args.status = status
  const result = await mcpCall('list_memory', args)
  return (result as MemoryNode[]) ?? []
}

export async function searchMemory(query: string, category?: string): Promise<MemoryNode[]> {
  const args: Record<string, unknown> = { query }
  if (category) args.category = category
  const result = await mcpCall('search_memory', args)
  return (result as MemoryNode[]) ?? []
}

export async function readMemory(slug: string): Promise<MemoryNode | null> {
  const result = await mcpCall('read_memory', { slug })
  return (result as MemoryNode) ?? null
}

export async function runSandbox(code: string, timeoutMs = 5000): Promise<SandboxResult> {
  try {
    const result = await mcpCall('run_sandbox', { code, timeout_ms: timeoutMs })
    return { success: true, output: String(result ?? '(no output)') }
  } catch (e) {
    return { success: false, output: (e as Error).message, isError: true }
  }
}

// ─── Tasks ─────────────────────────────────────────────────────────────────────

export async function listTasks(): Promise<import('./types').Task[]> {
  const res = await apiFetch(API_BASE + '/api/tasks')
  if (!res.ok) throw new Error(`Tasks API error: ${res.status}`)
  return res.json()
}

export async function createTask(category: string, target: string, body: string): Promise<{ slug: string }> {
  const res = await apiFetch(API_BASE + '/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, target, body }),
  })
  if (!res.ok) throw new Error(`Tasks API error: ${res.status}`)
  return res.json()
}

// ─── Files ─────────────────────────────────────────────────────────────────────

export async function listFiles(): Promise<import('./types').FileNode[]> {
  const res = await apiFetch(API_BASE + '/api/files')
  if (!res.ok) throw new Error(`Files API error: ${res.status}`)
  return res.json()
}

export async function listSkills(): Promise<import('./types').FileNode[]> {
  const res = await apiFetch(API_BASE + '/api/skills')
  if (!res.ok) throw new Error(`Skills API error: ${res.status}`)
  return res.json()
}

// ─── Config ────────────────────────────────────────────────────────────────────

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

// ─── API Key Lifecycle ──────────────────────────────────────────────────────────

export interface ApiKey {
  id: string
  name: string
  token_preview: string
  created_at: string
  last_used_at: string | null
  hit_count: number
  revoked: boolean
}

export interface IssuedApiKey extends ApiKey {
  token: string // full token — only returned on creation
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const res = await apiFetch(`${API_BASE}/api/keys`)
  if (!res.ok) throw new Error(`Keys API error: ${res.status}`)
  return res.json()
}

export async function issueApiKey(name: string): Promise<IssuedApiKey> {
  const res = await apiFetch(`${API_BASE}/api/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error(`Keys API error: ${res.status}`)
  return res.json()
}

export async function revokeApiKey(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/keys/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Keys API error: ${res.status}`)
}
