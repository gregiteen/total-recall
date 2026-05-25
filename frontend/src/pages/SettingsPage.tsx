import { useState, useEffect } from 'react';
import { fetchConfigJson, saveConfigJson, fetchConfig, saveConfig } from '../api';
import type { ConfigJson } from '../types';

export default function SettingsPage() {
  const [viewMode, setViewMode] = useState<'visual' | 'yaml'>('visual');
  const [activeYamlTab, setActiveYamlTab] = useState<'frontier.yml' | 'security.yml' | 'budget.yml'>('security.yml');
  
  // Visual Form State
  const [configData, setConfigData] = useState<ConfigJson | null>(null);
  
  // YAML Text Area State
  const [yamlContent, setYamlContent] = useState('');
  
  // UI States
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load JSON for Visual Form
  const loadVisualConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConfigJson();
      // Enforce default structures if missing
      if (!data.security) data.security = {};
      if (!data.security.privacy) data.security.privacy = { enforce_local_only: true, allow_frontier_export: 'ask_per_skill' };
      if (!data.security.dashboard) data.security.dashboard = { session_ttl_hours: 24 };
      if (!data.security.bind) data.security.bind = { host: '127.0.0.1', port: 3000, allow_public_bind: false };
      if (!data.security.network) data.security.network = { require_https: true, public_health: false, allowed_origins: [] };
      if (!data.security.rate_limits) data.security.rate_limits = { api_requests_per_minute: 60, sandbox_requests_per_minute: 10, ingest_requests_per_minute: 120 };
      if (!data.budget) data.budget = {};
      if (!data.budget.budget) data.budget.budget = { daily_cap_usd: 5.0, weekly_cap_usd: 25.0, enabled: true };
      
      setConfigData(data);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load configuration.');
    } finally {
      setLoading(false);
    }
  };

  // Load YAML string for Raw Editor
  const loadYamlConfig = async (name: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConfig(name);
      setYamlContent(data);
    } catch (err: unknown) {
      setError((err as Error).message || `Failed to load ${name}.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'visual') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate config loader on visual active
      void loadVisualConfig();
    } else {
       
      void loadYamlConfig(activeYamlTab);
    }
  }, [viewMode, activeYamlTab]);

  // Save Visual Form JSON
  const handleSaveVisual = async () => {
    if (!configData) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await saveConfigJson(configData);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  // Save YAML Text
  const handleSaveYaml = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await saveConfig(activeYamlTab, yamlContent);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: unknown) {
      setError((err as Error).message || `Failed to save ${activeYamlTab}.`);
    } finally {
      setSaving(false);
    }
  };

  // Safe mutators for deeply nested properties
  const updateSecurityProp = (section: string, prop: string, value: unknown) => {
    if (!configData) return;
    setConfigData({
      ...configData,
      security: {
        ...configData.security,
        [section]: {
          ...(configData.security[section] as Record<string, unknown>),
          [prop]: value
        }
      }
    });
  };

  const updateRootSecurityProp = (prop: string, value: unknown) => {
    if (!configData) return;
    setConfigData({
      ...configData,
      security: {
        ...configData.security,
        [prop]: value
      }
    });
  };

  const updateBudgetProp = (prop: string, value: unknown) => {
    if (!configData) return;
    setConfigData({
      ...configData,
      budget: {
        ...configData.budget,
        budget: {
          ...configData.budget.budget,
          [prop]: value
        }
      }
    });
  };

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1>System Settings</h1>
          <p>Read, write, and toggle UI and dashboard settings directly from the terminal or control panel</p>
        </div>
        
        {/* Toggle Mode Button */}
        <div style={{ display: 'flex', gap: 8, background: 'var(--bg-secondary)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
          <button
            onClick={() => setViewMode('visual')}
            className="btn btn-sm"
            style={{
              background: viewMode === 'visual' ? 'var(--accent)' : 'transparent',
              color: viewMode === 'visual' ? '#fff' : 'var(--text-secondary)',
              borderRadius: 6,
              fontSize: 12
            }}
          >
            🎛️ Control Panel
          </button>
          <button
            onClick={() => setViewMode('yaml')}
            className="btn btn-sm"
            style={{
              background: viewMode === 'yaml' ? 'var(--accent)' : 'transparent',
              color: viewMode === 'yaml' ? '#fff' : 'var(--text-secondary)',
              borderRadius: 6,
              fontSize: 12
            }}
          >
            📝 Raw YAML Editor
          </button>
        </div>
      </div>

      {error && (
        <div className="badge badge-error" style={{ marginBottom: 20, display: 'inline-flex', padding: '6px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#f87171' }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="badge badge-success" style={{ marginBottom: 20, display: 'inline-flex', padding: '6px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#34d399' }}>
          ✓ Saved successfully! The memory kernel will hot-reload configuration settings instantly.
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          <div>Retrieving brain configuration state...</div>
        </div>
      ) : viewMode === 'visual' && configData ? (
        /* ==================== VISUAL CONTROL PANEL UI ==================== */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24, flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 24 }}>
          
          {/* Card 1: AI Reasoning & Autonomy */}
          <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <span style={{ fontSize: 20 }}>🧠</span>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>Reasoning & Autonomy</h3>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Control AI routing agent behaviors and local boundaries</p>
              </div>
            </div>

            {/* YOLO Mode Switch */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <label htmlFor="yolo_mode" style={{ fontSize: 13, fontWeight: 500, display: 'block' }}>YOLO Mode (Fully Autonomous)</label>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Execute workflows without prompt confirmation gates</span>
              </div>
              <input
                id="yolo_mode"
                type="checkbox"
                checked={configData.security.yolo_mode || false}
                onChange={(e) => updateRootSecurityProp('yolo_mode', e.target.checked)}
                style={{ width: 44, height: 22, cursor: 'pointer', accentColor: 'var(--accent)' }}
              />
            </div>

            {/* Local Privacy Switch */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <label htmlFor="enforce_local_only" style={{ fontSize: 13, fontWeight: 500, display: 'block' }}>Local Privacy Isolation</label>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Enforce local execution; never stream to cloud APIs</span>
              </div>
              <input
                id="enforce_local_only"
                type="checkbox"
                checked={configData.security.privacy?.enforce_local_only || false}
                onChange={(e) => updateSecurityProp('privacy', 'enforce_local_only', e.target.checked)}
                style={{ width: 44, height: 22, cursor: 'pointer', accentColor: 'var(--accent)' }}
              />
            </div>

            {/* Export policy */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="allow_frontier_export" style={{ fontSize: 13, fontWeight: 500 }}>Frontier API Export Policy</label>
              <select
                id="allow_frontier_export"
                value={configData.security.privacy?.allow_frontier_export || 'ask_per_skill'}
                onChange={(e) => updateSecurityProp('privacy', 'allow_frontier_export', e.target.value)}
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  padding: '8px 12px',
                  borderRadius: 6,
                  outline: 'none',
                  fontSize: 13
                }}
              >
                <option value="always">Always Route (YOLO Mode)</option>
                <option value="ask_per_skill">Ask Per Skill Trigger</option>
                <option value="never">Never Route (Fully Air-Gapped)</option>
              </select>
            </div>
          </div>

          {/* Card 2: Cost Control & Budget */}
          <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <span style={{ fontSize: 20 }}>🪙</span>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>Sovereign Cost Supervisor</h3>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Track dollar cost consumption limits dynamically</p>
              </div>
            </div>

            {/* Budget enabled Switch */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <label htmlFor="budget_enabled" style={{ fontSize: 13, fontWeight: 500, display: 'block' }}>Supervision Active</label>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Block LLM requests if cap limits are exceeded</span>
              </div>
              <input
                id="budget_enabled"
                type="checkbox"
                checked={configData.budget.budget?.enabled !== false}
                onChange={(e) => updateBudgetProp('enabled', e.target.checked)}
                style={{ width: 44, height: 22, cursor: 'pointer', accentColor: 'var(--accent)' }}
              />
            </div>

            {/* Daily limit */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="daily_cap" style={{ fontSize: 13, fontWeight: 500 }}>Daily Capital Cap ($ USD)</label>
              <input
                id="daily_cap"
                type="number"
                step="0.01"
                min="0"
                value={configData.budget.budget?.daily_cap_usd || ''}
                onChange={(e) => updateBudgetProp('daily_cap_usd', Number(e.target.value))}
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  padding: '8px 12px',
                  borderRadius: 6,
                  outline: 'none',
                  fontSize: 13
                }}
              />
            </div>

            {/* Weekly limit */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="weekly_cap" style={{ fontSize: 13, fontWeight: 500 }}>Weekly Capital Cap ($ USD)</label>
              <input
                id="weekly_cap"
                type="number"
                step="0.01"
                min="0"
                value={configData.budget.budget?.weekly_cap_usd || ''}
                onChange={(e) => updateBudgetProp('weekly_cap_usd', Number(e.target.value))}
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  padding: '8px 12px',
                  borderRadius: 6,
                  outline: 'none',
                  fontSize: 13
                }}
              />
            </div>
          </div>

          {/* Card 3: Dashboard & Sessions */}
          <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <span style={{ fontSize: 20 }}>🔒</span>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>Security & Tunnels</h3>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Manage network exposure, binding, and session lifetimes</p>
              </div>
            </div>

            {/* Force Reset */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <label htmlFor="force_reset" style={{ fontSize: 13, fontWeight: 500, display: 'block' }}>Force Password Change</label>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Prompt admin to reset credentials on next dashboard visit</span>
              </div>
              <input
                id="force_reset"
                type="checkbox"
                checked={configData.security.dashboard?.force_password_reset || false}
                onChange={(e) => updateSecurityProp('dashboard', 'force_password_reset', e.target.checked)}
                style={{ width: 44, height: 22, cursor: 'pointer', accentColor: 'var(--accent)' }}
              />
            </div>

            {/* Enforce HTTPS */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <label htmlFor="require_https" style={{ fontSize: 13, fontWeight: 500, display: 'block' }}>Require HTTPS Tunneling</label>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Block non-localhost requests that arrive without SSL</span>
              </div>
              <input
                id="require_https"
                type="checkbox"
                checked={configData.security.network?.require_https || false}
                onChange={(e) => updateSecurityProp('network', 'require_https', e.target.checked)}
                style={{ width: 44, height: 22, cursor: 'pointer', accentColor: 'var(--accent)' }}
              />
            </div>

            {/* Public Health */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <label htmlFor="public_health" style={{ fontSize: 13, fontWeight: 500, display: 'block' }}>Public Health Route</label>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Keep /health status checker accessible to public probes</span>
              </div>
              <input
                id="public_health"
                type="checkbox"
                checked={configData.security.network?.public_health || false}
                onChange={(e) => updateSecurityProp('network', 'public_health', e.target.checked)}
                style={{ width: 44, height: 22, cursor: 'pointer', accentColor: 'var(--accent)' }}
              />
            </div>

            {/* Session TTL Slider */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="session_ttl" style={{ fontSize: 13, fontWeight: 500 }}>Session Lifetime (TTL)</label>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{configData.security.dashboard?.session_ttl_hours || 24} hours</span>
              </div>
              <input
                id="session_ttl"
                type="range"
                min="1"
                max="168"
                value={configData.security.dashboard?.session_ttl_hours || 24}
                onChange={(e) => updateSecurityProp('dashboard', 'session_ttl_hours', Number(e.target.value))}
                style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
              />
            </div>
          </div>

          {/* Card 4: Network & CORS Limits */}
          <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <span style={{ fontSize: 20 }}>🛡️</span>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>CORS & Traffic Gateways</h3>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Adjust port bindings and enforce request quotas</p>
              </div>
            </div>

            {/* Port input */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="bind_host" style={{ fontSize: 12, fontWeight: 500 }}>Binding Host</label>
                <input
                  id="bind_host"
                  type="text"
                  value={configData.security.bind?.host || ''}
                  onChange={(e) => updateSecurityProp('bind', 'host', e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    outline: 'none',
                    fontSize: 13
                  }}
                />
              </div>
              <div style={{ width: 100, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="bind_port" style={{ fontSize: 12, fontWeight: 500 }}>Port</label>
                <input
                  id="bind_port"
                  type="number"
                  value={configData.security.bind?.port || 3000}
                  onChange={(e) => updateSecurityProp('bind', 'port', Number(e.target.value))}
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    outline: 'none',
                    fontSize: 13
                  }}
                />
              </div>
            </div>

            {/* Allowed origins input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="allowed_origins" style={{ fontSize: 13, fontWeight: 500 }}>CORS Allowed Origins</label>
              <input
                id="allowed_origins"
                type="text"
                placeholder="e.g. http://localhost:5173,http://localhost:3000"
                value={Array.isArray(configData.security.network?.allowed_origins) ? configData.security.network.allowed_origins.join(',') : ''}
                onChange={(e) => updateSecurityProp('network', 'allowed_origins', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  padding: '8px 12px',
                  borderRadius: 6,
                  outline: 'none',
                  fontSize: 13
                }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Separate multiple domains with commas</span>
            </div>

            {/* API Requests rate limit */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="api_requests" style={{ fontSize: 13, fontWeight: 500 }}>API Requests Rate Limit (/min)</label>
              <input
                id="api_requests"
                type="number"
                value={configData.security.rate_limits?.api_requests_per_minute || ''}
                onChange={(e) => updateSecurityProp('rate_limits', 'api_requests_per_minute', Number(e.target.value))}
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  padding: '8px 12px',
                  borderRadius: 6,
                  outline: 'none',
                  fontSize: 13
                }}
              />
            </div>
          </div>

        </div>
      ) : (
        /* ==================== RAW YAML EDITOR UI ==================== */
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          
          {/* Sub tabs for config selection */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12, flexShrink: 0 }}>
            <button 
              className={`btn btn-sm ${activeYamlTab === 'frontier.yml' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveYamlTab('frontier.yml')}
              style={{ fontSize: 12 }}
            >
              🌐 Frontier (frontier.yml)
            </button>
            <button 
              className={`btn btn-sm ${activeYamlTab === 'security.yml' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveYamlTab('security.yml')}
              style={{ fontSize: 12 }}
            >
              🔒 Security (security.yml)
            </button>
            <button 
              className={`btn btn-sm ${activeYamlTab === 'budget.yml' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveYamlTab('budget.yml')}
              style={{ fontSize: 12 }}
            >
              🪙 Budget (budget.yml)
            </button>
          </div>

          {/* Code text editor */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <textarea
              value={yamlContent}
              onChange={(e) => setYamlContent(e.target.value)}
              style={{
                flex: 1,
                width: '100%',
                fontFamily: 'monospace',
                fontSize: 14,
                padding: 16,
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                resize: 'none',
                outline: 'none',
                lineHeight: 1.5,
                whiteSpace: 'pre',
                overflowWrap: 'normal',
                overflowX: 'auto'
              }}
              spellCheck={false}
            />
          </div>
        </div>
      )}

      {/* FOOTER ACTIONS */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16, flexShrink: 0 }}>
        <button 
          className="btn btn-primary" 
          onClick={viewMode === 'visual' ? handleSaveVisual : handleSaveYaml} 
          disabled={loading || saving}
          style={{
            width: 140,
            background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
            color: '#fff',
            fontWeight: 500,
            borderRadius: 6
          }}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
