// ─── Models domain ────────────────────────────────────────────────────────────

import { apiFetch, API_BASE } from './_base'

export interface GeminiModelInfo {
  id: string
  displayName: string
}

export async function fetchGeminiModels(): Promise<GeminiModelInfo[]> {
  const res = await apiFetch(`${API_BASE}/api/gemini-models?t=${Date.now()}`)
  if (!res.ok) throw new Error(`Gemini models API error: ${res.status}`)
  const data = await res.json()
  return data.models ?? []
}

export async function fetchClaudeModels(): Promise<GeminiModelInfo[]> {
  const res = await apiFetch(`${API_BASE}/api/claude-models?t=${Date.now()}`)
  if (!res.ok) throw new Error(`Claude models API error: ${res.status}`)
  const data = await res.json()
  return data.models ?? []
}

export async function fetchOpenaiModels(): Promise<GeminiModelInfo[]> {
  const res = await apiFetch(`${API_BASE}/api/openai-models?t=${Date.now()}`)
  if (!res.ok) throw new Error(`OpenAI models API error: ${res.status}`)
  const data = await res.json()
  return data.models ?? []
}

export async function fetchOpenRouterModels(): Promise<GeminiModelInfo[]> {
  const res = await apiFetch(`${API_BASE}/api/openrouter-models?t=${Date.now()}`)
  if (!res.ok) throw new Error(`OpenRouter models API error: ${res.status}`)
  const data = await res.json()
  return data.models ?? []
}
