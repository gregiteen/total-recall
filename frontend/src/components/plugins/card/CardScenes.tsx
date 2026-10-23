import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PluginInfo } from '../../../api/plugins'
import { API_BASE, apiFetch } from '../../../api/_base'
import { useRunner } from './runner-context'
import { ExecutionPicker } from './ExecutionPicker'

/**
 * The host gives a plugin a place to put its screens and a way to move between
 * them. Which screens exist, what they are called and what is on them is the
 * plugin's design: the face declares them and reports the active one. The host
 * never derives a screen from the command list.
 */
export interface PluginScreen { id: string; label: string }

/** Screens a face declares through `window.screens`, else the face stands alone. */
export function declaredScreens(element: HTMLElement | null): PluginScreen[] {
  const raw = (element as unknown as { screens?: unknown })?.screens
  if (!Array.isArray(raw)) return []
  return raw
    .filter((screen): screen is PluginScreen => Boolean(screen) && typeof screen === 'object'
      && typeof (screen as PluginScreen).id === 'string' && typeof (screen as PluginScreen).label === 'string')
    .slice(0, 12)
}

export function CardScenes({ plugin, children }: { plugin: PluginInfo; children: ReactNode }) {
  const { card, busy } = useRunner()
  const [enabled, setEnabled] = useState(plugin.activation?.enabled !== false)
  useEffect(() => { setEnabled(plugin.activation?.enabled !== false) }, [plugin.id, plugin.activation?.enabled])
  const [changing, setChanging] = useState(false)
  const [error, setError] = useState('')
  const [ownerBusy, setOwnerBusy] = useState<Record<string, string>>({})
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    const activity = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.pluginId !== plugin.id) return
      setOwnerBusy(previous => { const next = { ...previous }; if (detail.running) next[detail.requestId] = detail.command; else delete next[detail.requestId]; return next })
    }
    const contextMenu = (event: Event) => { if ((event as CustomEvent).detail?.pluginId === plugin.id) setMenu(true) }
    window.addEventListener('plugin-command-activity', activity)
    window.addEventListener('plugin-context-menu', contextMenu)
    return () => { window.removeEventListener('plugin-command-activity', activity); window.removeEventListener('plugin-context-menu', contextMenu) }
  }, [plugin.id])
  const running = [...busy, ...Object.values(ownerBusy)]
  const track = useRef<HTMLDivElement>(null)
  // The face's own screens collapse into a single mount point: the plugin keeps
  // every screen inside its own component and reports which one is active.
  const names = [...card.commands.keys()]
  const face = plugin.manifest?.card_face as { quick_actions?: Array<{ subcommand: string; label?: string }> } | undefined
  const declared = plugin.card_face?.quick_actions || face?.quick_actions || []
  const validActions = declared.filter(action => names.includes(action.subcommand))
  const common = validActions.slice(0, 8)
  const behavior = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' as const : 'smooth' as const
  /** Ask the face to show a screen it declared; it may ignore a name it does not own. */
  const openCommand = (name: string) => {
    setMenu(false)
    window.dispatchEvent(new CustomEvent('plugin-show-screen', { detail: { pluginId: plugin.id, screen: name } }))
  }
  const move = (delta: number) => track.current?.scrollBy({ left: delta * track.current.clientWidth, behavior: behavior() })
  const toggle = async () => {
    setChanging(true); setError('')
    try {
      const response = await apiFetch(`${API_BASE}/api/plugins/${encodeURIComponent(plugin.id)}/activation`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !enabled }) })
      const result = await response.json()
      if (result.activation) setEnabled(result.activation.enabled)
      if (!response.ok || !result.success) throw new Error(result.compilation?.error || result.error || 'Activation could not be changed')
    } catch (err) { setError(err instanceof Error ? err.message : 'Activation could not be changed') }
    finally { setChanging(false) }
  }
  return <div className="card-scenes" data-state={enabled ? 'active' : 'inactive'} aria-busy={running.length > 0 || changing}
    onContextMenu={event => { event.preventDefault(); setMenu(true) }}
    onKeyDown={event => { if (event.key === 'Escape') setMenu(false); if (event.key === 'F10' && event.shiftKey) { event.preventDefault(); setMenu(true) } }}>
    <div className="card-row card-scene-controls">
      <span role="status" className="card-pill">{running.length ? `Running ${running.join(', ')}` : enabled ? 'Active' : 'Inactive'}</span>
      <button type="button" className="card-button" role="switch" aria-checked={enabled} aria-label={`${card.title} on or off`} onClick={() => void toggle()} disabled={changing || running.length > 0}>{changing ? 'Updating…' : enabled ? 'Turn off' : 'Turn on'}</button>
      <button type="button" className="card-link" aria-label="Previous scene" onClick={() => move(-1)}>←</button>
      <button type="button" className="card-link" aria-label="Next scene" onClick={() => move(1)}>→</button>
      {common.length > 0 && <button type="button" className="card-link" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>Screens</button>}
    </div>
    {menu && <div role="menu" aria-label={`${card.title} declared screens`} className="card-context-menu">
      {common.map(action => <button role="menuitem" type="button" className="card-link" key={action.subcommand} onClick={() => openCommand(action.subcommand)}>{action.label || action.subcommand}</button>)}
    </div>}
    {error && <p role="alert" className="card-error">{error}</p>}
    <ExecutionPicker />
    <div className="card-scene-track" ref={track} tabIndex={0} aria-label={`${card.title} interface`}>
      <section className="card-scene" aria-label="Interface">{children}</section>
    </div>
  </div>
}
