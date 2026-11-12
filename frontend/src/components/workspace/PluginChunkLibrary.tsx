import { useEffect, useState } from 'react'
import { findWorkspaceChunks, type WorkspaceChunk } from '../../api/workspace-drawers'
import type { PluginInfo } from '../../api/plugins'
import { PublishedChunk } from './DrawerLayout'

const pageSize = 20

export function PluginChunkLibrary({ plugin, brainId }: {
  plugin: PluginInfo; brainId: string
}) {
  const [catalog, setCatalog] = useState<{ chunks: WorkspaceChunk[]; total: number } | null>(null)
  const [key, setKey] = useState('')
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void findWorkspaceChunks('page', query, controller.signal, plugin.id, brainId, { limit: pageSize, offset }).then(
      data => {
        if (controller.signal.aborted) return
        if (!data.chunks.length && offset > 0) {
          setOffset(Math.max(0, Math.floor((data.total - 1) / pageSize) * pageSize))
          return
        }
        setCatalog(data)
        setKey(current => data.chunks.some(chunk => chunk.key === current) ? current : data.chunks[0]?.key || '')
      },
      () => {
        if (controller.signal.aborted) return
        setError('Could not load the published blocks.')
      },
    )
    return () => controller.abort()
  }, [plugin.id, brainId, offset, query, refresh])

  function clearResult() {
    setCatalog(null)
    setError('')
  }

  function movePage(next: number) {
    clearResult()
    setOffset(next)
  }

  const selected = catalog?.chunks.find(chunk => chunk.key === key)

  return <div className="drawer-stack">
    <form className="drawer-actions" onSubmit={event => {
      event.preventDefault()
      clearResult()
      setQuery(draft.trim())
      setOffset(0)
      setRefresh(value => value + 1)
    }}>
      <label>Search blocks
        <input className="input" type="search" value={draft} maxLength={1024}
          onChange={event => setDraft(event.target.value)} />
      </label>
      <button type="submit" className="btn btn-ghost btn-sm">Search</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
        clearResult()
        setRefresh(value => value + 1)
      }}>Refresh blocks</button>
    </form>
    <div className="drawer-actions">
      {catalog && catalog.chunks.length > 0 && <label>Block
        <select className="select" value={key} onChange={event => setKey(event.target.value)}>
          {catalog.chunks.map(chunk => <option key={chunk.key} value={chunk.key}>{chunk.title}</option>)}
        </select>
      </label>}
    </div>
    {catalog && catalog.total > 0 && <div className="drawer-actions">
      <span role="status">Showing {offset + 1}–{offset + catalog.chunks.length} of {catalog.total} blocks</span>
      {catalog.total > pageSize && <>
        <button type="button" className="btn btn-ghost btn-sm" disabled={offset === 0}
          onClick={() => movePage(offset - pageSize)}>Previous blocks</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={offset + pageSize >= catalog.total}
          onClick={() => movePage(offset + pageSize)}>Next blocks</button>
      </>}
    </div>}
    {error && <p role="alert">{error}</p>}
    {!catalog && !error && <p role="status">Loading published blocks…</p>}
    {catalog?.total === 0 && <p className="drawer-note">{query
      ? 'No published blocks match your search.' : 'This plugin has no published page blocks yet.'}</p>}
    {selected && <PublishedChunk key={`${selected.key}:${selected.sha256}:${refresh}`}
      name={selected.key} side="page" plugins={[plugin]} brainId={brainId} designOwner={plugin.id} />}
  </div>
}
