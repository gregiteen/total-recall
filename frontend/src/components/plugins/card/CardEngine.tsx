import { useEffect, useMemo, useRef, useState } from 'react'
import type { PluginInfo } from '../../../api/plugins'
import { apiFetch, API_BASE } from '../../../api/_base'
import { normalizeCard, type Card } from './contract'
import { CardRunner } from './runner'
import { ActivityWidget, CommandsWidget, SettingsWidget } from './widgets'
import { brandStyle } from './theme'
import { WorkspaceHost } from '../workspace/WorkspaceHost'
import { PluginPanel } from '../PluginPanel'
import './card.css'
import { CardScenes } from './CardScenes'

/** The provider's logo comes from the plugin through a locked-down route; <img> never runs SVG script. */
function useLogo(card: Card) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!card.branding.logo) return
    let objectUrl = ''
    let disposed = false
    apiFetch(`${API_BASE}/api/plugins/${encodeURIComponent(card.id)}/logo`)
      .then(r => r.ok ? r.blob() : Promise.reject(new Error('no logo')))
      .then(blob => { if (!disposed) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) } })
      .catch(() => { if (!disposed) setUrl('') })
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [card.id, card.branding.logo])
  return url
}

function Header({ card, onOpenDrawer }: { card: Card; onOpenDrawer: () => void }) {
  const logo = useLogo(card)
  const { branding, distribution } = card
  const hasWorkspace = Boolean(card.workspace)
  return <header className={`card-header card-header-${branding.header}`}>
    <div className="card-brand">
      {logo ? <img className="card-logo" src={logo} alt={`${branding.provider?.name || branding.name} logo`} /> : <span className="card-logo-missing" aria-hidden="true" />}
      <div>
        <h2>{branding.name}</h2>
        {branding.badge && <span className="card-badge">{branding.badge}</span>}
        {distribution && <span className="card-badge card-badge-quiet">{distribution.tier} · {distribution.license === 'open' ? 'open source' : 'service'}</span>}
      </div>
    </div>
    <button type="button" className="card-button card-button-quiet" onClick={onOpenDrawer}>
      {hasWorkspace ? 'Open workspace' : 'Settings & usage'}
    </button>
  </header>
}

function Drawer({ plugin, card, onClose }: { plugin: PluginInfo; card: Card; onClose: () => void }) {
  const hasWorkspace = Boolean(card.workspace)
  const [tab, setTab] = useState<'workspace' | 'settings' | 'commands' | 'usage'>(hasWorkspace ? 'workspace' : 'settings')
  const dialog = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || [])
    focusable()[0]?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); return }
      if (e.key !== 'Tab') return
      const targets = focusable(), first = targets[0], last = targets[targets.length - 1]
      if (!first) { e.preventDefault(); dialog.current?.focus(); return }
      if (!dialog.current?.contains(document.activeElement) || (e.shiftKey && document.activeElement === first)) { e.preventDefault(); (e.shiftKey ? last : first).focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus() }
  }, [])
  const tabs = hasWorkspace
    ? (['workspace', 'settings', 'commands', 'usage'] as const)
    : (['settings', 'commands', 'usage'] as const)
  return <aside ref={dialog} tabIndex={-1} className="card-drawer" role="dialog" aria-modal="true" aria-label={`${card.title} settings`}>
    <div className="card-drawer-head"><strong>{card.title}</strong><button type="button" className="card-link" onClick={onClose} aria-label="Close">Close</button></div>
    <nav className="card-tabs" role="tablist">{tabs.map(t =>
      <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}>
        {t === 'workspace' ? 'Workspace' : t === 'settings' ? 'Settings' : t === 'commands' ? 'Commands' : 'Session activity'}
      </button>)}</nav>
    <div className="card-drawer-body">
      {tab === 'workspace' && <WorkspaceHost plugin={plugin} card={card} />}
      {tab === 'settings' && <SettingsWidget plugin={plugin} />}
      {tab === 'commands' && <CommandsWidget />}
      {tab === 'usage' && <ActivityWidget />}
    </div>
  </aside>
}

/**
 * The host gives a plugin its frame, its brand tokens and its command
 * plumbing. The layout is the plugin's own face: CardEngine never arranges
 * a plugin's interface and there is no shared template to fall back to.
 */
export function CardEngine({ plugin }: { plugin: PluginInfo }) {
  const card = useMemo(() => normalizeCard(plugin), [plugin])
  const [drawer, setDrawer] = useState(false)
  return <CardRunner card={card}>
    <section className={`card card-bespoke${card.face ? ' card-owned' : ''}`} style={brandStyle(card.branding)} data-density={card.branding.density} aria-label={`${card.title} card`}>
      <Header card={card} onOpenDrawer={() => setDrawer(true)} />
      {card.description && <p className="card-muted card-description">{card.description}</p>}
      <CardScenes plugin={plugin}>
        {card.face
          ? <PluginPanel plugin={plugin} elementId={card.face.id} />
          : <p className="card-error" role="alert">{plugin.name} has not supplied its card face.</p>}
      </CardScenes>
      {card.branding.provider && <footer className="card-footer">{card.branding.provider.url ? <a href={card.branding.provider.url} target="_blank" rel="noreferrer noopener">{card.branding.provider.name}</a> : card.branding.provider.name} is a trademark of its owner. This plugin connects to the service with your own account.</footer>}
      {drawer && <Drawer plugin={plugin} card={card} onClose={() => setDrawer(false)} />}
    </section>
  </CardRunner>
}
