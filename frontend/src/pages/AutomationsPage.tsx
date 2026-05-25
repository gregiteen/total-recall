import { useState, useEffect } from 'react';
import { listTasks, createTask, triggerDream, triggerRecompile } from '../api';
import type { Task } from '../types';

export default function AutomationsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Running Actions UI state
  const [dreaming, setDreaming] = useState(false);
  const [compiling, setCompiling] = useState(false);
  
  // Custom Task Form state
  const [category, setCategory] = useState('fact-seeker');
  const [target, setTarget] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  const fetchActiveTasks = async () => {
    try {
      const data = await listTasks();
      setTasks(data || []);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to fetch task queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate task queue polling on mount
    void fetchActiveTasks();
    const interval = setInterval(fetchActiveTasks, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleTriggerDream = async () => {
    setDreaming(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await triggerDream();
      setSuccess(`Dream consolidator complete! REM Consolidation cycle status: ${result.status}`);
      setTimeout(() => setSuccess(null), 5000);
      void fetchActiveTasks();
    } catch (err: unknown) {
      setError((err as Error).message || 'Dream cycle execution failed.');
    } finally {
      setDreaming(false);
    }
  };

  const handleTriggerRecompile = async () => {
    setCompiling(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await triggerRecompile();
      setSuccess(result.message || 'Brain surfaces recompiled successfully!');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: unknown) {
      setError((err as Error).message || 'Surface recompilation failed.');
    } finally {
      setCompiling(false);
    }
  };

  const handleEnqueueTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target.trim()) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await createTask(category, target.trim(), body.trim(), priority);
      setTarget('');
      setBody('');
      setSuccess('Cognitive System 2 task successfully enqueued!');
      setTimeout(() => setSuccess(null), 4000);
      void fetchActiveTasks();
    } catch (err: unknown) {
      setError((err as Error).message || 'Enqueuing task failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const CRON_JOBS = [
    { name: 'Upstream Git Synchronizer', cron: '*/5 * * * *', interval: 'Every 5m', desc: 'Syncs rule shims, merges remote memory nodes, compiles rules', status: 'active', emoji: '🔄' },
    { name: 'REM Dream Consolidator', cron: '0 * * * *', interval: 'Every 60m', desc: 'Runs cognitive dream cycles (decaying confidence, deduplicating inbox)', status: 'active', emoji: '🌙' },
    { name: 'Watchdog Subsystem Probe', cron: '*/1 * * * *', interval: 'Every 60s', desc: 'Probes Express gateways and quarantines compromised blocks', status: 'active', emoji: '🛡️' },
    { name: 'Encrypted VFS Backup System', cron: '0 0 * * *', interval: 'Daily', desc: 'Creates secure point-in-time encrypted tarball snapshots of the VFS', status: 'active', emoji: '🗄️' },
  ];

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1>Automations & Cron Schedulers</h1>
        <p>Orchestrate background task daemons, trigger REM sleep dream loops, and manage Cron intervals</p>
      </div>

      {error && (
        <div className="badge badge-error" style={{ marginBottom: 20, display: 'inline-flex', padding: '6px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#f87171' }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="badge badge-success" style={{ marginBottom: 20, display: 'inline-flex', padding: '6px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#34d399' }}>
          ✓ {success}
        </div>
      )}

      {/* Grid panels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24, marginBottom: 24 }}>
        
        {/* Panel A: Core Daemon Loops & Cron triggers */}
        <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
            <span style={{ fontSize: 20 }}>🕒</span>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Daemon Scheduler Triggers</h3>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Review active cron loops running under System Cron triggers</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {CRON_JOBS.map((job, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 18 }}>{job.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{job.name}</span>
                    <span className="badge badge-accent" style={{ fontSize: 9, padding: '2px 6px', background: 'rgba(0, 206, 201, 0.1)', color: '#00cec9', border: '1px solid rgba(0, 206, 201, 0.2)' }}>
                      {job.interval}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{job.desc}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace', marginTop: 4 }}>Cron: {job.cron}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <button
              className="btn btn-sm"
              onClick={handleTriggerDream}
              disabled={dreaming}
              style={{
                flex: 1,
                background: dreaming ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #a855f7, #6b21a8)',
                color: '#fff',
                border: 'none',
                fontWeight: 500
              }}
            >
              {dreaming ? '⏳ Consolidating...' : '🌙 Run REM Sleep Now'}
            </button>
            <button
              className="btn btn-sm"
              onClick={handleTriggerRecompile}
              disabled={compiling}
              style={{
                flex: 1,
                background: compiling ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                color: '#fff',
                border: 'none',
                fontWeight: 500
              }}
            >
              {compiling ? '⏳ Compiling...' : '🔄 Rebuild Indexes'}
            </button>
          </div>
        </div>

        {/* Panel B: Deliberate Task SSSS Creator */}
        <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
            <span style={{ fontSize: 20 }}>🤖</span>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Deliberative Task Creator</h3>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Trigger System 2 deep reasoning loops in the background queue</p>
            </div>
          </div>

          <form onSubmit={handleEnqueueTask} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label htmlFor="task_cat" style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>Category</label>
                <select
                  id="task_cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    padding: '8px 10px',
                    borderRadius: 6,
                    outline: 'none',
                    fontSize: 12
                  }}
                >
                  <option value="fact-seeker">🌐 Fact Seeker (Web retrieval)</option>
                  <option value="clarity-rewriter">📝 Clarity Rewriter (Synthesizer)</option>
                  <option value="post-mortem-daily">🧠 Post-Mortem daily logs</option>
                  <option value="code-optimization">💻 Code Optimizer agent</option>
                </select>
              </div>

              <div style={{ width: 100, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label htmlFor="task_priority" style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>Priority</label>
                <select
                  id="task_priority"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    padding: '8px 10px',
                    borderRadius: 6,
                    outline: 'none',
                    fontSize: 12
                  }}
                >
                  <option value={1}>1 (Absolute)</option>
                  <option value={3}>3 (High)</option>
                  <option value={5}>5 (Normal)</option>
                  <option value={8}>8 (Low)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="task_target" style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>Task Goal / Objective</label>
              <input
                id="task_target"
                type="text"
                placeholder="e.g. Audit security.yml files for weak configuration hashes"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                required
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  padding: '8px 12px',
                  borderRadius: 6,
                  outline: 'none',
                  fontSize: 12
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="task_body" style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>Deliberation Payload (Context / Instructions)</label>
              <textarea
                id="task_body"
                rows={3}
                placeholder="Detail specific context, files to search, and desired output formats..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  padding: '8px 12px',
                  borderRadius: 6,
                  outline: 'none',
                  fontSize: 12,
                  resize: 'none'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !target.trim()}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                color: '#fff',
                padding: '10px',
                borderRadius: 6,
                fontWeight: 500,
                border: 'none',
                marginTop: 8,
                cursor: submitting || !target.trim() ? 'not-allowed' : 'pointer'
              }}
            >
              {submitting ? '⏳ Dispatching Task...' : '🚀 Dispatch to Queue'}
            </button>
          </form>
        </div>

      </div>

      {/* SSSS Queue List Panel */}
      <div className="card" style={{ flex: 1, minHeight: 250, padding: 24, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>📋</span>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Active SSSS Background Queue</h3>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Real-time verification of enqueued System 2 task nodes</p>
            </div>
          </div>
          <span className="badge badge-accent" style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}>{tasks.length} enqueued</span>
        </div>

        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading task list...</div>
        ) : tasks.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            🎉 No enqueued tasks! SSSS Queue is fully clear.
          </div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tasks.map((task) => {
              const isPending = task.status === 'pending';
              const statusColor = isPending ? 'var(--warning)' : '#10b981';
              return (
                <div key={task.slug} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: 16, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 260 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="badge" style={{ fontSize: 10, background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>{task.category}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{task.target}</span>
                    </div>
                    {task.body && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 2 }}>{task.body}</div>}
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace', marginTop: 4 }}>Node ID: {task.slug} • Priority: {task.priority || 5}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: statusColor, textTransform: 'capitalize' }}>
                        {isPending && <span className="pulse" style={{ background: 'var(--warning)', width: 6, height: 6, borderRadius: '50%' }} />}
                        {task.status}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Progress: {task.progress || 0}%</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
