// ─── Sandbox domain ───────────────────────────────────────────────────────────

import { apiFetch, API_BASE } from './_base'
import type { SandboxResult } from './_base'

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
