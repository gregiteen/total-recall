import { useState, useEffect, useCallback, type MouseEvent } from "react"
import { fetchDocs, readDoc, createDoc, updateDoc, deleteDoc, fetchViews, createView, deleteView, type SavedView, type VaultDocument } from "../api"
import { useSearchParams } from "react-router-dom"
import { DocumentTable } from "../components/DocumentTable"
import { DocumentEditorModal } from "../components/DocumentEditorModal"

export default function VaultPage({ activeBrainId }: { activeBrainId?: string }) {
  const [docs, setDocs] = useState<VaultDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [views, setViews] = useState<SavedView[]>([])

  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get("q") || ""
  const type = searchParams.get("type") || ""
  const portability = searchParams.get("portability") || ""
  const status = searchParams.get("status") || ""

  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")
  const [isNew, setIsNew] = useState(false)
  const [newPath, setNewPath] = useState("")
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchDocs(activeBrainId, { q, type, portability, status })
      const viewsData = await fetchViews()
      setDocs(data.docs)
      setViews(viewsData)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load vault data")
    } finally {
      setLoading(false)
    }
  }, [activeBrainId, portability, q, status, type])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadData])

  const handleSaveView = async () => {
    const name = prompt("Enter a name for this view:")
    if (!name) return
    try {
      await createView(name, { q, type, portability, status })
      loadData()
    } catch (err: unknown) {
      setError("Failed to save view: " + (err instanceof Error ? err.message : "Unknown error"))
    }
  }

  const handleApplyView = (v: SavedView) => {
    setSearchParams(prev => {
      prev.set("q", v.filters.q || "")
      prev.set("type", v.filters.type || "")
      prev.set("portability", v.filters.portability || "")
      prev.set("status", v.filters.status || "")
      return prev
    })
  }

  const handleDeleteView = async (id: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (!confirm("Delete this saved view?")) return
    try {
      await deleteView(id)
      loadData()
    } catch (err: unknown) {
      setError("Delete failed: " + (err instanceof Error ? err.message : "Unknown error"))
    }
  }

  const handleEdit = async (path: string) => {
    try {
      const data = await readDoc(path, activeBrainId)
      setEditingPath(path)
      setEditContent(data.raw)
      setIsNew(false)
      setNewPath(path)
    } catch (err: unknown) {
      setError("Failed to load document: " + (err instanceof Error ? err.message : "Unknown error"))
    }
  }

  const handleDelete = async (path: string) => {
    if (!confirm(`Are you sure you want to delete ${path}?`)) return
    try {
      await deleteDoc(path, activeBrainId)
      loadData()
    } catch (err: unknown) {
      setError("Delete failed: " + (err instanceof Error ? err.message : "Unknown error"))
    }
  }

  const handleSave = async () => {
    if (!newPath) { setError("Path is required"); return }
    setSaving(true)
    try {
      if (isNew) {
        await createDoc(newPath, editContent, activeBrainId)
      } else {
        await updateDoc(newPath, editContent, activeBrainId)
      }
      setEditingPath(null)
      loadData()
    } catch (err: unknown) {
      setError("Save failed: " + (err instanceof Error ? err.message : "Unknown error"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-container">
      <div className="header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Vault Manager</h1>
          <p className="page-subtitle" style={{ opacity: 0.7 }}>Manage SSSS documents across the active brain</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setIsNew(true); setEditingPath(""); setEditContent(""); setNewPath("") }}>
          + New Document
        </button>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input 
          type="text" 
          placeholder="Search..." 
          value={q} 
          onChange={e => setSearchParams(prev => { prev.set("q", e.target.value); return prev })}
          className="search-input"
          style={{ flex: 1, padding: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
        />
        <select 
          value={type} 
          onChange={e => setSearchParams(prev => { prev.set("type", e.target.value); return prev })}
          style={{ padding: '8px', background: '#1e1e1e', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <option value="">All Types</option>
          <option value="memory">memory</option>
          <option value="rule">rule</option>
          <option value="proposal">proposal</option>
          <option value="visitor">visitor</option>
        </select>
        <select 
          value={portability} 
          onChange={e => setSearchParams(prev => { prev.set("portability", e.target.value); return prev })}
          style={{ padding: '8px', background: '#1e1e1e', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <option value="">All Portability</option>
          <option value="structural">structural</option>
          <option value="tenant_private">tenant_private</option>
        </select>
        <select 
          value={status} 
          onChange={e => setSearchParams(prev => { prev.set("status", e.target.value); return prev })}
          style={{ padding: '8px', background: '#1e1e1e', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <option value="">All Statuses</option>
          <option value="active">active</option>
          <option value="archived">archived</option>
          <option value="pending">pending</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
        </select>
        <button onClick={handleSaveView} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '4px' }}>Save View</button>
      </div>

      {views.length > 0 && (
        <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ color: 'rgba(255,255,255,0.5)', alignSelf: 'center' }}>Saved Views:</span>
          {views.map(v => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
              <button onClick={() => handleApplyView(v)} style={{ padding: '6px 12px', background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>{v.name}</button>
              <button onClick={(e) => handleDeleteView(v.id, e)} style={{ padding: '6px 12px', background: 'rgba(226,43,34,0.1)', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.1)', color: '#e24a4a', cursor: 'pointer' }}>×</button>
            </div>
          ))}
        </div>
      )}

      {loading && <p>Loading vault documents...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      
      {!loading && !error && (
        <DocumentTable 
          data={docs}
          emptyMessage="No documents found matching filters."
          columns={[
            { key: 'type', header: 'Type', render: (doc) => <span style={{ opacity: 0.6 }}>{doc.type}</span> },
            { key: 'name', header: 'Name', render: (doc) => doc.name },
            { key: 'path', header: 'Path', render: (doc) => <code style={{ fontSize: '0.8em', opacity: 0.8 }}>{doc.path}</code> },
            { key: 'status', header: 'Status', render: (doc) => doc.status || '-' },
            { key: 'portability', header: 'Portability', render: (doc) => <span style={{ fontSize: '0.8em', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>{doc.portability}</span> },
            { key: 'actions', header: 'Actions', render: (doc) => (
                <>
                  <button onClick={() => handleEdit(doc.path)} style={{ marginRight: '10px', background: 'none', border: 'none', color: '#4a90e2', cursor: 'pointer' }}>Edit</button>
                  <button onClick={() => handleDelete(doc.path)} style={{ background: 'none', border: 'none', color: '#e24a4a', cursor: 'pointer' }}>Delete</button>
                </>
              )
            }
          ]}
        />
      )}

      {editingPath !== null && (
        <DocumentEditorModal
          isNew={isNew}
          editingPath={editingPath}
          newPath={newPath}
          editContent={editContent}
          saving={saving}
          onPathChange={setNewPath}
          onContentChange={setEditContent}
          onSave={handleSave}
          onCancel={() => setEditingPath(null)}
        />
      )}
    </div>
  )
}
