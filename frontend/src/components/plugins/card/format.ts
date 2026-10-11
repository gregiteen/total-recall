import type { CellFormat, Loose } from './contract'

export type Tone = 'ok' | 'warn' | 'error' | 'neutral'
const GOOD = /^(ok|healthy|active|connected|ready|running|verified|delivered|sent|passed|pass|up|online|true|complete|completed)$/i
const BAD = /^(error|failed|fail|down|offline|rejected|bounced|blocked|false|expired|denied)$/i
const WARN = /^(warn|warning|pending|queued|degraded|unknown|stale|paused|partial|throttled)$/i
export const toneOf = (value: unknown): Tone => { const s = String(value); return GOOD.test(s) ? 'ok' : BAD.test(s) ? 'error' : WARN.test(s) ? 'warn' : 'neutral' }

export function formatCell(value: unknown, format: CellFormat = 'text'): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  const n = Number(value)
  switch (format) {
    case 'number': return Number.isFinite(n) ? n.toLocaleString() : String(value)
    case 'money': return Number.isFinite(n) ? n.toLocaleString(undefined, { style: 'currency', currency: 'USD' }) : String(value)
    case 'percent': return Number.isFinite(n) ? `${Math.round((n <= 1 ? n * 100 : n) * 10) / 10}%` : String(value)
    case 'bytes': {
      if (!Number.isFinite(n)) return String(value)
      const units = ['B', 'KB', 'MB', 'GB', 'TB']; let v = n, i = 0
      while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
      return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`
    }
    case 'date': case 'datetime': {
      const d = new Date(String(value))
      if (Number.isNaN(d.getTime())) return String(value)
      return format === 'date' ? d.toLocaleDateString() : d.toLocaleString()
    }
    default: return String(value)
  }
}

/** Rows may arrive as a bare array or wrapped under a common key. */
export function rowsOf(data: Loose): Loose[] {
  if (Array.isArray(data)) return data
  for (const key of ['rows', 'items', 'results', 'data', 'entries', 'records']) if (Array.isArray(data?.[key])) return data[key]
  return []
}

export function scalarsOf(data: Loose): Array<[string, string]> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return []
  return Object.entries(data).filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v)).map(([k, v]) => [k, v === null ? '—' : String(v)])
}
