import { useEffect, useState, useCallback } from 'react';
import {
  fetchWebhookConfigs,
  fetchWebhookEvents,
  triggerTestWebhook,
  addWebhookConfig,
  deleteWebhookConfig,
  redeliverWebhookEvent,
} from '../api/webhooks';
import type { WebhookConfig, WebhookEvent } from '../api/webhooks';
import './WebhooksPage.css';

// Expandable JSON Viewer Component
function JsonViewer({ data }: { data: unknown }) {
  const [expanded, setExpanded] = useState(false);
  
  if (!data) return null;
  
  return (
    <div style={{ marginTop: '8px' }}>
      <button onClick={() => setExpanded(!expanded)} className="json-toggle">
        {expanded ? '▼ Hide Payload' : '▶ Show Payload'}
      </button>
      {expanded && (
        <div className="json-viewer">
          <pre style={{ margin: 0 }}>{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export function WebhooksPage() {
  const [configs, setConfigs] = useState<WebhookConfig[]>([]);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterProvider, setFilterProvider] = useState('');
  
  // Wizard State
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [newConfig, setNewConfig] = useState<Partial<WebhookConfig>>({ status: 'active', events: [] });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, e] = await Promise.all([fetchWebhookConfigs(), fetchWebhookEvents(filterProvider || undefined)]);
      setConfigs(c);
      setEvents(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load webhooks data');
    } finally {
      setLoading(false);
    }
  }, [filterProvider]);

  useEffect(() => {
    setTimeout(() => { void loadData() }, 0);
    const interval = setInterval(() => { void loadData() }, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  async function handleTest(provider: string) {
    try {
      await triggerTestWebhook(provider);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger test webhook');
    }
  }

  async function handleRedeliver(eventId: string) {
    try {
      await redeliverWebhookEvent(eventId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to re-deliver webhook event');
    }
  }

  async function handleWizardSave() {
    if (!newConfig.provider) return;
    try {
      await addWebhookConfig(newConfig as WebhookConfig);
      setShowWizard(false);
      setWizardStep(1);
      setNewConfig({ status: 'active', events: [] });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add webhook');
    }
  }

  async function handleDelete(provider: string) {
    if (!confirm(`Delete webhook config for ${provider}?`)) return;
    try {
      await deleteWebhookConfig(provider);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete webhook');
    }
  }

  async function handleRotateSecret(provider: string) {
    if (!confirm(`Generate a new secret for ${provider}? You will need to update the provider with the new secret.`)) return;
    try {
      const newSecret = Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      await addWebhookConfig({ provider, status: 'active', secret: newSecret });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rotate secret');
    }
  }

  // Compute Stats
  const activeCount = configs.filter(c => c.status === 'active').length;

  return (
    <div className="page-container webhooks-page">
      <div className="page-header">
        <h1>Webhooks</h1>
        <button
          onClick={() => setShowWizard(true)}
          className="btn btn-primary"
        >
          Add Webhook
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '24px' }}>{error}</div>}

      <div className="webhook-stats">
        <div className="stat-box">
          <div className="label">Configured</div>
          <div className="value">{configs.length}</div>
        </div>
        <div className="stat-box">
          <div className="label">Active Providers</div>
          <div className="value">{activeCount}</div>
        </div>
        <div className="stat-box">
          <div className="label">Events Loaded</div>
          <div className="value">{events.length}</div>
        </div>
      </div>

      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 500, marginBottom: '16px' }}>Registered Webhooks</h2>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Status</th>
                <th>Secret</th>
                <th>Last Received</th>
                <th>Total Count</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {configs.map(config => (
                <tr key={config.provider}>
                  <td style={{ textTransform: 'capitalize', fontWeight: 500 }}>{config.provider}</td>
                  <td>
                    <span className={`badge ${config.status === 'active' ? 'badge-online' : 'badge-offline'}`}>
                      {config.status.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                        {config.has_secret ? '••••••••' : 'Not Set'}
                      </span>
                      {config.has_secret && (
                        <button onClick={() => handleRotateSecret(config.provider)} className="rotate-btn" title="Rotate Secret">
                          ↻
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {config.lastReceived ? new Date(config.lastReceived).toLocaleString() : 'Never'}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{config.totalCount || 0}</td>
                  <td style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleTest(config.provider)} className="btn btn-ghost btn-sm">Test</button>
                    <button onClick={() => handleDelete(config.provider)} className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }}>Remove</button>
                  </td>
                </tr>
              ))}
              {configs.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px' }}>
                    No webhook configs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="page-header" style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 500 }}>Recent Events</h2>
          <select
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
            className="input"
            style={{ width: '200px' }}
          >
            <option value="">All Providers</option>
            {configs.map(c => (
              <option key={c.provider} value={c.provider}>{c.provider}</option>
            ))}
          </select>
        </div>
        
        <div className="card" style={{ maxHeight: '600px', overflowY: 'auto' }}>
          {events.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '16px' }}>No recent events</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {events.map(ev => (
                <div key={ev.id} style={{ padding: '16px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <span style={{ textTransform: 'capitalize', fontWeight: 600, color: 'var(--accent-hover)' }}>{ev.provider}</span>
                      <span className="badge badge-leader">{ev.event_type}</span>
                      {ev.delivery_status && (
                        <span className="badge badge-follower" style={{ fontSize: 11 }}>{ev.delivery_status}</span>
                      )}
                      {ev.parent_event_id && (
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>re-deliver of {ev.parent_event_id.slice(0, 8)}…</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{new Date(ev.received_at).toLocaleString()}</span>
                      {ev.id && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: '4px 8px' }}
                          onClick={() => handleRedeliver(ev.id)}
                          title="Re-run handler for this stored event"
                        >
                          Re-deliver
                        </button>
                      )}
                    </div>
                  </div>
                  <JsonViewer data={ev.payload} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showWizard && (
        <div className="modal-overlay" onClick={() => setShowWizard(false)}>
          <div className="modal-content wizard-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Provider Configuration Wizard</div>
            
            <div className="wizard-steps">
              <div className={`wizard-step ${wizardStep >= 1 ? 'active' : ''} ${wizardStep > 1 ? 'completed' : ''}`}>1</div>
              <div className={`wizard-step ${wizardStep >= 2 ? 'active' : ''} ${wizardStep > 2 ? 'completed' : ''}`}>2</div>
              <div className={`wizard-step ${wizardStep >= 3 ? 'active' : ''}`}>3</div>
            </div>

            {wizardStep === 1 && (
              <div>
                <h3 style={{ marginBottom: '16px' }}>Select Provider</h3>
                <div className="form-group">
                  <label className="form-label">Provider Name</label>
                  <select
                    autoFocus
                    value={newConfig.provider || ''} 
                    onChange={e => setNewConfig({ ...newConfig, provider: e.target.value.toLowerCase() })} 
                    className="input"
                  >
                    <option value="">Choose a provider</option>
                    <option value="github">GitHub</option>
                    <option value="stripe">Stripe</option>
                  </select>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                    The provider name will dictate the endpoint URL: <code>/api/webhooks/[provider]</code>
                  </p>
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowWizard(false)} className="btn btn-ghost">Cancel</button>
                  <button onClick={() => setWizardStep(2)} className="btn btn-primary" disabled={!newConfig.provider}>Next</button>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div>
                <h3 style={{ marginBottom: '16px' }}>Security & Configuration</h3>
                <div className="form-group">
                  <label className="form-label">Webhook Secret</label>
                  <input 
                    type="password" 
                    value={newConfig.secret || ''} 
                    onChange={e => setNewConfig({ ...newConfig, secret: e.target.value })} 
                    className="input" 
                    placeholder="Shared secret for HMAC validation"
                  />
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                    Without a secret, the webhook will reject incoming requests for security reasons.
                  </p>
                </div>
                <div className="form-group">
                  <label className="form-label">Events to Listen For (Comma separated)</label>
                  <input 
                    type="text" 
                    value={newConfig.events?.join(',') || ''} 
                    onChange={e => setNewConfig({ ...newConfig, events: e.target.value.split(',').map(s => s.trim()) })} 
                    className="input" 
                    placeholder="push, pull_request (optional)"
                  />
                </div>
                <div className="modal-actions">
                  <button onClick={() => setWizardStep(1)} className="btn btn-ghost">Back</button>
                  <button onClick={() => setWizardStep(3)} className="btn btn-primary">Next</button>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div>
                <h3 style={{ marginBottom: '16px' }}>Review & Save</h3>
                <div style={{ background: 'var(--bg-hover)', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
                  <p><strong>Provider:</strong> {newConfig.provider}</p>
                  <p><strong>Secret:</strong> {newConfig.secret ? '•••••••• (Configured)' : 'None (Warning)'}</p>
                  <p><strong>Events:</strong> {newConfig.events?.length ? newConfig.events.join(', ') : 'All Events'}</p>
                  <p><strong>Status:</strong> <span className="badge badge-online">Active</span></p>
                  <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>
                    Your endpoint URL will be:<br/>
                    <code>https://your-domain.com/api/webhooks/{newConfig.provider}</code>
                  </p>
                </div>
                <div className="modal-actions">
                  <button onClick={() => setWizardStep(2)} className="btn btn-ghost">Back</button>
                  <button onClick={handleWizardSave} className="btn btn-primary">Save Webhook</button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
