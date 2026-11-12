import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PluginInfo } from '../../api/plugins'
import {
  findWorkspaceChunks, readDrawer, readWorkspaceChunk, saveDrawer,
  type DrawerConfig, type DrawerRevision, type DrawerSide, type PanelRef, type PluginDesign, type WorkspaceChunk,
} from '../../api/workspace-drawers'
import { PluginPanel, pluginElements } from '../plugins/PluginPanel'
import { ScopedPluginCommands } from '../plugins/ScopedPluginCommands'
import { DrawerMarkup } from './DrawerMarkup'
import { usePluginDesign } from './usePluginDesign'

export function drawerPanels(plugin: PluginInfo) {
  return pluginElements(plugin).filter(item => item.kind !== 'settings')
}

export function DrawerPanel({ plugins, reference, designCss, brainId }: {
  plugins: PluginInfo[] | null; reference: PanelRef; designCss?: string; brainId?: string
}) {
  if (!plugins) return <p role="status">Loading installed interfaces…</p>
  const plugin = plugins.find(plugin => plugin.id === reference.plugin)
  const panel = plugin && drawerPanels(plugin).find(item => item.id === reference.element)
  if (!plugin || !panel) return <p className="drawer-note">This plugin interface is not installed.</p>
  if (!plugin.valid || plugin.activation?.state === 'error') {
    return <p role="alert" className="drawer-error">{plugin.name} could not load.</p>
  }
  if (plugin.activation?.enabled !== true) return <p className="drawer-note">
    {plugin.name} is off. <Link to={{ search: `?plugin=${encodeURIComponent(plugin.id)}` }}>Open plugin settings</Link>
  </p>
  return <PluginPanel key={`${plugin.id}:${panel.id}`} plugin={plugin} elementId={panel.id} designCss={designCss} brainId={brainId} />
}

export function PublishedChunk({ name, side, plugins, design, designOwner, brainId }: {
  name: string; side: DrawerSide | 'page'; plugins: PluginInfo[] | null; design?: PluginDesign; designOwner?: string; brainId?: string
}) {
  const ownerDesign = usePluginDesign(designOwner, brainId)
  const theme = ownerDesign?.design || design
  const requestKey = JSON.stringify([name, side, brainId])
  const [result, setResult] = useState<{ key: string; chunk: (WorkspaceChunk & { html: string }) | null }>()
  const current = result?.key === requestKey ? result : undefined
  const chunk = current?.chunk
  useEffect(() => {
    const controller = new AbortController()
    void readWorkspaceChunk(name, side, controller.signal, brainId).then(
      data => { if (!controller.signal.aborted) setResult({ key: requestKey, chunk: data }) },
      () => { if (!controller.signal.aborted) setResult({ key: requestKey, chunk: null }) },
    )
    return () => controller.abort()
  }, [name, side, brainId, requestKey])
  if (current && (!chunk || !chunk.surfaces.includes(side))) return <p className="drawer-note">{name} is unavailable here.</p>
  if (!chunk) return <p role="status">Loading {name}…</p>
  const owner = plugins?.find(plugin => plugin.id === chunk.plugin)
  return <section className="drawer-stack" aria-label={chunk.title}>
    {chunk.html && <DrawerMarkup title={chunk.title} html={chunk.html} design={theme} />}
    {chunk.panel && <DrawerPanel plugins={plugins} reference={{ plugin: chunk.plugin, element: chunk.panel }} designCss={theme?.css ?? ''} brainId={brainId} />}
    {brainId && owner?.valid && owner.activation?.enabled === true && owner.activation.state !== 'error' &&
      !!chunk.operations?.length && <ScopedPluginCommands key={`${requestKey}:${owner.sha256}:${chunk.sha256}`} plugin={owner} brainId={brainId}
        operationIds={chunk.operations} label={`${chunk.title} operations`} />}
  </section>
}

function ShortcutList({ shortcuts }: { shortcuts: DrawerConfig['shortcuts'] }) {
  if (!shortcuts.length) return <p className="drawer-note">Add a shortcut to a dashboard page, plugin, or website.</p>
  return <nav className="drawer-actions" aria-label="Saved shortcuts">
    {shortcuts.map(({ label, href }, index) => href.startsWith('https://')
      ? <a key={index} className="btn btn-ghost" href={href} target="_blank" rel="noopener noreferrer">{label}</a>
      : <Link key={index} className="btn btn-ghost" to={href}>{label}</Link>)}
  </nav>
}

function LayoutEditor({ side, draft, onChange, plugins, brainId }: {
  side: DrawerSide; draft: DrawerConfig; onChange: (next: DrawerConfig) => void; plugins: PluginInfo[] | null; brainId?: string
}) {
  const [query, setQuery] = useState('')
  const [chunks, setChunks] = useState<WorkspaceChunk[]>([])
  const [catalogError, setCatalogError] = useState(false)
  const [preview, setPreview] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void findWorkspaceChunks(side, query, controller.signal, undefined, brainId).then(
        data => { if (!controller.signal.aborted) { setChunks(data.chunks); setCatalogError(false) } },
        () => { if (!controller.signal.aborted) { setChunks([]); setCatalogError(true) } },
      )
    }, 180)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [side, query, brainId])
  const panels = (plugins || []).filter(plugin => plugin.valid && plugin.activation?.enabled === true)
    .flatMap(plugin => drawerPanels(plugin).map(element => ({ plugin, element })))
  const choices = panels.filter(({ plugin, element }) => !draft.panels.some(ref => ref.plugin === plugin.id && ref.element === element.id))
  return <div className="drawer-stack">
    {side === 'bottom' && <fieldset className="drawer-stack drawer-fields">
      <legend>Shortcuts</legend>
      {draft.shortcuts.map((shortcut, index) => <div className="drawer-shortcut-edit" key={index}>
        <input className="input" required maxLength={80} value={shortcut.label} aria-label={`Shortcut ${index + 1} name`}
          placeholder="Name" onChange={event => onChange({ ...draft, shortcuts: draft.shortcuts.map((link, i) => i === index ? { ...link, label: event.target.value } : link) })} />
        <input className="input" required maxLength={1024} value={shortcut.href} aria-label={`Shortcut ${index + 1} address`}
          placeholder="/memory?plugin=… or https://…" onChange={event => onChange({ ...draft, shortcuts: draft.shortcuts.map((link, i) => i === index ? { ...link, href: event.target.value } : link) })} />
        <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove shortcut ${index + 1}`}
          onClick={() => onChange({ ...draft, shortcuts: draft.shortcuts.filter((_, i) => i !== index) })}>Remove</button>
      </div>)}
      <div><button type="button" className="btn btn-ghost btn-sm" disabled={draft.shortcuts.length >= 16}
        onClick={() => onChange({ ...draft, shortcuts: [...draft.shortcuts, { label: '', href: '' }] })}>Add shortcut</button></div>
    </fieldset>}
    <label>Drawer HTML
      <textarea className="input drawer-code" rows={7} maxLength={65536} value={draft.html}
        placeholder="<section>…</section>" onChange={event => onChange({ ...draft, html: event.target.value })} />
    </label>
    <div><button type="button" className="btn btn-ghost btn-sm" aria-expanded={preview} disabled={!draft.html.trim()}
      onClick={() => setPreview(!preview)}>{preview ? 'Hide preview' : 'Preview HTML'}</button></div>
    {preview && draft.html.trim() && <DrawerMarkup title="Draft HTML preview" html={draft.html} />}
    <fieldset className="drawer-stack drawer-fields">
      <legend>Plugin chunks</legend>
      {draft.chunks.map(key => <div key={key} className="drawer-row">
        <span>{key}</span>
        <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove ${key}`}
          onClick={() => onChange({ ...draft, chunks: draft.chunks.filter(item => item !== key) })}>Remove</button>
      </div>)}
      <input className="input" type="search" aria-label="Search installed chunks" placeholder="Search installed chunks…"
        value={query} onChange={event => setQuery(event.target.value)} />
      {catalogError ? <p className="drawer-note">The chunk catalog is unavailable on this server.</p> :
        <select className="select" aria-label="Add chunk" value="" disabled={draft.chunks.length >= 8}
          onChange={event => { if (event.target.value) onChange({ ...draft, chunks: [...draft.chunks, event.target.value] }) }}>
          <option value="">Add an installed chunk…</option>
          {chunks.filter(chunk => !draft.chunks.includes(chunk.key)).map(chunk =>
            <option key={chunk.key} value={chunk.key}>{chunk.title} · {chunk.plugin}</option>)}
        </select>}
    </fieldset>
    <fieldset className="drawer-stack drawer-fields">
      <legend>Plugin interfaces</legend>
      {draft.panels.map(ref => <div key={`${ref.plugin}:${ref.element}`} className="drawer-row">
        <span>{ref.plugin} · {ref.element}</span>
        <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove ${ref.plugin} ${ref.element}`}
          onClick={() => onChange({ ...draft, panels: draft.panels.filter(item => item !== ref) })}>Remove</button>
      </div>)}
      <select className="select" aria-label="Add plugin interface" value="" disabled={!choices.length || draft.panels.length >= 6}
        onChange={event => {
          const match = choices.find(({ plugin, element }) => `${plugin.id}:${element.id}` === event.target.value)
          if (match) onChange({ ...draft, panels: [...draft.panels, { plugin: match.plugin.id, element: match.element.id }] })
        }}>
        <option value="">Add an installed interface…</option>
        {choices.map(({ plugin, element }) =>
          <option key={`${plugin.id}:${element.id}`} value={`${plugin.id}:${element.id}`}>{plugin.name} · {element.description || element.id}</option>)}
      </select>
    </fieldset>
  </div>
}

export function DrawerLayout({ side, view, plugins, brainId }: {
  side: DrawerSide; view: 'custom' | 'shortcuts'; plugins: PluginInfo[] | null; brainId?: string
}) {
  const [revision, setRevision] = useState<DrawerRevision | null>(null)
  const [draft, setDraft] = useState<DrawerConfig | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void readDrawer(side, controller.signal).then(
      current => { if (!controller.signal.aborted) { setRevision(current); setError('') } },
      error => { if (!controller.signal.aborted) setError(error.message) },
    )
    return () => controller.abort()
  }, [refresh, side])
  return <div className="drawer-stack">
    <div className="drawer-actions">
      {!draft && <button type="button" className="btn btn-primary btn-sm" disabled={!revision}
        onClick={() => { setDraft(revision!.config); setError('') }}>{view === 'shortcuts' ? 'Edit shortcuts' : 'Edit drawer'}</button>}
      {!draft && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRefresh(refresh + 1)}>Refresh</button>}
    </div>
    {error && <p className="drawer-error" role="alert">{error}</p>}
    {!revision && !error && <p role="status">Loading the saved drawer…</p>}
    {draft && revision && <form className="drawer-stack" onSubmit={async event => {
      event.preventDefault()
      setBusy(true); setError('')
      try {
        setRevision(await saveDrawer(side, { config: draft, version: revision.version }))
        setDraft(null)
      } catch (error) { setError(error instanceof Error ? error.message : 'Could not save the drawer.') }
      finally { setBusy(false) }
    }}>
      <LayoutEditor side={side} draft={draft} onChange={setDraft} plugins={plugins} brainId={brainId} />
      <div className="drawer-actions">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save drawer'}</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setDraft(null); setError('') }}>Cancel</button>
      </div>
    </form>}
    {!draft && revision && (view === 'shortcuts' ? <ShortcutList shortcuts={revision.config.shortcuts} /> : <>
      {revision.config.html && <DrawerMarkup title={`${side} drawer custom HTML`} html={revision.config.html} />}
      {revision.config.chunks.map(key => <PublishedChunk key={`${brainId}:${key}:${refresh}`} name={key} side={side} plugins={plugins} brainId={brainId} designOwner={key.split(':')[0]} />)}
      {revision.config.panels.map(ref => <DrawerPanel key={`${brainId}:${ref.plugin}:${ref.element}:${refresh}`} plugins={plugins} reference={ref} brainId={brainId} />)}
      {!revision.config.html && !revision.config.chunks.length && !revision.config.panels.length &&
        <p className="drawer-note">Add HTML or an installed plugin interface to make this drawer yours.</p>}
    </>)}
  </div>
}
