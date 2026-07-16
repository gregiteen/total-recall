// ─── Shared API base — imported by all domain modules ────────────────────────

import type { HealthData, MemoryNode, SandboxResult, ResearchItem, Conflict, UsageData, ConfigJson } from '../types'
export type { HealthData, MemoryNode, SandboxResult, ResearchItem, Conflict, UsageData, ConfigJson }

export let API_BASE = localStorage.getItem('TOTAL_RECALL_API_BASE') || ''

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

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const activeBrain = localStorage.getItem('total-recall-active-brain');
  const headers = new Headers(options.headers || {});
  if (activeBrain) {
    headers.set('x-total-recall-brain', activeBrain);
  }

  const res = await fetch(url, { credentials: 'include', ...options, headers })
  if (res.status === 401) {
    onUnauthed?.()
  }
  return res
}

export async function get<T = any>(path: string): Promise<T> {
  const res = await apiFetch(API_BASE + path);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function post<T = any>(path: string, body: any): Promise<T> {
  const res = await apiFetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

export async function del<T = any>(path: string): Promise<T> {
  const res = await apiFetch(API_BASE + path, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
  return res.json();
}
