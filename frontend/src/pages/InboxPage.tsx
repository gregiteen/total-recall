import { useState, useEffect, useCallback } from "react"
import { fetchDocs, readDoc, updateDoc, postDecision, type VaultDocument } from "../api"
import { DocumentTable } from "../components/DocumentTable"

export default function InboxPage({ activeBrainId }: { activeBrainId?: string }) {
  const [items, setItems] = useState<VaultDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchDocs(activeBrainId, { status: "pending_approval" })
      setItems(data.docs)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load the approval inbox")
    } finally {
      setLoading(false)
    }
  }, [activeBrainId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadData])

  const handleDecision = async (path: string, action: string) => {
    try {
      const doc = await readDoc(path, activeBrainId)
      // Extract proposal ID from path (e.g. proposals/p2.md -> p2)
      const idMatch = path.match(/proposals\/(.+?)\.md$/)
      if (idMatch) {
        const id = idMatch[1]
        // This hits the proxy, which forwards to droplet and runs sync
        await postDecision(id, action)
      } else {
        // Fallback for non-proposal docs (just optimistic update)
        const newBody = doc.raw.replace(/status:.*$/m, `status: ${action}`)
        await updateDoc(path, newBody, activeBrainId)
      }
      loadData()
    } catch (err: unknown) {
      alert("Decision failed: " + (err instanceof Error ? err.message : "Unknown error"))
    }
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '24px' }}>Approval Inbox</h1>
        <button onClick={loadData} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '4px' }}>Refresh</button>
      </div>

      {loading && <p>Loading inbox items...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '30px' }}>
          <div>
            <DocumentTable
              data={items}
              emptyMessage="No items pending approval."
              columns={[
                { key: 'type', header: 'Type', render: (d) => <span style={{ opacity: 0.6 }}>{d.type}</span> },
                { key: 'name', header: 'Name', render: (d) => d.name },
                { key: 'status', header: 'Status', render: (d) => <span style={{ fontSize: '0.8em', background: 'rgba(234,179,8,0.15)', color: '#eab308', padding: '2px 6px', borderRadius: '4px' }}>{d.status || 'pending'}</span> },
                { key: 'updated', header: 'Last Updated', render: (d) => d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : '-' },
                { key: 'actions', header: 'Actions', render: (d) => (
                    <>
                      <button onClick={() => handleDecision(d.path, 'approved')} style={{ marginRight: '10px', background: '#22c55e', border: 'none', color: 'white', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>Approve</button>
                      <button onClick={() => handleDecision(d.path, 'rejected')} style={{ background: '#e22b22', border: 'none', color: 'white', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>Reject</button>
                    </>
                  )
                }
              ]}
            />
          </div>
        </div>
      )}
    </div>
  )
}
