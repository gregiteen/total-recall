import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PluginInfo } from '../../../api/plugins'
import { API_BASE, apiFetch } from '../../../api/_base'
import { useRunner } from './runner-context'
import { ExecutionPicker } from './ExecutionPicker'
import { sanitizePluginScreens } from '../plugin-frame'
import type { PluginScreen } from '../plugin-frame'

/**
 * The host gives a plugin a place to put its screens and a way to move between
 * them. Which screens exist, what they are called and what is on them is the
 * plugin's design: the face declares them and reports the active one. The host
 * never derives a screen from the command list.
 */
export type { PluginScreen } from '../plugin-frame'

export function CardScenes({ plugin, children }: { plugin: PluginInfo; children: ReactNode }) {
  const { card, busy } = useRunner()
  const [enabled, setEnabled] = useState(plugin.activation?.enabled !== false)
  useEffect(() => { setEnabled(plugin.activation?.enabled !== false) }, [plugin.id, plugin.activation?.enabled])
  const [changing, setChanging] = useState(false)
  const [error, setError] = useState('')
  const [ownerBusy, setOwnerBusy] = useState<Record<string, string>>({})
  const [menu, setMenu] = useState(false)
  const [screens, setScreens] = useState<PluginScreen[]>([])
  const [activeScreen, setActiveScreen] = useState('')
  const screensRef = useRef<PluginScreen[]>([])
  useEffect(() => {
    screensRef.current = []
    setScreens([]); setActiveScreen(''); setMenu(false)
    const activity = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.pluginId !== plugin.id) return
      setOwnerBusy(previous => { const next = { ...previous }; if (detail.running) next[detail.requestId] = detail.command; else delete next[detail.requestId]; return next })
    }
    const contextMenu = (event: Event) => { if ((event as CustomEvent).detail?.pluginId === plugin.id) setMenu(true) }
    const declared = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.pluginId !== plugin.id) return
      const next = sanitizePluginScreens(detail.screens)
      screensRef.current = next
      setScreens(next)
      setActiveScreen(previous => next.some(screen => screen.id === previous) ? previous : next[0]?.id || '')
    }
    const changed = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.pluginId === plugin.id && screensRef.current.some(screen => screen.id === detail.screen)) setActiveScreen(detail.screen)
    }
    window.addEventListener('plugin-command-activity', activity)
    window.addEventListener('plugin-context-menu', contextMenu)
    window.addEventListener('plugin-screens', declared)
    window.addEventListener('plugin-screen-changed', changed)
    return () => {
      window.removeEventListener('plugin-command-activity', activity); window.removeEventListener('plugin-context-menu', contextMenu)
      window.removeEventListener('plugin-screens', declared); window.removeEventListener('plugin-screen-changed', changed)
    }
  }, [plugin.id])
  const running = [...busy, ...Object.values(ownerBusy)]
  // The face's own screens collapse into a single mount point: the plugin keeps
  // every screen inside its own component and reports which one is active.
  /** Ask the face to show a screen it declared; it may ignore a name it does not own. */
  const openScreen = (name: string) => {
    if (!screens.some(screen => screen.id === name)) return
    setMenu(false)
    window.dispatchEvent(new CustomEvent('plugin-show-screen', { detail: { pluginId: plugin.id, screen: name } }))
  }
  const move = (delta: number) => {
    if (screens.length < 2) return
    const current = Math.max(0, screens.findIndex(screen => screen.id === activeScreen))
    openScreen(screens[(current + delta + screens.length) % screens.length].id)
  }
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
      <button type="button" className="card-link" aria-label="Previous screen" disabled={screens.length < 2} onClick={() => move(-1)}>←</button>
      <button type="button" className="card-link" aria-label="Next screen" disabled={screens.length < 2} onClick={() => move(1)}>→</button>
      {screens.length > 0 && <span className="card-pill" aria-label="Current screen">{screens.find(screen => screen.id === activeScreen)?.label}</span>}
      {screens.length > 0 && <button type="button" className="card-link" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>Screens</button>}
    </div>
    {menu && screens.length > 0 && <div role="menu" aria-label={`${card.title} declared screens`} className="card-context-menu">
      {screens.map(screen => <button role="menuitem" type="button" className="card-link" key={screen.id} aria-current={screen.id === activeScreen ? 'page' : undefined} onClick={() => openScreen(screen.id)}>{screen.label}</button>)}
    </div>}
    {error && <p role="alert" className="card-error">{error}</p>}
    <ExecutionPicker />
    <div className="card-scene-track" tabIndex={0} aria-label={`${card.title} interface`}>
      <section className="card-scene" aria-label="Interface">{children}</section>
    </div>
  </div>
}
