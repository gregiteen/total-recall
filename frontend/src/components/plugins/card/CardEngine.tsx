import { useEffect, useMemo, useState } from 'react'
import type { PluginInfo } from '../../../api/plugins'
import { apiFetch, API_BASE } from '../../../api/_base'
import { normalizeCard, type Card, type CardRegion } from './contract'
import { CardRunner } from './runner'
import { ActivityWidget, CommandsWidget, DataWidget, SettingsWidget, StatusWidget } from './widgets'
import { brandStyle } from './theme'
import './card.css'

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
  return <header className={`card-header card-header-${branding.header}`}>
    <div className="card-brand">
      {logo ? <img className="card-logo" src={logo} alt={`${branding.provider?.name || branding.name} logo`} /> : <span className="card-logo-missing" aria-hidden="true" />}
      <div>
        <h2>{branding.name}</h2>
        {branding.badge && <span className="card-badge">{branding.badge}</span>}
        {distribution && <span className="card-badge card-badge-quiet">{distribution.tier} · {distribution.license === 'open' ? 'open source' : 'service'}</span>}
      </div>
    </div>
    <button type="button" className="card-button card-button-quiet" onClick={onOpenDrawer}>Settings & usage</button>
  </header>
}

function Region({ region, plugin }: { region: CardRegion; plugin: PluginInfo }) {
  switch (region.widget) {
    case 'status': return <StatusWidget />
    case 'actions': case 'form': case 'keypad': case 'live': return <CommandsWidget region={region.command ? { ...region, commands: [region.command] } : region} />
    case 'table': case 'detail': case 'list': case 'gauge': case 'log': return <DataWidget region={region} />
    case 'settings': case 'credentials': return <SettingsWidget plugin={plugin} />
    case 'activity': return <ActivityWidget />
  }
}

function Drawer({ plugin, card, onClose }: { plugin: PluginInfo; card: Card; onClose: () => void }) {
  const [tab, setTab] = useState<'settings' | 'commands' | 'usage'>('settings')
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key) }, [onClose])
  return <aside className="card-drawer" role="dialog" aria-modal="true" aria-label={`${card.title} settings`}>
    <div className="card-drawer-head"><strong>{card.title}</strong><button type="button" className="card-link" onClick={onClose} aria-label="Close">Close</button></div>
    <nav className="card-tabs" role="tablist">{(['settings', 'commands', 'usage'] as const).map(t =>
      <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}>{t === 'settings' ? 'Settings' : t === 'commands' ? 'Commands' : 'Usage'}</button>)}</nav>
    <div className="card-drawer-body">
      {tab === 'settings' && <SettingsWidget plugin={plugin} />}
      {tab === 'commands' && <CommandsWidget region={{ widget: 'actions' }} />}
      {tab === 'usage' && <ActivityWidget />}
    </div>
  </aside>
}

/** One engine for every plugin; the manifest supplies layout, brand and commands. */
export function CardEngine({ plugin }: { plugin: PluginInfo }) {
  const card = useMemo(() => normalizeCard(plugin), [plugin])
  const [drawer, setDrawer] = useState(false)
  return <CardRunner card={card}>
    <section className={`card card-${card.template}`} style={brandStyle(card.branding)} data-density={card.branding.density} aria-label={`${card.title} card`}>
      <Header card={card} onOpenDrawer={() => setDrawer(true)} />
      <p className="card-muted card-description">{card.description}</p>
      <div className="card-regions">
        {card.regions.map((region, i) => <section key={i} className={`card-region card-region-${region.widget}`} style={region.span ? { gridColumn: `span ${Math.min(12, Math.max(1, region.span))}` } : undefined}>
          {region.title && <h3>{region.title}</h3>}<Region region={region} plugin={plugin} />
        </section>)}
      </div>
      {card.branding.provider && <footer className="card-footer">{card.branding.provider.url ? <a href={card.branding.provider.url} target="_blank" rel="noreferrer noopener">{card.branding.provider.name}</a> : card.branding.provider.name} is a trademark of its owner. This plugin connects to the service with your own account.</footer>}
      {drawer && <Drawer plugin={plugin} card={card} onClose={() => setDrawer(false)} />}
    </section>
  </CardRunner>
}
