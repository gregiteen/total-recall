import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import {
  fetchBundledPlugins, fetchPeerPlugins, fetchPlugins, installPlugin, removePlugin,
  runPluginCommand, setPluginActivation, setPluginShared, type BundledPlugin,
  type PeersResponse, type PluginInfo
} from '../../api/plugins'
import { PluginPanel, pluginElements } from './PluginPanel'
import { PluginSettings } from './PluginSettings'
import { PluginChunkLibrary } from '../workspace/PluginChunkLibrary'

type Notice = { text: string; error?: boolean }

interface WorkspaceProps {
  activeBrainId: string
  renderShell: (folder: ReactNode, page: ReactNode, plugins: PluginInfo[] | null) => ReactNode
  onOpenPlugin: () => void
}

function pluginOrigin(plugin: PluginInfo) {
  if (plugin.core) return 'Core'
  if (plugin.source.kind === 'bundled') return 'Bundled'
  if (plugin.source.kind === 'peer' || plugin.source.kind === 'public') return 'Shared'
  return 'User'
}

export default function PluginWorkspace({ activeBrainId, renderShell, onOpenPlugin }: WorkspaceProps) {
  const [params, setParams] = useSearchParams()
  const { pathname } = useLocation()
  const [expanded, setExpanded] = useState<boolean>()
  const [plugins, setPlugins] = useState<PluginInfo[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [browse, setBrowse] = useState(false)
  const request = useRef(0)
  const id = pathname === '/plugins' ? null : params.get('plugin')
  const open = expanded ?? Boolean(id || params.has('plugins'))
  const selected = id ? plugins?.find(plugin => plugin.id === id || plugin.id === `tr-plugin-${id}` || plugin.name === id) : undefined

  const refresh = useCallback(async () => {
    const current = ++request.current
    try {
      const installed = await fetchPlugins()
      if (request.current !== current) return
      setPlugins([...installed].sort((a, b) => a.name.localeCompare(b.name)))
      setLoadError(false)
    } catch {
      if (request.current !== current) return
      setLoadError(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => { request.current++ }
  }, [activeBrainId, refresh])

  function select(pluginId: string | null) {
    const next = new URLSearchParams(params)
    if (pluginId) next.set('plugin', pluginId)
    else next.delete('plugin')
    setParams(next, { replace: !pluginId })
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
          Could not load plugins. <button className="btn btn-ghost btn-sm" onClick={() => void refresh()}>Retry</button>
        </div> : plugins === null ? <p className="plugin-folder-message" role="status">Loading plugins…</p> :
          <ul className="plugin-folder-list" aria-label="Installed plugins">
            {plugins.map(plugin => <li key={plugin.id}>
              <button type="button" className={`nav-link plugin-folder-item ${selected?.id === plugin.id ? 'active' : ''}`}
                aria-current={selected?.id === plugin.id || undefined}
                onClick={() => { select(plugin.id); onOpenPlugin() }}>
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
  if (selected) page = <PluginDetail key={selected.id} plugin={selected} stale={loadError}
    onClose={() => select(null)} onChange={refresh} />
  else if (id && (loadError || plugins)) page = <section className="plugin-workspace-page" aria-label="Plugin unavailable">
    <p role="alert">{loadError ? 'Could not load plugins.' : `No installed plugin matches ${id}.`}</p>
    <button type="button" className="btn btn-ghost" onClick={() => select(null)}>Close</button>
  </section>

  return <>
    {renderShell(folder, page, plugins)}
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

function PluginDetail({ plugin, stale, onChange, onClose }: {
  plugin: PluginInfo; stale: boolean; onChange: () => Promise<void>; onClose: () => void
}) {
  const panels = pluginElements(plugin).filter(element => !['card', 'card-face', 'settings'].includes(element.kind))
  const activation = plugin.activation
  const error = !plugin.valid || activation?.state === 'error'
  const enabled = activation?.enabled === true && !error
  const [tab, setTab] = useState<'interface' | 'settings' | 'commands' | 'blocks'>(enabled && panels.length ? 'interface' : 'settings')
  const [panelId, setPanelId] = useState(panels[0]?.id)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>()
  const [uninstall, setUninstall] = useState(false)
  const panel = panels.find(item => item.id === panelId) ?? panels[0]

  async function change(action: 'activation' | 'share' | 'uninstall') {
    setBusy(true)
    setNotice(undefined)
    try {
      let result
      if (action === 'activation') result = await setPluginActivation(plugin.id, !enabled)
      else if (action === 'share') result = await setPluginShared(plugin.id, !plugin.shared)
      else result = await removePlugin(plugin.id, plugin.scope === 'global')
      if (!result.success) setNotice({ text: result.error || 'Could not update the plugin.', error: true })
      if (action === 'uninstall' && result.success) onClose()
      // The record can persist even when recompilation reports a failure.
      await onChange()
    } finally { setBusy(false) }
  }

  return <section className="plugin-workspace-page" aria-label={plugin.name}>
    <header className="plugin-drawer-header">
      <h1>{plugin.name}</h1>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
    </header>
    <p className="plugin-muted">{plugin.description}</p>
    <dl className="plugin-detail-status">
      <div><dt>Server activation</dt><dd>
        <span className={`badge ${error ? 'badge-error' : enabled ? 'badge-success' : ''}`}>
          {stale ? 'Unknown' : error ? 'Error' : enabled ? 'Active' : activation ? 'Off' : 'Unknown'}
        </span>
        <button type="button" role="switch" aria-checked={enabled} aria-label={`${plugin.name} activation`}
          title={activation?.required ? 'Required plugin' : undefined} className="btn btn-ghost btn-sm"
          disabled={stale || busy || !activation || error || activation.required}
          onClick={() => void change('activation')}>{busy ? 'Updating…' : enabled ? 'On' : 'Off'}</button>
      </dd></div>
      <div><dt>Authentication</dt><dd>{plugin.secrets?.some(secret => secret.required) ? 'Credential required'
        : plugin.secrets?.length ? 'Optional credential' : 'None declared'}</dd></div>
      <div><dt>Provider connection</dt><dd>Unreported</dd></div>
      <div><dt>Installed</dt><dd>v{plugin.version} · {pluginOrigin(plugin)} · {plugin.scope}</dd></div>
    </dl>
    {stale && <p role="alert">The installed state could not be refreshed.</p>}
    {error && <p role="alert">{plugin.errors[0] || 'The activation policy could not be read.'}</p>}
    {notice && <p role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
    <nav className="plugin-drawer-actions" aria-label={`${plugin.name} views`}>
      {panel && <button className={`btn ${tab === 'interface' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={tab === 'interface'}
        onClick={() => setTab('interface')}>Interface</button>}
      {enabled && !stale && <button className={`btn ${tab === 'blocks' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={tab === 'blocks'}
        onClick={() => setTab('blocks')}>Blocks</button>}
      <button className={`btn ${tab === 'settings' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={tab === 'settings'}
        onClick={() => setTab('settings')}>Settings</button>
      {plugin.cli && <button className={`btn ${tab === 'commands' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={tab === 'commands'}
        onClick={() => setTab('commands')}>Commands</button>}
    </nav>
    {tab === 'interface' && panel && <>
      {panels.length > 1 && <label>Panel
        <select className="select" value={panel.id} onChange={event => setPanelId(event.target.value)}>
          {panels.map(item => <option key={item.id} value={item.id}>{item.description || item.id}</option>)}
        </select>
      </label>}
      <PluginPanel key={panel.id} plugin={plugin} elementId={panel.id} readOnly={!enabled || stale} />
    </>}
    {tab === 'settings' && <>
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
    {tab === 'commands' && plugin.cli && <PluginCommands plugin={plugin} enabled={enabled && !stale} />}
    {tab === 'blocks' && enabled && !stale && <PluginChunkLibrary plugin={plugin} />}
  </section>
}

function PluginCommands({ plugin, enabled }: { plugin: PluginInfo; enabled: boolean }) {
  const commands = plugin.cli?.subcommands ?? []
  const [command, setCommand] = useState(commands[0]?.name ?? '')
  const [args, setArgs] = useState('')
  const [output, setOutput] = useState<Notice>()
  const [busy, setBusy] = useState(false)
  return <form className="plugin-drawer-form" onSubmit={async event => {
    event.preventDefault()
    setBusy(true)
    setOutput(undefined)
    try {
      const result = await runPluginCommand(plugin.id, command, args.trim().split(/\s+/).filter(Boolean))
      setOutput({ text: result.output || result.error || (result.success ? 'Command completed.' : 'Command failed.'), error: !result.success })
    } finally { setBusy(false) }
  }}>
    {commands.length > 0 && <label>Command
      <select className="select" value={command} onChange={event => setCommand(event.target.value)}>
        {commands.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
      </select>
    </label>}
    <label>Arguments<input className="input" value={args} onChange={event => setArgs(event.target.value)} /></label>
    <button type="submit" className="btn btn-primary" disabled={!enabled || busy}>Run command</button>
    {output && <pre className="plugin-command-output" role={output.error ? 'alert' : 'status'}>{output.text}</pre>}
  </form>
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
      const result = await installPlugin({ source: source.trim() })
      setNotice({ text: result.message || result.error || (result.success ? 'Plugin installed.' : 'Install failed.'), error: !result.success })
      if (result.success) {
        setSource('')
        setBundled(await fetchBundledPlugins())
      }
      await onChange()
    } finally { setBusy(false) }
  }

  return <PluginDialog title="Browse and install plugins" onClose={onClose}>
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
