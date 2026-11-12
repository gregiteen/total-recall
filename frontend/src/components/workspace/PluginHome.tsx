import { useEffect, useState } from 'react'
import { findWorkspaceChunks, readWorkspaceComposition, type WorkspaceChunk } from '../../api/workspace-drawers'
import type { PluginInfo } from '../../api/plugins'
import { drawerPanels, PublishedChunk } from './DrawerLayout'
import { PluginPanel } from '../plugins/PluginPanel'
import { scopedPluginOperations } from '../plugins/scoped-plugin-operations'
import { usePluginDesign } from './usePluginDesign'

export function PluginHome({ plugin, plugins, brainId, onCommand }: {
  plugin: PluginInfo; plugins: PluginInfo[] | null; brainId?: string; onCommand: (name: string) => void
}) {
  const [defaults, setDefaults] = useState<WorkspaceChunk[]>([])
  const [published, setPublished] = useState<{ chunks: WorkspaceChunk[]; version: string | null }>()
  const [loading, setLoading] = useState(true)
  const liveDesign = usePluginDesign(plugin.id, brainId)
  const designCss = liveDesign?.design?.css ?? ''
  const panels = drawerPanels(plugin)
  const home = (plugin.manifest?.ui as { home?: string } | undefined)?.home || plugin.ui?.home
  const panel = panels.find(element => element.id === home) || panels[0]
  const operations = scopedPluginOperations(plugin)
  const chunks = published?.chunks.length ? published.chunks : defaults

  useEffect(() => {
    const controller = new AbortController()
    void findWorkspaceChunks('page', '', controller.signal, plugin.id, brainId).then(({ chunks }) => {
      if (controller.signal.aborted) return
      const ownerDefault = panel?.id && chunks.find(chunk => chunk.panel === panel.id)
      setDefaults(ownerDefault ? [ownerDefault] : chunks.slice(0, 1))
    }).catch(() => {}).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [plugin.id, panel?.id, brainId])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      try {
        const next = await readWorkspaceComposition(plugin.id, controller.signal, brainId)
        if (!controller.signal.aborted) {
          setPublished(current => current?.version === next.version &&
            current.chunks.map(chunk => chunk.sha256).join() === next.chunks.map(chunk => chunk.sha256).join() ? current : next)
        }
      } catch { /* The owner default remains available on an older or unreachable server. */ }
      finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 2500)
      }
    }
    void refresh()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [plugin.id, brainId])

  return <div className="plugin-home">
    {loading && <p role="status">Loading published blocks…</p>}
    {liveDesign?.issue && <p role="status">{liveDesign.issue}</p>}
    {!loading && chunks.map(chunk =>
      <div key={`${chunk.key}:${chunk.sha256}`} className="plugin-home">
        <PublishedChunk name={chunk.key} side="page" plugins={plugins} brainId={brainId} design={chunk.plugin === plugin.id ? liveDesign?.design : undefined}
          designOwner={chunk.plugin === plugin.id ? undefined : chunk.plugin} />
      </div>
    )}
    {!loading && !published?.chunks.length && panel && !chunks.some(chunk => chunk.panel === panel.id) &&
      <PluginPanel plugin={plugin} elementId={panel.id} designCss={designCss} brainId={brainId} />}
    {!published?.chunks.length && !chunks.some(chunk => chunk.operations?.length) && operations.length > 0 && <section aria-label="Plugin operations">
      <h2>Start a workflow</h2>
      <ul className="plugin-home-operations">
        {operations.slice(0, 6).map(command => <li key={command.name}>
          <button type="button" className="btn btn-ghost" onClick={() => onCommand(command.name)}>{command.name}</button>
          {command.description && <span>{command.description}</span>}
        </li>)}
      </ul>
    </section>}
    {!panel && !loading && !chunks.length && <p className="plugin-muted">This plugin has yet to publish a dedicated Home interface.</p>}
  </div>
}
