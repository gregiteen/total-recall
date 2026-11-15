import { useEffect, useState } from 'react'
import { readPluginDesign, type PluginDesign } from '../../api/workspace-drawers'

export function refreshPluginDesign(pluginId: string, brainId: string) {
  window.dispatchEvent(new CustomEvent('workspace-design-changed', { detail: { pluginId, brainId } }))
}

export function usePluginDesign(pluginId: string | undefined, brainId?: string) {
  const [current, setCurrent] = useState<{ pluginId: string; brainId?: string; design?: PluginDesign; issue?: string }>()
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.pluginId === pluginId && detail?.brainId === brainId) setRefreshKey(key => key + 1)
    }
    window.addEventListener('workspace-design-changed', changed)
    return () => window.removeEventListener('workspace-design-changed', changed)
  }, [pluginId, brainId])
  useEffect(() => {
    if (!pluginId) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    let revision: string | null = null
    const refresh = async () => {
      try {
        const result = await readPluginDesign(pluginId, revision, controller.signal, brainId)
        if (controller.signal.aborted) return
        if ('unchanged' in result) {
          setCurrent(current => current?.issue ? { ...current, issue: undefined } : current)
        } else {
          revision = result.revision
          setCurrent(current => current?.pluginId === pluginId && current.brainId === brainId && current.design?.revision === result.revision && !current.issue
            ? current : { pluginId, brainId, design: result })
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          const issue = error instanceof Error ? error.message : 'Could not refresh the plugin design.'
          setCurrent(current => ({ pluginId, brainId, design: current?.pluginId === pluginId && current.brainId === brainId ? current.design : undefined, issue }))
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 2500)
      }
    }
    void refresh()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [pluginId, brainId, refreshKey])
  return current?.pluginId === pluginId && current?.brainId === brainId ? current : undefined
}
