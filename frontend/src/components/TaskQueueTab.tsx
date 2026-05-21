import React from 'react'
import type { Task } from '../types'

interface TaskQueueTabProps {
  tasks: Task[]
  loading: boolean
  showTaskForm: boolean
  setShowTaskForm: (v: boolean) => void
  taskCategory: string
  setTaskCategory: (v: string) => void
  taskTarget: string
  setTaskTarget: (v: string) => void
  taskBody: string
  setTaskBody: (v: string) => void
  taskSubmitting: boolean
  handleCreateTask: (e: React.FormEvent) => void
}

export default function TaskQueueTab(props: TaskQueueTabProps) {
  const {
    tasks,
    loading,
    showTaskForm,
    setShowTaskForm,
    taskCategory,
    setTaskCategory,
    taskTarget,
    setTaskTarget,
    taskBody,
    setTaskBody,
    taskSubmitting,
    handleCreateTask,
  } = props

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Active Scheduler Tasks</h3>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => setShowTaskForm(!showTaskForm)}
          style={{ borderColor: 'var(--border)' }}
        >
          {showTaskForm ? 'Cancel' : '+ Add Custom Task'}
        </button>
      </div>

      {/* Collapsible Task Form */}
      {showTaskForm && (
        <form onSubmit={handleCreateTask} style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              Subsystem Category
              <select
                value={taskCategory}
                onChange={e => setTaskCategory(e.target.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  outline: 'none'
                }}
              >
                <option value="fact-seeker">Fact Seeker</option>
                <option value="post-mortem-daily">Post Mortem Daemon</option>
                <option value="clarity-rewriter">Clarity Rewriter</option>
                <option value="drift-detector">Drift Detector</option>
                <option value="dream">Dream Cycle</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              Target Operation / Description
              <input
                type="text"
                required
                placeholder="e.g. Audit security.yml files for weak encryption configs"
                value={taskTarget}
                onChange={e => setTaskTarget(e.target.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  outline: 'none'
                }}
              />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
            Verification Payload Body (Optional Markdown)
            <textarea
              placeholder="Additional context or markdown checklist rules..."
              value={taskBody}
              onChange={e => setTaskBody(e.target.value)}
              style={{
                padding: '10px',
                borderRadius: 8,
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                outline: 'none',
                minHeight: 80,
                resize: 'vertical'
              }}
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={taskSubmitting || !taskTarget.trim()}
            style={{ alignSelf: 'flex-end', minWidth: 120 }}
          >
            {taskSubmitting ? 'Enqueuing...' : 'Create Task'}
          </button>
        </form>
      )}

      {/* Tasks Grid */}
      <div className="card-grid" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading && tasks.length === 0 ? (
          [1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 68 }} />)
        ) : tasks.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '50px 20px',
            color: 'var(--text-tertiary)',
            border: '1px dashed var(--border)',
            borderRadius: 12
          }}>
            No tasks are currently running.
            <br />
            <span style={{ fontSize: 12 }}>Click <strong>Seed Gaps</strong> above to trigger autonomous background schedules.</span>
          </div>
        ) : (
          tasks.map(t => (
            <div key={t.slug} className="card" style={{
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 12
            }}>
              <div style={{ flex: 1, marginRight: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="badge badge-accent" style={{ fontSize: 11 }}>{t.category}</span>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t.target}</h4>
                </div>
                {t.body && (
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineBreak: 'anywhere' }}>
                    {t.body}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
                  <span>Ref: <code>{t.slug}</code></span>
                  <span>Priority Weight: {t.priority}</span>
                </div>
              </div>
              <span className={`badge ${
                t.status === 'completed' ? 'badge-success' :
                t.status === 'failed' ? 'badge-error' :
                'badge-warning'
              }`} style={{ textTransform: 'capitalize', minWidth: 80, textAlign: 'center' }}>
                {t.status}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
