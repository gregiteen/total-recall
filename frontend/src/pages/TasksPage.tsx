import { useState, useEffect, useCallback } from 'react'
import { listTasks } from '../api'
import type { Task } from '../types'

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchTasks = useCallback(async () => {
    try {
      const data = await listTasks()
      setTasks(data)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Task Scheduler</h1>
          <p>Pending and completed autonomous tasks</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setLoading(true); void fetchTasks(); }}>Refresh</button>
      </div>

      {error && <div className="badge badge-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}

      <div className="card-grid" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          [1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 60 }} />)
        ) : tasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>No tasks in queue.</div>
        ) : (
          tasks.map(t => (
            <div key={t.slug} className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: 14 }}>{t.target}</h4>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', gap: 12 }}>
                  <span>{t.category}</span>
                  <span>Priority: {t.priority}</span>
                </div>
              </div>
              <span className={`badge ${t.status === 'completed' ? 'badge-success' : t.status === 'failed' ? 'badge-error' : 'badge-warning'}`}>
                {t.status}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
