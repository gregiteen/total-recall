import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import {
  fetchBundledPlugins, fetchPeerPlugins, fetchPlugins, installPlugin, removePlugin,
  setPluginActivation, setPluginShared, type BrainPluginActivation, type BundledPlugin,
  type PeersResponse, type PluginInfo
} from '../../api/plugins'
import { PluginPanel, pluginElements } from './PluginPanel'
import { PluginSettings } from './PluginSettings'
import { PluginChunkLibrary } from '../workspace/PluginChunkLibrary'
import { PluginHome } from '../workspace/PluginHome'
import { readSavedPluginCredentials } from '../../api/plugin-credentials'
import { ScopedPluginCommands } from './ScopedPluginCommands'

type Notice = { text: string; error?: boolean }
type OpenAttempt = { pluginId: string; brainId: string; error?: string }

interface WorkspaceProps {
  activeBrainId: string
  renderShell: (folder: ReactNode, page: ReactNode, plugins: PluginInfo[] | null) => ReactNode
  onOpenPlugin: () => void
  onStaleBrain?: () => void
}

function pluginOrigin(plugin: PluginInfo) {
  if (plugin.core) return 'Core'
  if (plugin.scope === 'scaffold' || plugin.source.kind === 'bundled') return 'Bundled'
  if (plugin.source.kind === 'peer' || plugin.source.kind === 'public') return 'Shared'
  return 'User'
}

export default function PluginWorkspace({ activeBrainId, renderShell, onOpenPlugin, onStaleBrain }: WorkspaceProps) {
  const [params, setParams] = useSearchParams()
  const { pathname } = useLocation()
  const [expanded, setExpanded] = useState<boolean>()
  const [inventory, setInventory] = useState<{ selection: string; plugins: PluginInfo[] }>()
  const [failure, setFailure] = useState<{ selection: string; message: string }>()
  const [openAttempt, setOpenAttempt] = useState<OpenAttempt>()
  const [browse, setBrowse] = useState(false)
  const request = useRef(0)
  const currentSelection = useRef(activeBrainId)
  const plugins = inventory?.selection === activeBrainId ? inventory.plugins : null
  const loadError = failure?.selection === activeBrainId ? failure.message : undefined
  const brainIds = activeBrainId.split(',').filter(Boolean)
  const brainId = brainIds.length === 1 ? brainIds[0] : undefined
  const id = pathname === '/plugins' || (pathname === '/memory' && params.get('page')) ? null : params.get('plugin')
  const open = expanded ?? Boolean(id || params.has('plugins'))
  const selected = id ? plugins?.find(plugin => plugin.id === id || plugin.id === `tr-plugin-${id}` || plugin.name === id) : undefined

  const refresh = useCallback(async () => {
    if (currentSelection.current !== activeBrainId) return
    const current = ++request.current
    try {
      const installed = await fetchPlugins(activeBrainId)
      if (request.current !== current) return
      setInventory({ selection: activeBrainId, plugins: [...installed].sort((a, b) => a.name.localeCompare(b.name)) })
      setFailure(undefined)
      setOpenAttempt(attempt => attempt?.error ? undefined : attempt)
    } catch (error) {
      if (request.current !== current) return
      const message = error instanceof Error ? error.message : 'Could not load plugins.'
      if (activeBrainId !== 'global' && onStaleBrain && message.includes('unavailable')) {
        onStaleBrain()
        return
      }
      setFailure({ selection: activeBrainId, message })
    }
  }, [activeBrainId])

  useEffect(() => {
    currentSelection.current = activeBrainId
    void refresh()
    return () => { request.current++ }
  }, [activeBrainId, refresh])

  function select(pluginId: string | null) {
    const next = new URLSearchParams(params)
    if (pluginId) {
      next.set('plugin', pluginId)
      next.delete('page')
    } else next.delete('plugin')
    setParams(next, { replace: !pluginId })
  }

  async function openArmed(plugin: PluginInfo) {
    if (!brainId?.startsWith('project:') || plugin.activation?.mode !== 'on-use') return
    if (openAttempt?.brainId === brainId && openAttempt.pluginId === plugin.id && !openAttempt.error) return
    const attempt = { pluginId: plugin.id, brainId }
    setOpenAttempt(attempt)
    const result = await setPluginActivation(plugin.id, 'use', [brainId])
    const error = result.success ? undefined : result.results?.[0]?.error || result.error || 'Could not open this plugin.'
    await refresh()
    setOpenAttempt(current => current === attempt ? (error ? { ...attempt, error } : undefined) : current)
  }

  const folder = <>
      <button type="button" className="nav-link plugin-folder-toggle" id="nav-plugins"
        aria-expanded={open} aria-controls="plugin-folder" onClick={() => setExpanded(!open)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </svg>
        Plugins <span className="plugin-folder-chevron" aria-hidden="true">{open ? '▾' : '›'}</span>
      </button>
      <div id="plugin-folder" hidden={!open}>
        {loadError ? <div className="plugin-folder-message" role="alert">
          {loadError} <button className="btn btn-ghost btn-sm" onClick={() => void refresh()}>Retry</button>
        </div> : plugins === null ? <p className="plugin-folder-message" role="status">Loading plugins…</p> :
          <ul className="plugin-folder-list" aria-label="Installed plugins">
            {plugins.map(plugin => <li key={plugin.id}>
              <button type="button" className={`nav-link plugin-folder-item ${selected?.id === plugin.id ? 'active' : ''}`}
                aria-current={selected?.id === plugin.id || undefined}
                onClick={() => { select(plugin.id); onOpenPlugin(); void openArmed(plugin) }}>
                <span>{plugin.name}</span><small className="plugin-origin" aria-hidden="true">{pluginOrigin(plugin)}</small>
              </button>
            </li>)}
            {!plugins.length && <li className="plugin-folder-message">No plugins installed</li>}
          </ul>}
        <button type="button" className="nav-link plugin-folder-item" onClick={() => { setBrowse(true); onOpenPlugin() }}>
          Browse and install
        </button>
      </div>
  </>
  let page: ReactNode = null
  if (selected) page = <PluginDetail key={`${activeBrainId}:${selected.id}`} plugin={selected} plugins={plugins} stale={!!loadError} brainId={brainId}
    opening={openAttempt?.pluginId === selected.id && openAttempt.brainId === brainId ? openAttempt : undefined}
    onUse={() => void openArmed(selected)} onClose={() => select(null)} onChange={refresh} />
  else if (id && (loadError || plugins)) page = <section className="plugin-workspace-page" aria-label="Plugin unavailable">
    <p role="alert">{loadError || `No installed plugin matches ${id}.`}</p>
    <button type="button" className="btn btn-ghost" onClick={() => select(null)}>Close</button>
  </section>
  else if (params.has('plugins') && pathname === '/memory' && !params.get('page')) page = (
    <section className="plugin-workspace-page" aria-label="Installed plugins overview" style={{ padding: '24px', maxWidth: '1120px', width: '100%', margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Plugins</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {plugins ? `${plugins.length} installed plugins` : 'Loading installed plugins…'}
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setBrowse(true)}>Browse and install</button>
      </header>
      {loadError ? <div className="plugin-folder-message" role="alert">
        {loadError} <button className="btn btn-ghost btn-sm" onClick={() => void refresh()}>Retry</button>
      </div> : plugins === null ? <p role="status">Loading plugins…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
          {plugins.map(plugin => (
            <button key={plugin.id} type="button" onClick={() => { select(plugin.id); void openArmed(plugin) }}
              style={{
                textAlign: 'left', padding: '16px', borderRadius: 'var(--radius-md)',
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '6px'
              }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <strong style={{ fontSize: '1rem' }}>{plugin.name}</strong>
                <small style={{ color: 'var(--text-secondary)' }}>{pluginOrigin(plugin)}</small>
              </div>
              {plugin.description && <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.4 }}>{plugin.description}</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  )

  return <>
    {renderShell(folder, page, loadError ? null : plugins)}
    {browse && <PluginInstaller onClose={() => setBrowse(false)} onChange={refresh} />}
  </>
}

function PluginDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="plugin-drawer-backdrop" onClick={onClose}>
    <section className="plugin-drawer" role="dialog" aria-modal="true" aria-label={title}
      onClick={event => event.stopPropagation()} onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose() }
      }}>
      <header className="plugin-drawer-header">
        <h2>{title}</h2>
        <button type="button" className="btn btn-ghost btn-sm" autoFocus onClick={onClose}>Close</button>
      </header>
      {children}
    </section>
  </div>
}

function PluginDetail({ plugin, plugins, brainId, stale, opening, onUse, onChange, onClose }: {
  plugin: PluginInfo; plugins: PluginInfo[] | null; brainId?: string; stale: boolean; opening?: OpenAttempt;
  onUse: () => void; onChange: () => Promise<void>; onClose: () => void
}) {
  const panels = pluginElements(plugin).filter(element => element.kind !== 'settings')
  const activation = plugin.activation
  const error = !plugin.valid || activation?.state === 'error'
  const enabled = activation?.enabled === true && !error
  const rows = plugin.activationByBrain ?? (brainId && activation && activation.state !== 'mixed'
    ? [{ ...activation, state: activation.state, brainId, name: brainId === 'global' ? 'Global Brain' : brainId.slice('project:'.length) }]
    : [])
  const armed = rows.find(row => row.brainId === brainId && row.mode === 'on-use')
  const canManage = plugin.servingAvailable !== false
  const [tab, setTab] = useState<'home' | 'interface' | 'settings' | 'commands' | 'blocks'>('home')
  const [initialCommand, setInitialCommand] = useState<string>()
  const [panelId, setPanelId] = useState(panels[0]?.id)
  const [changing, setChanging] = useState(false)
  const busy = changing || Boolean(opening && !opening.error)
  const [notice, setNotice] = useState<Notice>()
  const [cleanupRetries, setCleanupRetries] = useState<string[]>([])
  const [uninstall, setUninstall] = useState(false)
  const [savedCredentials, setSavedCredentials] = useState<Set<string> | null>(null)
  const panel = panels.find(item => item.id === panelId) ?? panels[0]
  function openCommand(name: string) {
    setInitialCommand(name)
    setTab('commands')
  }
  const declaredCredentials = plugin.secrets || []
  const credentialCount = declaredCredentials.length
  useEffect(() => {
    if (!credentialCount) return
    let disposed = false
    void readSavedPluginCredentials().then(keys => {
      if (!disposed) setSavedCredentials(keys)
    }).catch(() => { if (!disposed) setSavedCredentials(null) })
    return () => { disposed = true }
  }, [plugin.id, credentialCount, tab])
  const credentialLabel = !credentialCount ? 'Dashboard session'
    : !savedCredentials ? 'Credential status unavailable'
    : declaredCredentials.some(secret => secret.required && !savedCredentials.has(secret.key)) ? 'Credential required'
    : declaredCredentials.some(secret => savedCredentials.has(secret.key)) ? 'Saved in Auth' : 'Optional credential'

  async function change(action: BrainPluginActivation | 'share' | 'uninstall', value?: boolean | 'on-use') {
    setChanging(true)
    setNotice(undefined)
    try {
      if (typeof action === 'object') {
        const result = await setPluginActivation(plugin.id, value ?? !action.enabled, [action.brainId])
        const target = result.results?.find(item => item.brainId === action.brainId)
        if (target?.cleanup?.ok === false) {
          setCleanupRetries(current => current.includes(action.brainId) ? current : [...current, action.brainId])
        } else if (result.success || target?.cleanup?.ok === true) {
          setCleanupRetries(current => current.filter(id => id !== action.brainId))
        }
        if (!result.success) {
          setNotice({ text: target?.error ? `${target.name}. ${target.error}` : result.error || 'Could not update activation.', error: true })
        }
      } else {
        const result = action === 'share' ? await setPluginShared(plugin.id, !plugin.shared) : await removePlugin(plugin.id, plugin.scope === 'global')
        if (!result.success) setNotice({ text: result.error || 'Could not update the plugin.', error: true })
        if (action === 'uninstall' && result.success) onClose()
      }
      // The record can persist even when recompilation reports a failure.
      await onChange()
    } finally { setChanging(false) }
  }

  return <section className="plugin-workspace-page" aria-label={plugin.name}>
    <header className="plugin-drawer-header">
      <h1>{plugin.name}</h1>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
    </header>
    <p className="plugin-muted">{plugin.description}</p>
    <dl className="plugin-detail-status">
      <div><dt>Brain activation</dt><dd>
        <span className={`badge ${error ? 'badge-error' : enabled ? 'badge-success' : ''}`}>
          {stale ? 'Unknown' : activation?.state === 'mixed' ? 'Mixed' : error ? 'Error' : activation?.mode === 'on-use' ? 'On use' : enabled ? 'Active' : activation ? 'Off' : 'Unknown'}
        </span>
      </dd></div>
      <div><dt>Authentication</dt><dd>{credentialLabel}</dd></div>
      <div><dt>Provider connection</dt><dd>Unreported</dd></div>
      <div><dt>Installed</dt><dd>v{plugin.version} · {pluginOrigin(plugin)} · {plugin.scope}</dd></div>
    </dl>
    {!!rows.length && <ul className="plugin-folder-list" aria-label="Activation by brain">
      {rows.map(row => <li className="plugin-drawer-actions" key={row.brainId}>
        <span>{row.name}{row.brainId === 'global' && <small className="plugin-muted"> · Shared default</small>}</span>
        {row.state === 'unavailable' || row.state === 'error' ? <span>{row.state === 'error' ? 'Error' : 'Unavailable'}</span> :
          row.brainId.startsWith('project:') ? <select className="select"
            style={{ minHeight: 44, width: 'auto' }}
            aria-label={`${plugin.name} activation for ${row.name}`} aria-busy={busy || undefined}
            disabled={stale || busy || row.required} value={row.mode || (row.enabled ? 'on' : 'off')}
            onChange={event => {
              const mode = event.currentTarget.value
              void change(row, mode === 'on-use' ? mode : mode === 'on')
            }}>
            <option value="off">Off</option>
            <option value="on-use">On use</option>
            <option value="on">On</option>
          </select> :
          <button type="button" role="switch" aria-checked={row.enabled}
            aria-label={rows.length === 1 ? `${plugin.name} activation` : `${plugin.name} activation for ${row.name}`}
            title={row.required ? 'Required plugin' : undefined} className="btn btn-ghost btn-sm"
            disabled={stale || busy || row.required} onClick={() => void change(row)}>
            {stale ? 'Unknown' : busy ? 'Updating…' : row.enabled ? 'On' : 'Off'}
          </button>}
        {!row.enabled && cleanupRetries.includes(row.brainId) && <button type="button"
          className="btn btn-ghost btn-sm" disabled={stale || busy}
          aria-label={`Retry cleanup for ${row.name}`} onClick={() => void change(row, false)}>Retry cleanup</button>}
      </li>)}
    </ul>}
    {stale && <p role="alert">The installed state could not be refreshed.</p>}
    {error && <p role="alert">{plugin.errors[0] || 'The activation policy could not be read.'}</p>}
    {opening?.error && !enabled && !notice && <p role="alert">{opening.error}</p>}
    {notice && <p role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
    {!brainId ? <p className="plugin-muted">Select one brain to open this plugin’s tools.</p> : <>
    <nav className="plugin-drawer-actions" aria-label={`${plugin.name} views`}>
      <button className={`btn ${tab === 'home' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={tab === 'home'}
        onClick={() => setTab('home')}>Home</button>
      {panel && enabled && <button className={`btn ${tab === 'interface' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={tab === 'interface'}
        onClick={() => setTab('interface')}>Interface</button>}
      {enabled && !stale && <button className={`btn ${tab === 'blocks' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={tab === 'blocks'}
        onClick={() => setTab('blocks')}>Blocks</button>}
      {canManage && <button className={`btn ${tab === 'settings' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={tab === 'settings'}
        onClick={() => setTab('settings')}>Settings</button>}
      {plugin.cli && <button className={`btn ${tab === 'commands' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={tab === 'commands'}
        onClick={() => setTab('commands')}>Commands</button>}
    </nav>
    {tab === 'home' && (enabled && !stale
      ? <PluginHome plugin={plugin} plugins={plugins} brainId={brainId} onCommand={openCommand} />
      : armed && !stale ? <div className="plugin-drawer-actions">
        <span className="plugin-muted">This plugin activates when you open it.</span>
        <button type="button" className="btn btn-primary" disabled={busy}
          onClick={onUse}>{busy ? 'Opening…' : 'Open plugin'}</button>
      </div> : <p className="plugin-muted">An active plugin is needed to open its Home tools.</p>)}
    {tab === 'interface' && enabled && panel && <>
      {panels.length > 1 && <label>Panel
        <select className="select" value={panel.id} onChange={event => setPanelId(event.target.value)}>
          {panels.map(item => <option key={item.id} value={item.id}>{item.description || item.id}</option>)}
        </select>
      </label>}
      <PluginPanel key={panel.id} plugin={plugin} elementId={panel.id} brainId={brainId} readOnly={stale} />
    </>}
    {tab === 'settings' && canManage && <>
      {!panel && <p className="plugin-muted">This package has no installed workspace panel.</p>}
      {plugin.valid && <PluginSettings plugin={plugin} />}
      <details>
        <summary>Manage installation</summary>
        <div className="plugin-drawer-actions">
          <button className="btn btn-ghost" disabled={busy || stale || !plugin.valid} onClick={() => void change('share')}>
            {plugin.shared ? 'Stop sharing' : 'Share on mesh'}
          </button>
          {!uninstall ? <button className="btn btn-ghost" disabled={busy || stale || activation?.required}
            onClick={() => setUninstall(true)}>Uninstall…</button>
            : <button className="btn btn-ghost" disabled={busy || stale} onClick={() => void change('uninstall')}>
              Confirm uninstall
            </button>}
        </div>
      </details>
    </>}
    {tab === 'commands' && plugin.cli && <ScopedPluginCommands key={plugin.sha256} plugin={plugin} brainId={brainId}
      enabled={enabled && !stale} initialCommand={initialCommand} />}
    {tab === 'blocks' && enabled && !stale && <PluginChunkLibrary key={`${plugin.id}:${brainId}`}
      plugin={plugin} brainId={brainId} />}
    </>}
  </section>
}

function PluginInstaller({ onChange, onClose }: { onChange: () => Promise<void>; onClose: () => void }) {
  const [source, setSource] = useState('')
  const [bundled, setBundled] = useState<BundledPlugin[]>([])
  const [peers, setPeers] = useState<PeersResponse | null>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>()
  useEffect(() => {
    let disposed = false
    void fetchBundledPlugins().then(result => { if (!disposed) setBundled(result) })
    return () => { disposed = true }
  }, [])

  async function install() {
    setBusy(true)
    setNotice(undefined)
    try {
      const result = await installPlugin({ source: source.trim(), global: true })
      setNotice({ text: result.message || result.error || (result.success ? 'Plugin installed.' : 'Install failed.'), error: !result.success })
      if (result.success) {
        setSource('')
        setBundled(await fetchBundledPlugins())
      }
      await onChange()
    } finally { setBusy(false) }
  }

  return <PluginDialog title="Browse and install plugins" onClose={onClose}>
    <p className="plugin-muted">Installs into the shared plugin folder on this host.</p>
    <form className="plugin-drawer-form" onSubmit={event => { event.preventDefault(); void install() }}>
      <label>Plugin source<input className="input" value={source} onChange={event => setSource(event.target.value)}
        placeholder="Plugin ID, folder, Git URL, or peer link" required /></label>
      <button type="submit" className="btn btn-primary" disabled={busy || !source.trim()}>Install</button>
    </form>
    {notice && <p role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
    <details><summary>Bundled plugins</summary>
      <ul className="plugin-folder-list">{bundled.map(plugin => <li key={plugin.id}>
        <button className="btn btn-ghost" disabled={busy || plugin.installed} onClick={() => setSource(plugin.id)}>
          {plugin.name}{plugin.installed ? ' (installed)' : ''}
        </button>
      </li>)}</ul>
    </details>
    <details><summary>Mesh peers</summary>
      <button className="btn btn-ghost" onClick={async () => setPeers(await fetchPeerPlugins())}>Load shared plugins</button>
      {peers === null && <p role="status">Could not load mesh peers.</p>}
      {peers?.peers.map(peer => <div key={peer.hostname}>
        <p>{peer.hostname} · {peer.status === 'ok' ? 'online' : peer.error || peer.status}</p>
        <ul className="plugin-folder-list">{peer.plugins.map(plugin => <li key={plugin.id}>
          <button className="btn btn-ghost" disabled={busy || plugin.same_as_installed}
            onClick={() => setSource(`peer:${peer.hostname}/${plugin.id}`)}>{plugin.name}</button>
        </li>)}</ul>
      </div>)}
    </details>
  </PluginDialog>
}
