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

export async function login(password: string): Promise<{ ok: boolean; requiresPasswordReset?: boolean; error?: string }> {
  try {
    const res = await fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) return { ok: true, requiresPasswordReset: data.requiresPasswordReset }
    return { ok: false, error: data.error || 'Invalid password' }
  } catch {
    return { ok: false, error: 'Network error — is the server running?' }
  }
}

export async function changePassword(newPassword: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(API_BASE + '/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ newPassword }),
    })
    if (res.ok) return { ok: true }
    const data = await res.json().catch(() => ({}))
    return { ok: false, error: data.error || 'Failed to change password' }
  } catch {
    return { ok: false, error: 'Network error' }
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

// ─── Memory REST API ───────────────────────────────────────────────────────────

export async function listMemory(category?: string, status?: string): Promise<MemoryNode[]> {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (status) params.set('status', status)
  const res = await apiFetch(`${API_BASE}/api/memory?${params}`)
  if (!res.ok) throw new Error(`Memory API error: ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : (data.nodes || [])
}

export async function searchMemory(query: string, category?: string): Promise<MemoryNode[]> {
  const params = new URLSearchParams({ q: query })
  if (category) params.set('category', category)
  const res = await apiFetch(`${API_BASE}/api/memory?${params}`)
  if (!res.ok) throw new Error(`Memory API error: ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : (data.nodes || [])
}

export async function readMemory(slug: string): Promise<MemoryNode | null> {
  const res = await apiFetch(`${API_BASE}/api/memory/${slug}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Memory API error: ${res.status}`)
  return res.json()
}

export async function runSandbox(code: string, timeoutMs = 5000): Promise<SandboxResult> {
  try {
    const res = await apiFetch(`${API_BASE}/api/sandbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, timeout_ms: timeoutMs }),
    })
    if (!res.ok) throw new Error(`Sandbox API error: ${res.status}`)
    const data = await res.json()
    return { success: data.success, output: data.output || '(no output)', isError: !data.success }
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
  scopes: string[]
  expires_at: string | null
  created_at: string
  last_used_at: string | null
  hit_count: number
  revoked: boolean
}

export interface IssuedApiKey extends ApiKey {
  token: string // full token — only returned on creation
}

export interface ApiKeyListResponse {
  keys: ApiKey[]
  available_scopes: string[]
}

export async function listApiKeys(): Promise<ApiKeyListResponse> {
  const res = await apiFetch(`${API_BASE}/api/keys`)
  if (!res.ok) throw new Error(`Keys API error: ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? { keys: data, available_scopes: ['*'] } : data
}

export async function issueApiKey(name: string, scopes?: string[], expiresAt?: string | null): Promise<IssuedApiKey> {
  const res = await apiFetch(`${API_BASE}/api/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, scopes, expires_at: expiresAt || null }),
  })
  if (!res.ok) throw new Error(`Keys API error: ${res.status}`)
  return res.json()
}

export async function revokeApiKey(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/keys/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Keys API error: ${res.status}`)
}

export async function connectClient(client: string, baseUrl: string): Promise<{ success: boolean; message: string }> {
  const res = await apiFetch(`${API_BASE}/api/integrations/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client, baseUrl }),
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || `Connection error: ${res.status}`)
  }
  return res.json()
}

export async function fetchActiveIntegrations(): Promise<{ success: boolean; active: string[] }> {
  const res = await apiFetch(`${API_BASE}/api/integrations/active`, { method: 'GET' })
  if (!res.ok) throw new Error(`Integrations API error: ${res.status}`)
  return res.json()
}

// ─── Research & Logs ───────────────────────────────────────────────────────────

export interface ResearchQueueResponse {
  counts: { pending: number; in_progress: number; done: number; failed: number }
  total: number
  items: any[]
}

export async function listResearch(status?: string): Promise<ResearchQueueResponse> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  const res = await apiFetch(`${API_BASE}/api/research?${params}`)
  if (!res.ok) throw new Error(`Research API error: ${res.status}`)
  return res.json()
}

export async function createResearch(topic: string, priority?: string, notes?: string): Promise<any> {
  const res = await apiFetch(`${API_BASE}/api/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, priority, notes }),
  })
  if (!res.ok) throw new Error(`Research API error: ${res.status}`)
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
