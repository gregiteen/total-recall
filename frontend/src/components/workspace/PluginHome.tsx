import { useEffect, useState } from 'react'
import { findWorkspaceChunks, suggestWorkspaceChunks, type WorkspaceChunk } from '../../api/workspace-drawers'
import type { PluginInfo } from '../../api/plugins'
import { drawerPanels, PublishedChunk } from './DrawerLayout'
import { PluginPanel } from '../plugins/PluginPanel'

function words(text: string) {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
}

export function PluginHome({ plugin, decisionAvailable, onCommand }: {
  plugin: PluginInfo; decisionAvailable: boolean; onCommand: (name: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [intent, setIntent] = useState({ text: '', decision: false, revision: 0 })
  const [chunks, setChunks] = useState<WorkspaceChunk[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const panels = drawerPanels(plugin)
  const home = (plugin.manifest?.ui as { home?: string } | undefined)?.home || plugin.ui?.home
  const panel = panels.find(element => element.id === home) || panels[0]
  const operations = plugin.cli?.subcommands ?? []
  const terms = words(intent.text)
  const matches = operations.map(command => {
    const name = words(command.name)
    const description = words(command.description || '')
    const score = [...terms].reduce((sum, word) => sum + (name.has(word) ? 4 : description.has(word) ? 1 : 0), 0)
    return { command, score }
  }).filter(match => terms.size === 0 || match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setNotice('')
      try {
        if (intent.decision) {
          const { chunks, selection } = await suggestWorkspaceChunks(plugin.id, intent.text, controller.signal)
          if (controller.signal.aborted) return
          const byKey = new Map(chunks.map(chunk => [chunk.key, chunk]))
          const chosen = selection.keys.flatMap(key => {
            const chunk = byKey.get(key)
            return chunk ? [chunk] : []
          })
          setChunks(chosen)
          if (selection.source === 'decision') {
            setNotice(chosen.length ? 'Decision assembled this view.' : 'Decision found no suitable published block.')
          } else if (selection.reason === 'decision-unavailable') {
            setNotice('Decision is unavailable. Showing the closest local match.')
          }
        } else {
          const { chunks } = await findWorkspaceChunks('page', intent.text, controller.signal, plugin.id)
          if (!controller.signal.aborted) {
            const ownerDefault = !intent.text && panel?.id && chunks.find(chunk => chunk.panel === panel.id)
            setChunks(ownerDefault ? [ownerDefault] : chunks.slice(0, intent.text ? 3 : 1))
          }
        }
      } catch {
        if (controller.signal.aborted) return
        setChunks([])
        setNotice('Published blocks are unavailable. You can still use the plugin’s installed tools.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [plugin.id, intent, panel?.id])

  function generate(decision: boolean) {
    setIntent(current => ({ text: draft.trim(), decision, revision: current.revision + 1 }))
  }

  return <div className="plugin-home">
    <form className="plugin-home-focus" onSubmit={event => { event.preventDefault(); generate(false) }}>
      <label>What do you want to do?
        <input className="input" value={draft} maxLength={1024}
          placeholder={plugin.use_cases?.[0] || `Find a workflow in ${plugin.name}`}
          onChange={event => setDraft(event.target.value)} />
      </label>
      <div className="plugin-drawer-actions">
        <button type="submit" className="btn btn-primary" disabled={loading || !draft.trim()}>Build view</button>
        {decisionAvailable && <button type="button" className="btn btn-ghost" disabled={loading || !draft.trim()}
          onClick={() => generate(true)}>Choose with Decision</button>}
        {intent.text && <button type="button" className="btn btn-ghost" onClick={() => {
          setDraft('')
          setIntent(current => ({ text: '', decision: false, revision: current.revision + 1 }))
        }}>Reset Home</button>}
      </div>
      {decisionAvailable && <small>Decision sends this request and matching block descriptions to the configured model.</small>}
    </form>
    {loading && <p role="status">Loading published blocks…</p>}
    {notice && <p role="status">{notice}</p>}
    {!loading && !notice && intent.text && !chunks.length &&
      <p className="plugin-muted">No published block matches this request.</p>}
    {!loading && chunks.map(chunk => {
      const actions = operations.filter(command => chunk.operations?.includes(command.name))
      return <div key={`${chunk.key}:${intent.revision}`} className="plugin-home">
        <PublishedChunk name={chunk.key} side="page" plugins={[plugin]} />
        {actions.length > 0 && <div className="plugin-drawer-actions" aria-label={`${chunk.title} operations`}>
          {actions.map(command => <button type="button" className="btn btn-ghost"
            key={command.name} onClick={() => onCommand(command.name)}>{command.description || command.name}</button>)}
        </div>}
      </div>
    })}
    {!loading && panel && !chunks.some(chunk => chunk.panel === panel.id) &&
      <PluginPanel plugin={plugin} elementId={panel.id} />}
    {matches.length > 0 && <section aria-label="Plugin operations">
      <h2>{intent.text ? 'Matching operations' : 'Start a workflow'}</h2>
      <ul className="plugin-home-operations">
        {matches.map(({ command }) => <li key={command.name}>
          <button type="button" className="btn btn-ghost" onClick={() => onCommand(command.name)}>{command.name}</button>
          {command.description && <span>{command.description}</span>}
        </li>)}
      </ul>
    </section>}
    {!panel && !loading && !chunks.length && <p className="plugin-muted">This plugin has yet to publish a dedicated Home interface.</p>}
  </div>
}
