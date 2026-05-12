// ─── API helpers for Total Recall backend ────────────────────────────────────────

import type { HealthData, MemoryNode, SandboxResult } from './types'

let API_BASE = localStorage.getItem('TOTAL_RECALL_API_BASE') || ''

export function getApiBase() { return API_BASE }
export function setApiBase(url: string) {
  API_BASE = url
  localStorage.setItem('TOTAL_RECALL_API_BASE', url)
  window.location.reload() // Reload to apply new base URL globally
}

/** Chat completions → POST /v1/chat/completions */
export async function sendChat(messages: { role: string; content: string }[], signal?: AbortSignal): Promise<string> {
  const res = await fetch(API_BASE + '/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer local',
    },
    body: JSON.stringify({ messages }),
  })
  if (!res.ok) throw new Error(`Chat API error: ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? '(empty response)'
}

/** Health → GET /health */
export async function fetchHealth(): Promise<HealthData> {
  const res = await fetch(API_BASE + '/health')
  if (!res.ok) throw new Error(`Health API error: ${res.status}`)
  return res.json()
}

/** MCP tool call helper */
async function mcpCall(toolName: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const toolRes = await fetch(API_BASE + '/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sync-rpc': 'true',
      Authorization: 'Bearer local',
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

/** List memory nodes */
export async function listMemory(category?: string, status?: string): Promise<MemoryNode[]> {
  const args: Record<string, string> = {}
  if (category) args.category = category
  if (status) args.status = status
  const result = await mcpCall('list_memory', args)
  return (result as MemoryNode[]) ?? []
}

/** Search memory */
export async function searchMemory(query: string, category?: string): Promise<MemoryNode[]> {
  const args: Record<string, unknown> = { query }
  if (category) args.category = category
  const result = await mcpCall('search_memory', args)
  return (result as MemoryNode[]) ?? []
}

/** Read single memory node */
export async function readMemory(slug: string): Promise<MemoryNode | null> {
  const result = await mcpCall('read_memory', { slug })
  return (result as MemoryNode) ?? null
}

/** Run code in sandbox */
export async function runSandbox(code: string, timeoutMs = 5000): Promise<SandboxResult> {
  try {
    const result = await mcpCall('run_sandbox', { code, timeout_ms: timeoutMs })
    return { success: true, output: String(result ?? '(no output)') }
  } catch (e) {
    return { success: false, output: (e as Error).message, isError: true }
  }
}

/** List tasks */
export async function listTasks(): Promise<import('./types').Task[]> {
  const res = await fetch(API_BASE + '/api/tasks', {
    headers: { Authorization: 'Bearer local' }
  })
  if (!res.ok) throw new Error(`Tasks API error: ${res.status}`)
  return res.json()
}

/** Create task */
export async function createTask(category: string, target: string, body: string): Promise<{ slug: string }> {
  const res = await fetch(API_BASE + '/api/tasks', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      Authorization: 'Bearer local'
    },
    body: JSON.stringify({ category, target, body }),
  })
  if (!res.ok) throw new Error(`Tasks API error: ${res.status}`)
  return res.json()
}

/** List files */
export async function listFiles(): Promise<import('./types').FileNode[]> {
  const res = await fetch(API_BASE + '/api/files', {
    headers: { Authorization: 'Bearer local' }
  })
  if (!res.ok) throw new Error(`Files API error: ${res.status}`)
  return res.json()
}

/** List skills */
export async function listSkills(): Promise<import('./types').FileNode[]> {
  const res = await fetch(API_BASE + '/api/skills', {
    headers: { Authorization: 'Bearer local' }
  })
  if (!res.ok) throw new Error(`Skills API error: ${res.status}`)
  return res.json()
}

/** Config API */
export async function fetchConfig(name: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/config/${name}`, {
    headers: { Authorization: 'Bearer local' }
  })
  if (!res.ok) throw new Error(`Config API error: ${res.status}`)
  const data = await res.json()
  return data.content
}

export async function saveConfig(name: string, content: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/config/${name}`, {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json',
      Authorization: 'Bearer local' 
    },
    body: JSON.stringify({ content })
  })
  if (!res.ok) throw new Error(`Config API error: ${res.status}`)
}
