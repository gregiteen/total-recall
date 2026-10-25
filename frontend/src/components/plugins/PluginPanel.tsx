import { useEffect, useRef, useState } from 'react'
import type { PluginInfo } from '../../api/plugins'
import { runPluginCommand } from '../../api/plugins'
import { apiFetch, API_BASE } from '../../api/_base'
import { pluginFrameDocument, allowedFrameCommand, pluginCommandTimeouts, sanitizePluginScreens } from './plugin-frame'
import type { PluginScreen } from './plugin-frame'

export interface PluginElement {
  id: string
  kind: string
  tag: string
  module: string
  description?: string
}

export function pluginElements(plugin: PluginInfo): PluginElement[] {
  return (plugin.manifest?.ui as { elements?: PluginElement[] } | undefined)?.elements || plugin.ui?.elements || []
}

/** Loads owner code; no plugin identities or provider behavior belong here. */
export function PluginPanel({ plugin, elementId, readOnly = false }: { plugin: PluginInfo; elementId?: string; readOnly?: boolean }) {
  const elements = pluginElements(plugin).filter(element => element.kind !== 'settings' && (!elementId || element.id === elementId))
  const [selected, setSelected] = useState(elements[0]?.id || '')
  const [error, setError] = useState('')
  const frame = useRef<HTMLIFrameElement>(null)
  const [document, setDocument] = useState('')
  const [height, setHeight] = useState(240)

  useEffect(() => {
    let disposed = false
    setError('')
    setDocument('')
    const channel = crypto.randomUUID()
    const commands = plugin.manifest?.cli as { subcommands?: Array<{ name: string; effect?: string; args?: Array<{ secret?: boolean; type?: string; flag?: string }> }> } | undefined
    const readCommands = new Set((commands?.subcommands || []).filter(command => command.effect === 'read').map(command => command.name))
    const allowed = new Set((plugin.cli?.subcommands || []).filter(command => !readOnly || readCommands.has(command.name)).map(command => command.name))
    const secretCommands = new Set((commands?.subcommands || []).filter(command => {
      const secrets = command.args?.filter(arg => arg.secret === true) || []
      return secrets.length === 1 && secrets[0].type === 'string' && secrets[0].flag === undefined
    }).map(command => command.name))
    const element = elements.find(item => item.id === selected) || elements[0]
    let ownerScreens: PluginScreen[] = []
    const showScreen = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (disposed || element?.kind !== 'card' || detail?.pluginId !== plugin.id || !ownerScreens.some(screen => screen.id === detail.screen)) return
      frame.current?.contentWindow?.postMessage({ channel, type: 'show-screen', screen: detail.screen }, '*')
    }
    let active = 0
    const message = async (event: MessageEvent) => {
      if (disposed || event.source !== frame.current?.contentWindow || event.origin !== 'null' || event.data?.channel !== channel) return
      const data = event.data
      if (data.type === 'screens') {
        if (element?.kind === 'card') {
          ownerScreens = sanitizePluginScreens(data.screens)
          window.dispatchEvent(new CustomEvent('plugin-screens', { detail: { pluginId: plugin.id, screens: ownerScreens } }))
        }
        return
      }
      if (data.type === 'screen-changed') {
        if (element?.kind === 'card' && ownerScreens.some(screen => screen.id === data.screen))
          window.dispatchEvent(new CustomEvent('plugin-screen-changed', { detail: { pluginId: plugin.id, screen: data.screen } }))
        return
      }
      if (data.type === 'contextmenu') window.dispatchEvent(new CustomEvent('plugin-context-menu', { detail: { pluginId: plugin.id } }))
      if (data.type === 'height' && Number.isFinite(data.height)) setHeight(Math.max(128, Math.min(1000, data.height)))
      if (data.type === 'error') setError('Could not open the plugin interface')
      if (data.type !== 'run') return
      const target = event.source as Window
      const reply = (result?: unknown, error?: string) => { if (!disposed) target.postMessage({ channel, type: 'result', requestId: data.requestId, result, error }, '*') }
      if (!allowedFrameCommand(data, allowed, secretCommands) || active >= 4) { reply(undefined, 'Operation is not available'); return }
      active++
      window.dispatchEvent(new CustomEvent('plugin-command-activity', { detail: { pluginId: plugin.id, requestId: data.requestId, command: data.subcommand, running: true } }))
      try {
        const result = data.stdin !== undefined
          ? await runPluginCommand(plugin.id, data.subcommand, [...data.args, '--json'], { stdin: data.stdin })
          : await runPluginCommand(plugin.id, data.subcommand, [...data.args, '--json'])
        if (!result.success) { reply(undefined, data.stdin !== undefined ? 'Credential operation failed' : result.output || result.error || 'Operation failed'); return }
        reply(data.stdin !== undefined ? { ok: true } : JSON.parse(result.output || '{}'))
      } catch { reply(undefined, 'Operation failed') }
      finally {
        active--
        window.dispatchEvent(new CustomEvent('plugin-command-activity', { detail: { pluginId: plugin.id, requestId: data.requestId, command: data.subcommand, running: false } }))
      }
    }
    window.addEventListener('message', message)
    window.addEventListener('plugin-show-screen', showScreen)
    const dispose = () => {
      disposed = true
      window.removeEventListener('message', message)
      window.removeEventListener('plugin-show-screen', showScreen)
      if (element?.kind === 'card') window.dispatchEvent(new CustomEvent('plugin-screens', { detail: { pluginId: plugin.id, screens: [] } }))
    }
    if (!element) return dispose
    const load = async () => {
      const response = await apiFetch(`${API_BASE}/api/plugins/${encodeURIComponent(plugin.id)}/ui/${encodeURIComponent(element.id)}`)
      if (!response.ok) throw new Error(`Could not open ${plugin.name} (${response.status})`)
      const source = await response.text()
      if (source.length > 1024 * 1024) throw new Error('The plugin interface is too large')
      if (disposed) return
      const styles = getComputedStyle(window.document.documentElement)
      const theme: Record<string, string> = {}
      for (const name of ['--text-primary', '--text-secondary', '--text-tertiary', '--bg-primary', '--bg-secondary', '--border', '--accent', '--font-sans', '--color-text', '--color-surface', '--color-border', '--spacing-md', '--radius-md']) theme[name] = styles.getPropertyValue(name)
      setDocument(pluginFrameDocument(source, element.tag, channel, theme, plugin.id, pluginCommandTimeouts(plugin.manifest), [...allowed]))
    }
    load().catch(err => { if (!disposed) setError(err.message) })
    return dispose
  }, [plugin.id, selected, plugin.sha256, elementId, readOnly])

  return <section>
    {elements.length > 1 && <nav style={{ display: 'flex', gap: 8 }}>
      {elements.map(element => <button key={element.id} className="btn btn-sm" onClick={() => setSelected(element.id)} aria-pressed={selected === element.id}>{element.description || element.id}</button>)}
    </nav>}
    {error && <div role="alert" className="alert alert-error">{error}</div>}
    {elements.length === 0 && <p>This plugin has not supplied its interface yet.</p>}
    {document && <iframe ref={frame} title={`${plugin.name} interface`} sandbox="allow-scripts" referrerPolicy="no-referrer"
      allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'"
      srcDoc={document} style={{ width: '100%', height, border: 0 }} />}
  </section>
}
