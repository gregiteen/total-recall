import { useEffect, useState } from 'react'
import { findWorkspaceChunks, type WorkspaceChunk } from '../../api/workspace-drawers'
import type { PluginInfo } from '../../api/plugins'
import { PublishedChunk } from './DrawerLayout'

export function PluginChunkLibrary({ plugin }: { plugin: PluginInfo }) {
  const [chunks, setChunks] = useState<WorkspaceChunk[] | null>(null)
  const [key, setKey] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void findWorkspaceChunks('page', '', controller.signal, plugin.id).then(
      data => {
        if (controller.signal.aborted) return
        setChunks(data.chunks)
        setKey(current => data.chunks.some(chunk => chunk.key === current) ? current : data.chunks[0]?.key || '')
        setError('')
      },
      () => {
        if (controller.signal.aborted) return
        setError('Could not load the published blocks.')
        setChunks(null)
      },
    )
    return () => controller.abort()
  }, [plugin.id, refresh])

  return <div className="drawer-stack">
    <div className="drawer-actions">
      {chunks && chunks.length > 0 && <label>Block
        <select className="select" value={key} onChange={event => setKey(event.target.value)}>
          {chunks.map(chunk => <option key={chunk.key} value={chunk.key}>{chunk.title}</option>)}
        </select>
      </label>}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRefresh(refresh + 1)}>Refresh blocks</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {!chunks && !error && <p role="status">Loading published blocks…</p>}
    {chunks?.length === 0 && <p className="drawer-note">This plugin has no published page blocks yet.</p>}
    {key && chunks?.some(chunk => chunk.key === key) &&
      <PublishedChunk key={`${key}:${refresh}`} name={key} side="page" plugins={[plugin]} />}
  </div>
}
