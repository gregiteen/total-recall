import { useEffect, useRef, useState } from 'react'
import type { PluginInfo } from '../../api/plugins'
import { runPluginCommand } from '../../api/plugins'
import { apiFetch, API_BASE } from '../../api/_base'
import { pluginFrameDocument, allowedFrameCommand } from './plugin-frame'

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
export function PluginPanel({ plugin }: { plugin: PluginInfo }) {
  const elements = pluginElements(plugin).filter(element => element.kind !== 'settings')
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
    const allowed = new Set(plugin.cli?.subcommands.map(command => command.name) || [])
    let active = 0
    const message = async (event: MessageEvent) => {
      if (disposed || event.source !== frame.current?.contentWindow || event.origin !== 'null' || event.data?.channel !== channel) return
      const data = event.data
      if (data.type === 'height' && Number.isFinite(data.height)) setHeight(Math.max(128, Math.min(1000, data.height)))
      if (data.type === 'error') setError('Could not open the plugin interface')
      if (data.type !== 'run') return
      const target = event.source as Window
      const reply = (result?: unknown, error?: string) => { if (!disposed) target.postMessage({ channel, type: 'result', requestId: data.requestId, result, error }, '*') }
      if (!allowedFrameCommand(data, allowed) || active >= 4) { reply(undefined, 'Operation is not available'); return }
      active++
      try {
        const result = await runPluginCommand(plugin.id, data.subcommand, [...data.args, '--json'])
        if (!result.success) throw new Error('Operation failed')
        reply(JSON.parse(result.output || '{}'))
      } catch { reply(undefined, 'Operation failed') }
      finally { active-- }
    }
    window.addEventListener('message', message)
    const element = elements.find(item => item.id === selected)
    if (!element) return () => { disposed = true; window.removeEventListener('message', message) }
    const load = async () => {
      const response = await apiFetch(`${API_BASE}/api/plugins/${encodeURIComponent(plugin.id)}/ui/${encodeURIComponent(element.id)}`)
      if (!response.ok) throw new Error(`Could not open ${plugin.name} (${response.status})`)
      const source = await response.text()
      if (source.length > 1024 * 1024) throw new Error('The plugin interface is too large')
      if (disposed) return
      const styles = getComputedStyle(window.document.documentElement)
      const theme: Record<string, string> = {}
      for (const name of ['--text-primary', '--text-secondary', '--text-tertiary', '--bg-primary', '--bg-secondary', '--border', '--accent', '--font-sans', '--color-text', '--color-surface', '--color-border', '--spacing-md', '--radius-md']) theme[name] = styles.getPropertyValue(name)
      setDocument(pluginFrameDocument(source, element.tag, channel, theme, plugin.id))
    }
    load().catch(err => { if (!disposed) setError(err.message) })
    return () => { disposed = true; window.removeEventListener('message', message) }
  }, [plugin.id, selected, plugin.sha256])

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
