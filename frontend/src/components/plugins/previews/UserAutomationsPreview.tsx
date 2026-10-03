import { useEffect, useState, type CSSProperties } from 'react'

const tokens = {
  '--color-text': 'var(--text-primary)',
  '--color-text-secondary': 'var(--text-secondary)',
  '--color-surface': 'var(--bg-secondary)',
  '--color-border': 'var(--border)',
  '--color-success': 'var(--success)',
  '--color-error': 'var(--error)',
  '--spacing-md': '12px',
  '--radius-md': '8px',
} as CSSProperties

export function UserAutomationsPreview() {
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let active = true
    const moduleUrl = '/api/plugins/user-automations/ui/automations'
    import(/* @vite-ignore */ moduleUrl)
      .then(() => { if (active) setReady(true) })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)) })
    return () => { active = false }
  }, [])
  if (error) return <p role="alert">Automation plugin unavailable: {error}</p>
  if (!ready) return <p>Loading user automations…</p>
  return <div style={tokens} ref={(element) => {
    if (element && !element.firstChild) element.append(document.createElement('tr-user-automations'))
  }} />
}
