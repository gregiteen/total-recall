import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PluginInfo } from '../../api/plugins'
import { listSavedPages, readSavedPage, type SavedPage, type SavedPageSummary } from '../../api/workspace-drawers'
import { PublishedChunk } from './DrawerLayout'

export function SavedPages({ brainId, drawerOpen, activePageId, onOpenPage }: {
  brainId?: string
  drawerOpen: boolean
  activePageId: string | null
  onOpenPage: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  return <details className="sidebar-memory sidebar-saved-pages" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary className="nav-link">
      Saved pages <span className="plugin-folder-chevron" aria-hidden="true">{expanded ? '▾' : '›'}</span>
    </summary>
    {drawerOpen && expanded && (brainId
      ? <SavedPageLinks key={brainId} brainId={brainId} activePageId={activePageId} onOpenPage={onOpenPage} />
      : <p className="plugin-folder-message">Select one brain to see its saved pages.</p>)}
  </details>
}

function SavedPageLinks({ brainId, activePageId, onOpenPage }: {
  brainId: string
  activePageId: string | null
  onOpenPage: () => void
}) {
  const [result, setResult] = useState<{ pages: SavedPageSummary[] } | { error: string }>()
  useEffect(() => {
    const controller = new AbortController()
    void listSavedPages(brainId, controller.signal).then(
      data => { if (!controller.signal.aborted) setResult(data) },
      () => { if (!controller.signal.aborted) setResult({ error: 'Could not load saved pages.' }) },
    )
    return () => controller.abort()
  }, [brainId])

  if (!result) return <p className="plugin-folder-message" role="status">Loading saved pages…</p>
  if ('error' in result) return <p className="plugin-folder-message" role="alert">{result.error}</p>
  if (!result.pages.length) return <p className="plugin-folder-message">No saved pages</p>

  return <ul className="plugin-folder-list" aria-label="Saved pages">
    {result.pages.map(page => {
      const query = new URLSearchParams({ page: page.id, brain: brainId })
      const current = page.id === activePageId
      return <li key={page.id}>
        <Link to={`/memory?${query}`} className={`nav-link ${current ? 'active' : ''}`}
          aria-current={current ? 'page' : undefined} onClick={onOpenPage}>{page.title}</Link>
      </li>
    })}
  </ul>
}

export function WorkspacePage({ id, brainId, plugins }: {
  id: string
  brainId?: string
  plugins: PluginInfo[] | null
}) {
  return brainId
    ? <SavedPageContent key={`${brainId}:${id}`} id={id} brainId={brainId} plugins={plugins} />
    : <section className="plugin-workspace-page" aria-label="Saved page">
      <p>Select one brain to open this saved page.</p>
    </section>
}

function SavedPageContent({ id, brainId, plugins }: {
  id: string
  brainId: string
  plugins: PluginInfo[] | null
}) {
  const [result, setResult] = useState<SavedPage | { error: string }>()
  useEffect(() => {
    const controller = new AbortController()
    void readSavedPage(id, brainId, controller.signal).then(
      page => { if (!controller.signal.aborted) setResult(page) },
      () => { if (!controller.signal.aborted) setResult({ error: 'Could not open this saved page in the selected brain.' }) },
    )
    return () => controller.abort()
  }, [id, brainId])

  const page = result && 'chunks' in result ? result : undefined
  return <section className="plugin-workspace-page" aria-labelledby="saved-page-title">
    <header className="plugin-drawer-header">
      <h1 id="saved-page-title">{page?.title || 'Saved page'}</h1>
      <Link className="btn btn-ghost btn-sm" to="/memory">Close</Link>
    </header>
    {!result && <p role="status">Loading saved page…</p>}
    {result && 'error' in result && <p role="alert">{result.error}</p>}
    {page && !page.chunks.length && <p className="plugin-muted">No page blocks are available in this brain.</p>}
    {page?.chunks.map(chunk =>
      <PublishedChunk key={`${chunk.key}:${chunk.sha256}`} name={chunk.key} side="page" plugins={plugins}
        brainId={brainId} designOwner={chunk.plugin} />)}
  </section>
}
