// ─── Auth domain ──────────────────────────────────────────────────────────────

import { API_BASE } from './_base'

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

export interface AuthProvidersResponse {
  password: { configured: boolean }
  passkey: { enabled: boolean; has_passkeys: boolean; count: number }
  google: { configured: boolean; client_id: string | null }
}

export async function getAuthProviders(): Promise<AuthProvidersResponse> {
  try {
    const res = await fetch(API_BASE + '/auth/providers', { credentials: 'include' })
    if (res.ok) return await res.json()
    return {
      password: { configured: true },
      passkey: { enabled: false, has_passkeys: false, count: 0 },
      google: { configured: false, client_id: null },
    }
  } catch {
    return {
      password: { configured: true },
      passkey: { enabled: false, has_passkeys: false, count: 0 },
      google: { configured: false, client_id: null },
    }
  }
}

export async function passkeyLoginOptions(): Promise<any> {
  const res = await fetch(API_BASE + '/auth/passkey/options', {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to start passkey login')
  }
  return res.json()
}

export async function passkeyLoginVerify(response: any): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(API_BASE + '/auth/passkey/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ response }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) return { ok: true }
    return { ok: false, error: data.error || 'Passkey verification failed' }
  } catch {
    return { ok: false, error: 'Network error during passkey verification' }
  }
}
