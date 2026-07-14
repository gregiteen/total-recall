// ─── Integrations domain ──────────────────────────────────────────────────────

import { apiFetch, API_BASE } from './_base'

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
