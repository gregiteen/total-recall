import { useEffect, useState } from 'react';
import {
  listNotificationRules,
  createNotificationRule,
  deleteNotificationRule,
  getNotificationHistory,
  sendTestNotification,
} from '../api/notifications';
import type { NotificationRule, NotificationEntry } from '../api/notifications';
import './NotificationsPage.css';

const EVENT_OPTIONS = [
  { value: 'node_offline', label: 'Node Offline' },
  { value: 'leader_change', label: 'Leader Change' },
  { value: 'webhook_failed', label: 'Webhook Failed' },
  { value: 'secret_sync_failed', label: 'Secret Sync Failed' },
  { value: 'daemon_error', label: 'Daemon Error' },
  { value: 'research_complete', label: 'Research Complete' },
] as const;

const CHANNEL_OPTIONS: NotificationRule['channel'][] = ['desktop', 'webhook', 'email'];
const PRIORITY_OPTIONS: NotificationRule['priority'][] = ['critical', 'high', 'low'];

export function NotificationsPage() {
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [history, setHistory] = useState<NotificationEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [newEvent, setNewEvent] = useState<NotificationRule['event']>('node_offline');
  const [newChannel, setNewChannel] = useState<NotificationRule['channel']>('desktop');
  const [newPriority, setNewPriority] = useState<NotificationRule['priority']>('high');
  const [newQuietHours, setNewQuietHours] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [r, h] = await Promise.all([listNotificationRules(), getNotificationHistory()]);
      setRules(r);
      setHistory(h);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setTimeout(() => { void loadData() }, 0);
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  async function handleAddRule(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createNotificationRule({
        event: newEvent,
        channel: newChannel,
        priority: newPriority,
        enabled: true,
        quietHours: newQuietHours,
      });
      setShowModal(false);
      setNewEvent(EVENT_OPTIONS[0].value);
      setNewChannel('desktop');
      setNewPriority('high');
      setNewQuietHours(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create notification rule');
    }
  }

  async function handleDeleteRule(id: string) {
    if (!confirm('Delete this notification rule?')) return;
    try {
      await deleteNotificationRule(id);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete notification rule');
    }
  }

  async function handleTestNotification() {
    try {
      await sendTestNotification();
      setSuccess('Test notification sent');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send test notification');
    }
  }

  function formatEventLabel(event: string): string {
    const opt = EVENT_OPTIONS.find((o) => o.value === event);
    return opt ? opt.label : event;
  }

  return (
    <div className="page-container notifications-page" data-testid="notifications-page">
      <div className="page-header">
        <h1>Notifications</h1>
        <button onClick={() => setShowModal(true)} className="btn btn-primary" data-testid="add-rule-btn">
          Add Rule
        </button>
      </div>

      {error && (
        <div className="alert alert-error" role="alert" data-testid="notifications-error" style={{ marginBottom: '24px' }}>
          {error}
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 12 }} onClick={() => loadData()}>
            Retry
          </button>
        </div>
      )}
      {success && (
        <div className="alert alert-success" style={{ marginBottom: '24px' }}>
          {success}
        </div>
      )}

      {/* ── Rules Table ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 500, marginBottom: '16px' }}>
          Notification Rules
        </h2>
        <div className="card notif-rules-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Channel</th>
                <th>Priority</th>
                <th>Enabled</th>
                <th>Quiet Hours</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td style={{ fontWeight: 500 }}>{formatEventLabel(rule.event)}</td>
                  <td style={{ textTransform: 'capitalize' }}>{rule.channel}</td>
                  <td>
                    <span className={`priority-badge ${rule.priority}`}>
                      {rule.priority.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${rule.enabled ? 'badge-online' : 'badge-offline'}`}
                    >
                      {rule.enabled ? 'ON' : 'OFF'}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${rule.quietHours ? 'badge-warning' : 'badge-offline'}`}
                    >
                      {rule.quietHours ? 'ACTIVE' : 'OFF'}
                    </span>
                  </td>
                  <td>
                    <div className="notif-rules-actions">
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--error)' }}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={6}
                    className="notif-empty"
                  >
                    No notification rules configured
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── History Section ──────────────────────────────────────────── */}
      <div>
        <div className="notif-history-header">
          <h2>Recent Notifications</h2>
          <button onClick={handleTestNotification} className="btn btn-ghost btn-sm">
            Send Test
          </button>
        </div>
        <div className="card" style={{ padding: '16px' }}>
          {history.length === 0 ? (
            <p className="notif-empty">No recent notifications</p>
          ) : (
            <div className="notif-history-list">
              {history.map((entry) => (
                <div key={entry.id} className="notif-history-entry">
                  <div className="notif-entry-content">
                    <span className="notif-entry-title">{entry.title}</span>
                    <span className="notif-entry-message">{entry.message}</span>
                  </div>
                  <div className="notif-entry-meta">
                    <span className="notif-entry-time">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                    <span className={`notif-status-badge ${entry.status}`}>
                      {entry.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Add Rule Modal ───────────────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Add Notification Rule</div>
            <form onSubmit={handleAddRule} className="modal-form">
              <div className="form-group">
                <label className="form-label">Event</label>
                <select
                  value={newEvent}
                  onChange={(e) => setNewEvent(e.target.value)}
                  className="select"
                >
                  {EVENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Channel</label>
                <select
                  value={newChannel}
                  onChange={(e) =>
                    setNewChannel(e.target.value as NotificationRule['channel'])
                  }
                  className="select"
                >
                  {CHANNEL_OPTIONS.map((ch) => (
                    <option key={ch} value={ch}>
                      {ch.charAt(0).toUpperCase() + ch.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Priority</label>
                <select
                  value={newPriority}
                  onChange={(e) =>
                    setNewPriority(e.target.value as NotificationRule['priority'])
                  }
                  className="select"
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <div className="notif-quiet-hours-row">
                  <div
                    className={`notif-toggle ${newQuietHours ? 'active' : ''}`}
                    onClick={() => setNewQuietHours(!newQuietHours)}
                    role="switch"
                    aria-checked={newQuietHours}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setNewQuietHours(!newQuietHours);
                      }
                    }}
                  />
                  <span className="notif-quiet-hours-label">Enable Quiet Hours</span>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
