// ─── Chat domain ──────────────────────────────────────────────────────────────

import { apiFetch, API_BASE } from './_base'

export interface ChatThread {
  id: string
  title: string
  turns: number
  lastUpdated: number
  brainId: string
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
  model?: string,
  brainId?: string
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (sessionId) {
    headers['x-session-id'] = sessionId
  }
  const res = await apiFetch(API_BASE + '/v1/chat/completions', {
    method: 'POST',
    signal,
    headers,
    body: JSON.stringify({ messages, groundingNodes, model, brainId }),
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
