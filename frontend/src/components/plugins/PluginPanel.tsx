import { useEffect, useRef, useState } from 'react'
import type { PluginInfo } from '../../api/plugins'
import { runPluginCommand } from '../../api/plugins'
import { apiFetch, API_BASE } from '../../api/_base'

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
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let disposed = false
    let mounted: HTMLElement | undefined
    setError('')
    const element = elements.find(item => item.id === selected)
    if (!element) return
    const load = async () => {
      const response = await apiFetch(`${API_BASE}/api/plugins/${encodeURIComponent(plugin.id)}/ui/${encodeURIComponent(element.id)}`)
      if (!response.ok) throw new Error(`Could not open ${plugin.name} (${response.status})`)
      // Fetch through the authenticated, selected-brain transport before import.
      // Owner modules must be self-contained browser bundles.
      const url = URL.createObjectURL(new Blob([await response.text()], { type: 'text/javascript' }))
      try { await import(/* @vite-ignore */ url) } finally { URL.revokeObjectURL(url) }
      if (disposed) return
      if (!customElements.get(element.tag)) throw new Error('The plugin did not register its declared interface')
      mounted = document.createElement(element.tag)
      Object.assign(mounted, {
        host: {
          pluginId: plugin.id,
          async run(subcommand: string, args: string[] = []) {
            const result = await runPluginCommand(plugin.id, subcommand, [...args, '--json'])
            if (!result.success) throw new Error(result.error || result.output || 'Operation failed')
            try { return JSON.parse(result.output || '{}') }
            catch { throw new Error('The plugin returned an invalid response') }
          }
        }
      })
      container.current?.replaceChildren(mounted)
    }
    load().catch(err => { if (!disposed) setError(err.message) })
    return () => { disposed = true; mounted?.remove(); container.current?.replaceChildren() }
  }, [plugin.id, selected, plugin.sha256])

  return <section>
    {elements.length > 1 && <nav style={{ display: 'flex', gap: 8 }}>
      {elements.map(element => <button key={element.id} className="btn btn-sm" onClick={() => setSelected(element.id)} aria-pressed={selected === element.id}>{element.description || element.id}</button>)}
    </nav>}
    {error && <div role="alert" className="alert alert-error">{error}</div>}
    {elements.length === 0 && <p>This plugin has not supplied its interface yet.</p>}
    <div ref={container} />
  </section>
}
