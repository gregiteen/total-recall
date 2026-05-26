// ─── API helpers for Total Recall backend ────────────────────────────────────────

import type { HealthData, MemoryNode, SandboxResult, ResearchItem, Conflict, UsageData, ConfigJson } from './types'

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

export async function getAuthStatus(): Promise<{ configured: boolean }> {
  try {
    const res = await fetch(API_BASE + "/auth/status")
    if (res.ok) return await res.json()
    return { configured: true }
  } catch {
    return { configured: true }
  }
}

export async function setupPassword(newPassword: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(API_BASE + "/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) return { ok: true }
    return { ok: false, error: data.error || "Failed to setup password" }
  } catch {
    return { ok: false, error: "Network error — is the server running?" }
  }
}

export async function logout(): Promise<void> {
  await fetch(API_BASE + '/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
}

// ─── Chat ──────────────────────────────────────────────────────────────────────

export interface ChatThread {
  id: string
  title: string
  turns: number
  lastUpdated: number
}

export interface ChatSuggestion {
  type: string
  title: string
  text: string
  nodes: string[]
}

export async function sendChat(
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
  sessionId?: string,
  groundingNodes?: string[],
  model?: string
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (sessionId) {
    headers['x-session-id'] = sessionId
  }
  const res = await apiFetch(API_BASE + '/v1/chat/completions', {
    method: 'POST',
    signal,
    headers,
    body: JSON.stringify({ messages, groundingNodes, model }),
  })
  if (!res.ok) throw new Error(`Chat API error: ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? '(empty response)'
}

export async function fetchChatHistory(sessionId?: string): Promise<{ role: string; content: string }[]> {
  const headers: Record<string, string> = {}
  if (sessionId) {
    headers['x-session-id'] = sessionId
  }
  const res = await apiFetch(API_BASE + '/v1/chat/history', { headers })
  if (!res.ok) throw new Error(`Chat history error: ${res.status}`)
  const data = await res.json()
  return data.messages ?? []
}

export async function fetchChatThreads(): Promise<ChatThread[]> {
  const res = await apiFetch(API_BASE + '/v1/chat/threads')
  if (!res.ok) throw new Error(`Chat threads list error: ${res.status}`)
  return res.json()
}

export async function deleteChatThread(id: string): Promise<{ deleted: boolean; id: string }> {
  const res = await apiFetch(API_BASE + `/v1/chat/threads/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Delete chat thread error: ${res.status}`)
  return res.json()
}

export async function fetchChatSuggestions(): Promise<ChatSuggestion[]> {
  const res = await apiFetch(API_BASE + '/v1/chat/suggestions')
  if (!res.ok) throw new Error(`Chat suggestions list error: ${res.status}`)
  return res.json()
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

export async function listMemory(brainId?: string, category?: string, status?: string): Promise<MemoryNode[]> {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (status) params.set('status', status)
  
  if (!brainId) {
    const res = await apiFetch(`${API_BASE}/api/memory?${params}`)
    if (!res.ok) throw new Error(`Memory API error: ${res.status}`)
    const data = await res.json()
    return Array.isArray(data) ? data : (data.nodes || [])
  }
  
  const ids = brainId.split(',')
  const fetchPromises = ids.map(async (id) => {
    const url = id === 'global'
      ? `${API_BASE}/api/memory?${params}`
      : `${API_BASE}/api/brains/${id}/nodes?${params}`
    try {
      const res = await apiFetch(url)
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : (data.nodes || [])
    } catch {
      return []
    }
  })
  
  const results = await Promise.all(fetchPromises)
  const merged: MemoryNode[] = []
  const seenSlugs = new Set<string>()
  
  // Project brains override Global brain nodes on slug collisions
  const sortedResults = results.map((nodes, index) => ({ nodes, id: ids[index] }))
    .sort((a, b) => {
      if (a.id === 'global') return 1
      if (b.id === 'global') return -1
      return 0
    })
    
  for (const { nodes } of sortedResults) {
    for (const node of nodes) {
      if (!seenSlugs.has(node.slug)) {
        seenSlugs.add(node.slug)
        merged.push(node)
      }
    }
  }
  
  return merged
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

export async function createTask(category: string, target: string, body: string, priority?: number): Promise<{ slug: string }> {
  const res = await apiFetch(API_BASE + '/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, target, body, priority }),
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

export async function fetchSkill(name: string): Promise<{ name: string; content: string }> {
  const res = await apiFetch(`${API_BASE}/api/skills/${name}`)
  if (!res.ok) throw new Error(`Skill fetch API error: ${res.status}`)
  return res.json()
}

export async function saveSkill(name: string, content: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/skills/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error(`Skill save API error: ${res.status}`)
}

export async function deleteSkill(name: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/skills/${name}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`Skill delete API error: ${res.status}`)
}

/**
 * Queries the skills.sh registry sorted by absolute installs rating.
 *
 * @param query - The keyword or package name search term to locate in the registry.
 * @returns A promise resolving to an array of matching registry skill records.
 */
export async function searchSkillsRegistry(query: string): Promise<unknown[]> {
  const params = new URLSearchParams({ q: query })
  const res = await apiFetch(`${API_BASE}/api/skills/search?${params}`)
  if (!res.ok) throw new Error(`Registry search API error: ${res.status}`)
  return res.json()
}

/**
 * Automates downloading a package from skills.sh, executing static security checks,
 * quarantining vulnerable files, and hot-recompiling the active brain shims.
 *
 * @param pkg - The package name format (e.g. "owner/repo@skill" or "owner/repo").
 * @returns A promise resolving to the status result containing success indicators and logs.
 */
export async function installRegistrySkill(pkg: string): Promise<{ success: boolean; reason?: string; skillName?: string; path?: string }> {
  const res = await apiFetch(`${API_BASE}/api/skills/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pkg }),
  })
  if (!res.ok) throw new Error(`Registry installation API error: ${res.status}`)
  return res.json()
}

export async function fetchUsageStats(): Promise<UsageData> {
  const res = await apiFetch(`${API_BASE}/api/usage`)
  if (!res.ok) throw new Error(`Usage API error: ${res.status}`)
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
  items: ResearchItem[]
}

export async function listResearch(status?: string): Promise<ResearchQueueResponse> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  const res = await apiFetch(`${API_BASE}/api/research?${params}`)
  if (!res.ok) throw new Error(`Research API error: ${res.status}`)
  return res.json()
}

export async function createResearch(topic: string, priority?: string, notes?: string): Promise<ResearchItem> {
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

export async function triggerDream(): Promise<{ success: boolean; status: string }> {
  const res = await apiFetch(`${API_BASE}/api/dream`, { method: 'POST' })
  if (!res.ok) throw new Error(`Dream Cycle API error: ${res.status}`)
  return res.json()
}

export async function fetchGraph(): Promise<{ nodes: MemoryNode[]; routes: unknown[] }> {
  const res = await apiFetch(`${API_BASE}/api/graph`)
  if (!res.ok) throw new Error(`Graph API error: ${res.status}`)
  return res.json()
}

export async function fetchConflicts(): Promise<{ conflicts: Conflict[] }> {
  const res = await apiFetch(`${API_BASE}/api/conflicts`)
  if (!res.ok) throw new Error(`Conflicts API error: ${res.status}`)
  return res.json()
}

export async function resolveConflict(
  conflictId: string,
  action: "keep" | "supersede",
  winnerSlug: string
): Promise<{ success: boolean; conflict_id: string }> {
  const res = await apiFetch(`${API_BASE}/api/conflicts/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conflict_id: conflictId, action, winner_slug: winnerSlug }),
  })
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || `Conflict resolution API error: ${res.status}`)
  }
  return res.json()
}

// ─── Memory Editor APIs ────────────────────────────────────────────────────────

export async function saveMemory(slug: string, node: Partial<MemoryNode>): Promise<MemoryNode> {
  const res = await apiFetch(`${API_BASE}/api/memory/${slug}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(node),
  })
  if (!res.ok) throw new Error(`Failed to save memory: ${res.status}`)
  return res.json()
}

export async function createMemory(node: Partial<MemoryNode> & { slug: string }): Promise<MemoryNode> {
  const res = await apiFetch(`${API_BASE}/api/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(node),
  })
  if (!res.ok) throw new Error(`Failed to create memory: ${res.status}`)
  return res.json()
}

export async function deleteMemory(slug: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/memory/${slug}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error(`Failed to delete memory: ${res.status}`)
}

// ─── Scripts APIs ──────────────────────────────────────────────────────────────

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

// ─── Sessions APIs ─────────────────────────────────────────────────────────────

export interface SessionSummary {
  id: string
  filename: string
  title: string
  date: string
  source: string | null
  project: string | null
  count: number
  modified: string
  size: number
}

export async function fetchSessions(limit = 50, offset = 0): Promise<{ total: number; sessions: SessionSummary[] }> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  const res = await apiFetch(`${API_BASE}/api/sessions?${params}`)
  if (!res.ok) throw new Error(`Sessions API error: ${res.status}`)
  return res.json()
}

export async function deleteSession(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/sessions/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete session: ${res.status}`)
}

// ─── Gemini Models APIs ─────────────────────────────────────────────────────────

export interface GeminiModelInfo {
  id: string
  displayName: string
}

export async function fetchGeminiModels(): Promise<GeminiModelInfo[]> {
  const res = await apiFetch(`${API_BASE}/api/gemini-models`)
  if (!res.ok) throw new Error(`Gemini models API error: ${res.status}`)
  const data = await res.json()
  return data.models ?? []
}

