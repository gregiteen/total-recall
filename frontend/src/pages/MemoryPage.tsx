import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listMemory, searchMemory, readMemory } from '../api'
import type { MemoryNode } from '../types'

const CATEGORIES = [
  'all', 'invariants', 'preferences', 'anti-patterns', 'patterns',
  'decisions', 'concepts', 'facts', 'lore',
]

export default function MemoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlSlug = searchParams.get('slug')

  const [nodes, setNodes] = useState<MemoryNode[]>([])
  const [selected, setSelected] = useState<MemoryNode | null>(null)
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchNodes = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (query.trim()) {
        const results = await searchMemory(query, category === 'all' ? undefined : category)
        setNodes(results)
      } else {
        const results = await listMemory(category === 'all' ? undefined : category)
        setNodes(results)
      }
    } catch (e) {
      setError((e as Error).message)
      setNodes([])
    } finally {
      setLoading(false)
    }
  }, [category, query])

  useEffect(() => {
    const timer = setTimeout(fetchNodes, 300)
    return () => clearTimeout(timer)
  }, [fetchNodes])

  useEffect(() => {
    if (urlSlug) {
      const loadUrlSlug = async () => {
        setLoading(true)
        setError('')
        try {
          const full = await readMemory(urlSlug)
          setSelected(full)
        } catch (e) {
          setError(`Failed to load memory node '${urlSlug}': ${(e as Error).message}`)
          setSelected(null)
        } finally {
          setLoading(false)
        }
      }
      loadUrlSlug()
    } else {
      setSelected(null)
    }
  }, [urlSlug])

  const handleSelect = (node: MemoryNode) => {
    setSearchParams({ slug: node.slug })
  }

  const categoryCounts = nodes.reduce<Record<string, number>>((acc, n) => {
    acc[n.category] = (acc[n.category] || 0) + 1
    return acc
  }, {})

  return (
    <div className="page">
      <div className="page-header">
        <h1>Memory Vault</h1>
        <p>Browse and search your SSSS knowledge graph</p>
      </div>
      <div className="memory-layout">
        <div className="memory-sidebar">
          <h3>Categories</h3>
          {CATEGORIES.map(c => (
            <button
              key={c}
              className={`category-btn ${category === c ? 'active' : ''}`}
              onClick={() => { setCategory(c); setSearchParams({}) }}
            >
              <span>{c === 'all' ? '📋 All Nodes' : c}</span>
              {c === 'all'
                ? <span className="category-count">{nodes.length}</span>
                : categoryCounts[c]
                  ? <span className="category-count">{categoryCounts[c]}</span>
                  : null
              }
            </button>
          ))}
        </div>
        <div className="memory-main">
          <div className="memory-search">
            <input
              id="memory-search"
              type="text"
              placeholder="Search memory nodes…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <button className="btn btn-ghost btn-sm" onClick={fetchNodes}>Refresh</button>
          </div>
          {error && <div className="badge badge-error" style={{ alignSelf: 'flex-start' }}>⚠️ {error}</div>}
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 60 }} />)}
            </div>
          ) : selected ? (
            <div className="memory-detail">
              <button className="btn btn-ghost btn-sm" onClick={() => setSearchParams({})} style={{ marginBottom: 12 }}>← Back</button>
              <h2>{selected.title}</h2>
              <dl className="frontmatter">
                <dt>Slug</dt><dd><code>{selected.slug}</code></dd>
                <dt>Category</dt><dd>{selected.category}</dd>
                {selected.status && <><dt>Status</dt><dd><span className="badge badge-success">{selected.status}</span></dd></>}
                {selected.importance !== undefined && <><dt>Importance</dt><dd>{selected.importance}</dd></>}
                {selected.tags?.length ? <><dt>Tags</dt><dd>{selected.tags.join(', ')}</dd></> : null}
              </dl>
              {(selected.body || selected.content) && <pre>{selected.body || selected.content}</pre>}
            </div>
          ) : (
            <div className="memory-list">
              {nodes.length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
                  {query ? 'No matching nodes found.' : 'No memory nodes loaded. Is the backend running?'}
                </div>
              )}
              {nodes.map(n => (
                <div key={n.slug} className="memory-node-card" onClick={() => handleSelect(n)}>
                  <h4>{n.title}</h4>
                  <div className="meta">
                    <span>{n.category}</span>
                    {n.status && <span className="badge badge-success">{n.status}</span>}
                    {n.importance !== undefined && <span>★ {n.importance}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
