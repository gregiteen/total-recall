import { useState, useCallback, useEffect } from 'react'
import {
  listTasks,
  createTask,
  listResearch,
  createResearch,
  fetchLogs,
  triggerRecompile,
  readMemory
} from '../api'
import type { Task, MemoryNode } from '../types'
import TaskQueueTab from '../components/TaskQueueTab'
import ResearchAgendaTab from '../components/ResearchAgendaTab'
import type { ResearchItem } from '../components/ResearchAgendaTab'
import DaemonLogsTab from '../components/DaemonLogsTab'

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [researchItems, setResearchItems] = useState<ResearchItem[]>([])
  const [researchCounts, setResearchCounts] = useState({ pending: 0, in_progress: 0, done: 0, failed: 0 })
  const [logs, setLogs] = useState('(loading live cognitive stream...)')
  const [activeTab, setActiveTab] = useState<'tasks' | 'research' | 'logs'>('tasks')
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [recompiling, setRecompiling] = useState(false)
  const [actionSuccess, setActionSuccess] = useState('')

  // Expanded research and lazy-loaded nodes
  const [expandedResearchId, setExpandedResearchId] = useState<string | null>(null)
  const [loadedDiscoveries, setLoadedDiscoveries] = useState<Record<string, MemoryNode | null>>({})
  const [loadingNodeSlugs, setLoadingNodeSlugs] = useState<Record<string, boolean>>({})

  const handleToggleExpand = async (item: ResearchItem) => {
    if (expandedResearchId === item.id) {
      setExpandedResearchId(null)
      return
    }
    
    setExpandedResearchId(item.id)
    
    if (item.node_slug && !loadedDiscoveries[item.node_slug] && !loadingNodeSlugs[item.node_slug]) {
      setLoadingNodeSlugs(prev => ({ ...prev, [item.node_slug!]: true }))
      try {
        const node = await readMemory(item.node_slug)
        setLoadedDiscoveries(prev => ({ ...prev, [item.node_slug!]: node }))
      } catch (e) {
        console.error('Failed to load memory node for research', e)
        setError(`Failed to load memory node: ${(e as Error).message}`)
      } finally {
        setLoadingNodeSlugs(prev => ({ ...prev, [item.node_slug!]: false }))
      }
    }
  }

  // Task creation form state
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskCategory, setTaskCategory] = useState('fact-seeker')
  const [taskTarget, setTaskTarget] = useState('')
  const [taskBody, setTaskBody] = useState('')
  const [taskSubmitting, setTaskSubmitting] = useState(false)

  // Research creation form state
  const [showResearchForm, setShowResearchForm] = useState(false)
  const [researchTopic, setResearchTopic] = useState('')
  const [researchPriority, setResearchPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')

  const [researchNotes, setResearchNotes] = useState('')
  const [researchSubmitting, setResearchSubmitting] = useState(false)

  // Fetch Scheduler Tasks
  const fetchTasks = useCallback(async () => {
    try {
      const data = await listTasks()
      setTasks(data || [])
      setError('')
    } catch (e) {
      console.error(e)
      setError(`Failed to fetch tasks: ${(e as Error).message}`)
    }
  }, [])

  const fetchResearchItems = useCallback(async () => {
    try {
      const res = await listResearch()
      setResearchItems(res.items || [])
      const counts = { pending: 0, in_progress: 0, done: 0, failed: 0 }
      for (const item of (res.items || [])) {
        if (counts[item.status as keyof typeof counts] !== undefined) {
          counts[item.status as keyof typeof counts]++
        }
      }
      setResearchCounts(counts)
      setError('')
    } catch (e) {
      console.error(e)
      setError(`Failed to fetch research: ${(e as Error).message}`)
    }
  }, [])

  // Fetch Daemon (Cognitive Engine) Logs
  const fetchDaemonLogs = useCallback(async () => {
    if (activeTab !== 'logs') return
    try {
      const data = await fetchLogs("server")
      setLogs(data.content || '(no logs streamed yet)')
      return true
    } catch (e) {
      setLogs(`Error connecting to cognitive logs: ${(e as Error).message}`)
      return false
    }
  }, [activeTab])

  // Combined Refresh
  const refreshAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchTasks(), fetchResearchItems(), fetchDaemonLogs()])
    setLoading(false)
  }, [fetchTasks, fetchResearchItems, fetchDaemonLogs])

  // Polling loop
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>
    let active = true
    let failCount = 0

    const poll = async () => {
      if (!active) return
      
      const results = await Promise.all([fetchTasks(), fetchResearchItems(), fetchDaemonLogs()])
      const hasError = results.includes(false)
      
      if (hasError) {
        failCount++
      } else {
        failCount = 0
      }

      if (active) {
        const delay = Math.min(3000 * Math.pow(2, failCount), 60000)
        timeoutId = setTimeout(poll, delay)
      }
    }

    const init = async () => {
      await Promise.all([fetchTasks(), fetchResearchItems(), fetchDaemonLogs()])
      setLoading(false)
      if (active) {
        timeoutId = setTimeout(poll, 3000)
      }
    }
    void init()

    return () => {
      active = false
      clearTimeout(timeoutId)
    }
  }, [fetchTasks, fetchResearchItems, fetchDaemonLogs])

  // Trigger Brain Recompilation
  const handleRecompile = async () => {
    if (recompiling) return
    setRecompiling(true)
    setError('')
    setActionSuccess('')
    try {
      await triggerRecompile()
      setActionSuccess('Surface projections recompiled successfully')
      setTimeout(() => setActionSuccess(''), 4000)
      void refreshAll()
    } catch (e) {
      setError(`Recompile failed: ${(e as Error).message}`)
    } finally {
      setRecompiling(false)
    }
  }

  // Seed Autonomous Gaps to fill the queue
  const handleSeedGaps = async () => {
    setError('')
    setActionSuccess('')
    try {
      await createTask(
        'fact-seeker',
        'Audit latest Chrome Extension MV3 API updates',
        'Verify if chrome.declarativeNetRequest rulesets have new declarative properties.'
      )
      await createTask(
        'post-mortem-daily',
        'Ingest yesterday\'s IDE compile session logs',
        'Analyze TypeScript build latency and suggest performance optimizations.'
      )
      await createTask(
        'clarity-rewriter',
        'Harden security.yml authentication encryption',
        'Enforce bcrypt rounds to 12 and verify cross-origin session domain locks.'
      )

      await createResearch(
        'TypeScript 5.4 advanced mapped types and template literal constraints',
        'high',
        'Evaluate mapped type performance on large monorepos.'
      )
      await createResearch(
        'Glassmorphism backdrop-filter performance optimizations on mobile Safari',
        'medium',
        'Prevent GPU compositing lag by limiting blur radius.'
      )
      await createResearch(
        'Local LLM quantization (GGUF vs EXL2) memory efficiency on macOS',
        'high',
        'Check metal buffer usage in Ollama backend models.'
      )

      setActionSuccess('Autonomous gaps seeded successfully! Task queue and research agenda are now full.')
      setTimeout(() => setActionSuccess(''), 5000)
      void refreshAll()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // Create Task Handler
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskTarget.trim()) return
    setTaskSubmitting(true)
    setError('')
    try {
      await createTask(taskCategory, taskTarget.trim(), taskBody.trim())
      setTaskTarget('')
      setTaskBody('')
      setShowTaskForm(false)
      setActionSuccess('Task enqueued successfully!')
      setTimeout(() => setActionSuccess(''), 3000)
      void fetchTasks()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setTaskSubmitting(false)
    }
  }

  // Create Research Handler
  const handleCreateResearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!researchTopic.trim()) return
    setResearchSubmitting(true)
    setError('')
    try {
      await createResearch(researchTopic.trim(), researchPriority, researchNotes.trim() || undefined)
      setResearchTopic('')
      setResearchNotes('')
      setShowResearchForm(false)
      setActionSuccess('Research project enqueued successfully!')
      setTimeout(() => setActionSuccess(''), 3000)
      void fetchResearchItems()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setResearchSubmitting(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1>Cognitive Dashboard</h1>
          <p>Real-time background reasoning engine, autonomous research, and active schedulers</p>
        </div>
        
        <div style={{ display: 'flex', gap: 10 }}>
          <button 
            className="btn btn-ghost btn-sm" 
            onClick={handleSeedGaps}
            style={{ 
              border: '1px solid rgba(59, 130, 246, 0.4)', 
              background: 'rgba(59, 130, 246, 0.05)',
              color: '#60a5fa' 
            }}
          >
            🔥 Seed Gaps
          </button>
          
          <button 
            className="btn btn-sm"
            onClick={handleRecompile}
            disabled={recompiling}
            style={{
              background: recompiling ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              color: '#ffffff',
              border: 'none',
              cursor: recompiling ? 'not-allowed' : 'pointer'
            }}
          >
            {recompiling ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Compiling...
              </span>
            ) : 'Recompile Surface'}
          </button>
        </div>
      </div>

      {error && <div className="badge badge-error" style={{ marginBottom: 16, display: 'inline-flex' }}>⚠️ {error}</div>}
      {actionSuccess && <div className="badge badge-success" style={{ marginBottom: 16, display: 'inline-flex', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#34d399' }}>✓ {actionSuccess}</div>}

      {/* Tabs Layout */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        marginBottom: 20,
        gap: 20,
      }}>
        <button
          onClick={() => setActiveTab('tasks')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'tasks' ? '2px solid #3b82f6' : '2px solid transparent',
            color: activeTab === 'tasks' ? 'var(--text-primary)' : 'var(--text-tertiary)',
            padding: '10px 4px',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          📅 Task Queue
          <span className="badge badge-accent" style={{ fontSize: 10, padding: '2px 6px' }}>{tasks.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('research')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'research' ? '2px solid #3b82f6' : '2px solid transparent',
            color: activeTab === 'research' ? 'var(--text-primary)' : 'var(--text-tertiary)',
            padding: '10px 4px',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          🔬 Research Agenda
          <span className="badge" style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            {researchCounts.pending + researchCounts.in_progress}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'logs' ? '2px solid #3b82f6' : '2px solid transparent',
            color: activeTab === 'logs' ? 'var(--text-primary)' : 'var(--text-tertiary)',
            padding: '10px 4px',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          📟 Live Brain Stream
          <span className="pulse" style={{ background: '#10b981', width: 6, height: 6, borderRadius: '50%' }} />
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'tasks' && (
        <TaskQueueTab
          tasks={tasks}
          loading={loading}
          showTaskForm={showTaskForm}
          setShowTaskForm={setShowTaskForm}
          taskCategory={taskCategory}
          setTaskCategory={setTaskCategory}
          taskTarget={taskTarget}
          setTaskTarget={setTaskTarget}
          taskBody={taskBody}
          setTaskBody={setTaskBody}
          taskSubmitting={taskSubmitting}
          handleCreateTask={handleCreateTask}
        />
      )}

      {activeTab === 'research' && (
        <ResearchAgendaTab
          researchItems={researchItems}
          loading={loading}
          showResearchForm={showResearchForm}
          setShowResearchForm={setShowResearchForm}
          researchTopic={researchTopic}
          setResearchTopic={setResearchTopic}
          researchPriority={researchPriority}
          setResearchPriority={setResearchPriority}
          researchNotes={researchNotes}
          setResearchNotes={setResearchNotes}
          researchSubmitting={researchSubmitting}
          handleCreateResearch={handleCreateResearch}
          expandedResearchId={expandedResearchId}
          handleToggleExpand={handleToggleExpand}
          loadedDiscoveries={loadedDiscoveries}
          loadingNodeSlugs={loadingNodeSlugs}
          refreshResearch={fetchResearchItems}
        />
      )}

      {activeTab === 'logs' && (
        <DaemonLogsTab logs={logs} activeTab={activeTab} />
      )}
    </div>
  )
}
