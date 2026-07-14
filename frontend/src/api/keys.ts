// ─── Keys & Secrets domain ────────────────────────────────────────────────────

import { apiFetch, API_BASE } from './_base'

// ─── API Key Lifecycle ────────────────────────────────────────────────────────

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

// ─── Secrets store (API keys / env import — not PATs) ─────────────────────────

export interface EnvSecretCandidate {
  key: string
  source: string
  source_label: string
  provider: string | null
  masked: string
  length: number
  known: boolean
  already_set?: boolean
}

export async function scanEnvSecrets(): Promise<{
  candidates: EnvSecretCandidate[]
  count: number
  sources_scanned: string[]
}> {
  const res = await apiFetch(`${API_BASE}/api/secrets/scan-env`)
  if (!res.ok) throw new Error(`Env scan failed: ${res.status}`)
  return res.json()
}

export async function parseEnvPaste(text: string): Promise<{
  candidates: EnvSecretCandidate[]
  count: number
}> {
  const res = await apiFetch(`${API_BASE}/api/secrets/parse-env`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Parse failed: ${res.status}`)
  }
  return res.json()
}

export async function importEnvSecrets(opts: {
  keys?: string[]
  all?: boolean
  pairs?: Record<string, string>
  overwrite?: boolean
}): Promise<{
  imported: { key: string; provider: string | null }[]
  skipped: { key: string; reason: string }[]
  errors: { key: string; error: string }[]
  imported_count: number
  skipped_count: number
}> {
  const res = await apiFetch(`${API_BASE}/api/secrets/import-env`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Import failed: ${res.status}`)
  }
  return res.json()
}

export interface SecretCatalogKey {
  key: string
  set: boolean
  length: number
  fingerprint: string | null
  masked: string | null
  scope: string
  provider: string | null
  provider_name?: string | null
  label: string | null
  repos: string[]
  /** Single product repo, or null for Developer secrets */
  repo?: string | null
  multi_repo_error?: boolean
  binding_error?: string | null
  project_path: string | null
  subscription_tier: string | null
  monthly_cost_usd: number | null
  monthly_cap_usd: number | null
  api_docs_url: string | null
  console_url: string | null
  pricing_url: string | null
  schema: { auth: string; header?: string; env_keys?: string[]; notes?: string } | null
  schema_notes: string | null
  auth_scheme: string | null
  rotate_every_days: number | null
  auto_rotate: boolean
  next_rotate_due: string | null
  rotation_overdue: boolean
  notes: string | null
  created_at: string | null
  updated_at: string | null
  rotated_at: string | null
  usage_30d: { events: number; cost_usd: number; input_tokens: number; output_tokens: number }
  tiers: { id: string; label: string; monthly_usd?: number | null }[]
}

export interface SecretCatalog {
  keys: SecretCatalogKey[]
  providers: unknown[]
  summary: {
    total_keys: number
    providers_active: number
    monthly_subscription_usd: number
    multi_repo_violations?: number
    developer_keys?: number
    product_keys?: number
    usage_7d: { events: number; cost_usd: number }
    usage_30d: { events: number; cost_usd: number }
    rotation_overdue: number
    budget: Record<string, unknown>
  }
  by_provider: { provider: string; keys: number; cost_30d: number; monthly_cost: number }[]
  store: string
}

export async function fetchSecretsCatalog(): Promise<SecretCatalog> {
  const res = await apiFetch(`${API_BASE}/api/secrets`)
  if (!res.ok) throw new Error(`Secrets catalog error: ${res.status}`)
  return res.json()
}

export async function updateSecretMeta(key: string, patch: Record<string, unknown>): Promise<SecretCatalogKey> {
  const res = await apiFetch(`${API_BASE}/api/secrets/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Meta update failed: ${res.status}`)
  }
  return res.json()
}

export async function rotateSecretValue(
  key: string,
  value: string,
  opts: { export_env?: boolean; export_all?: boolean } = {},
): Promise<{
  rotated?: boolean
  next_rotate_due?: string | null
  exports?: { ok: boolean; envPath?: string; count?: number; error?: string }[]
  secret?: SecretCatalogKey
}> {
  const res = await apiFetch(`${API_BASE}/api/secrets/${encodeURIComponent(key)}/rotate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      value,
      export_env: opts.export_env ?? true,
      export_all: opts.export_all ?? true,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Rotate failed: ${res.status}`)
  }
  return res.json()
}

export async function deleteProviderSecret(key: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/secrets/${encodeURIComponent(key)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
}

export async function recordSecretUsage(body: {
  key_ref?: string
  key?: string
  provider?: string
  model?: string
  cost_usd?: number
  input_tokens?: number
  output_tokens?: number
  source?: string
}): Promise<unknown> {
  const res = await apiFetch(`${API_BASE}/api/secrets/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Usage record failed: ${res.status}`)
  return res.json()
}

export async function exportEnvFromSecrets(opts: {
  path?: string
  all_projects?: boolean
  dry_run?: boolean
  include_global?: boolean
  keys?: string[]
}): Promise<{
  count?: number
  keys?: string[]
  envPath?: string
  results?: { ok: boolean; name?: string; envPath?: string; count?: number; error?: string }[]
  store?: string
}> {
  const res = await apiFetch(`${API_BASE}/api/secrets/export-env`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `export-env failed: ${res.status}`)
  }
  return res.json()
}

export async function fetchRotationDue(): Promise<{ due: SecretCatalogKey[]; count: number }> {
  const res = await apiFetch(`${API_BASE}/api/secrets/rotation-due`)
  if (!res.ok) throw new Error(`rotation-due failed: ${res.status}`)
  return res.json()
}

export async function enqueueRotationDue(): Promise<unknown> {
  const res = await apiFetch(`${API_BASE}/api/secrets/rotation-due/enqueue`, { method: 'POST' })
  if (!res.ok) {
    // fallback: client can use CLI; route may not exist yet
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `enqueue failed: ${res.status}`)
  }
  return res.json()
}

export async function revealSecretValue(
  key: string,
  stepUpToken: string,
): Promise<{ key: string; value: string; revealed_at: string }> {
  const res = await apiFetch(`${API_BASE}/api/secrets/${encodeURIComponent(key)}/reveal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step_up_token: stepUpToken }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Reveal failed: ${res.status}`)
  }
  return res.json()
}

// ─── WebAuthn / passkey step-up (secret reveal) ───────────────────────────────

export interface WebAuthnStatus {
  enabled: boolean
  has_passkeys: boolean
  count: number
  passkeys: { id: string; created_at: string | null; label?: string }[]
  password_step_up_allowed?: boolean
}

/** Minimal JSON option types (compatible with @simplewebauthn/browser) */
export type PublicKeyCredentialCreationOptionsJSON = Record<string, unknown>
export type PublicKeyCredentialRequestOptionsJSON = Record<string, unknown>

export async function fetchWebAuthnStatus(): Promise<WebAuthnStatus> {
  const res = await apiFetch(`${API_BASE}/api/webauthn/status`)
  if (!res.ok) throw new Error(`WebAuthn status failed: ${res.status}`)
  return res.json()
}

export async function webauthnRegisterOptions(): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const res = await apiFetch(`${API_BASE}/api/webauthn/register/options`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `register options failed: ${res.status}`)
  }
  return res.json()
}

export async function webauthnRegisterVerify(
  response: unknown,
  label?: string,
): Promise<{ verified: boolean; passkeys?: WebAuthnStatus['passkeys'] }> {
  const res = await apiFetch(`${API_BASE}/api/webauthn/register/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response, label }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `register verify failed: ${res.status}`)
  }
  return res.json()
}

export async function webauthnAssertOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const res = await apiFetch(`${API_BASE}/api/webauthn/assert/options`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `assert options failed: ${res.status}`)
  }
  return res.json()
}

export async function webauthnAssertVerify(
  response: unknown,
): Promise<{ verified: boolean; step_up_token: string; expires_in: number }> {
  const res = await apiFetch(`${API_BASE}/api/webauthn/assert/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response, purpose: 'secrets:reveal', ttl_seconds: 60 }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `assert verify failed: ${res.status}`)
  }
  return res.json()
}

export async function webauthnPasswordStepUp(
  password: string,
): Promise<{ verified: boolean; step_up_token: string; expires_in: number }> {
  const res = await apiFetch(`${API_BASE}/api/webauthn/step-up/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, purpose: 'secrets:reveal', ttl_seconds: 60 }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `password step-up failed: ${res.status}`)
  }
  return res.json()
}

export async function deletePasskey(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/webauthn/credentials/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`Delete passkey failed: ${res.status}`)
}
