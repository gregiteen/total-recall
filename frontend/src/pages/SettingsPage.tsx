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
      if (!data.brain) data.brain = {};
      if (!data.brain.preferred_agent) data.brain.preferred_agent = 'auto';
      if (!data.secrets) data.secrets = {};
      
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

  const updateBrainProp = (prop: string, value: unknown) => {
    if (!configData) return;
    setConfigData({
      ...configData,
      brain: {
        ...configData.brain,
        [prop]: value as string
      }
    });
  };

  const updateSecretsProp = (prop: string, value: string) => {
    if (!configData) return;
    setConfigData({
      ...configData,
      secrets: {
        ...configData.secrets,
        [prop]: value
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
        <form onSubmit={(e) => { e.preventDefault(); handleSaveVisual(); }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24, flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 24 }}>
          
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

            {/* Preferred CLI Agent Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="preferred_agent" style={{ fontSize: 13, fontWeight: 500 }}>Preferred CLI Agent</label>
              <select
                id="preferred_agent"
                value={configData.brain?.preferred_agent || 'auto'}
                onChange={(e) => updateBrainProp('preferred_agent', e.target.value)}
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
                <option value="auto">Auto (Smart Routing / System Default)</option>
                <option value="claude">Claude Code (Anthropic CLI Agent)</option>
                <option value="gemini">Gemini CLI (Google Developer Agent)</option>
                <option value="codex">OpenAI Codex (OpenAI Workspace Suite)</option>
                <option value="antigravity">Antigravity (Local Sovereign Agent)</option>
              </select>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Elevates selected agent as the active primary for all dispatches</span>
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

          {/* Card 5: API Keys & Integrations */}
          <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <span style={{ fontSize: 20 }}>🔑</span>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>API Keys & Integrations</h3>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Manage access keys and tokens for AI models and search providers</p>
              </div>
            </div>

            {/* Google Gemini API Key */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="google_api_key" style={{ fontSize: 13, fontWeight: 500 }}>Google Gemini API Key</label>
              <input
                id="google_api_key"
                type="password"
                placeholder="AIzaSy..."
                value={configData.secrets?.google_api_key || ''}
                onChange={(e) => updateSecretsProp('google_api_key', e.target.value)}
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

            {/* Anthropic API Key */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="anthropic_api_key" style={{ fontSize: 13, fontWeight: 500 }}>Anthropic API Key (Claude Code)</label>
              <input
                id="anthropic_api_key"
                type="password"
                placeholder="sk-ant-..."
                value={configData.secrets?.anthropic_api_key || ''}
                onChange={(e) => updateSecretsProp('anthropic_api_key', e.target.value)}
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
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Configuring this allows Claude Code CLI to run without prompting for OAuth login.</span>
            </div>

            {/* OpenAI API Key */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="openai_api_key" style={{ fontSize: 13, fontWeight: 500 }}>OpenAI API Key (Codex)</label>
              <input
                id="openai_api_key"
                type="password"
                placeholder="sk-proj-..."
                value={configData.secrets?.openai_api_key || ''}
                onChange={(e) => updateSecretsProp('openai_api_key', e.target.value)}
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

            {/* Tavily API Key */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="tavily_api_key" style={{ fontSize: 13, fontWeight: 500 }}>Tavily Search API Key</label>
              <input
                id="tavily_api_key"
                type="password"
                placeholder="tvly-..."
                value={configData.secrets?.tavily_api_key || ''}
                onChange={(e) => updateSecretsProp('tavily_api_key', e.target.value)}
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

            {/* Other Search Keys (Brave, Exa, Serper) */}
            <details style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 500, outline: 'none', padding: '4px 0' }}>More Provider Keys (Brave, Exa, Serper, GitHub)</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12, paddingLeft: 8, borderLeft: '2px solid var(--border)' }}>
                {/* Brave Search Key */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label htmlFor="brave_api_key" style={{ fontSize: 12, fontWeight: 500 }}>Brave Search API Key</label>
                  <input
                    id="brave_api_key"
                    type="password"
                    value={configData.secrets?.brave_api_key || ''}
                    onChange={(e) => updateSecretsProp('brave_api_key', e.target.value)}
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

                {/* Exa Search Key */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label htmlFor="exa_api_key" style={{ fontSize: 12, fontWeight: 500 }}>Exa API Key</label>
                  <input
                    id="exa_api_key"
                    type="password"
                    value={configData.secrets?.exa_api_key || ''}
                    onChange={(e) => updateSecretsProp('exa_api_key', e.target.value)}
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

                {/* Serper API Key */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label htmlFor="serper_api_key" style={{ fontSize: 12, fontWeight: 500 }}>Serper (Google Search API) Key</label>
                  <input
                    id="serper_api_key"
                    type="password"
                    value={configData.secrets?.serper_api_key || ''}
                    onChange={(e) => updateSecretsProp('serper_api_key', e.target.value)}
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

                {/* GitHub Token */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label htmlFor="github_token" style={{ fontSize: 12, fontWeight: 500 }}>GitHub Personal Access Token</label>
                  <input
                    id="github_token"
                    type="password"
                    placeholder="ghp_..."
                    value={configData.secrets?.github_token || ''}
                    onChange={(e) => updateSecretsProp('github_token', e.target.value)}
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
            </details>
          </div>

        </form>
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

      {/* CHROME EXTENSION */}
      <div style={{
        marginTop: 24,
        padding: 20,
        background: 'linear-gradient(135deg, rgba(108, 92, 231, 0.08), rgba(99, 179, 237, 0.08))',
        border: '1px solid rgba(108, 92, 231, 0.25)',
        borderRadius: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 24 }}>🧩</span>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Chrome Extension</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
              Browse with your brain — contextual memory, quick capture, and research from any page
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <a
            href="/api/extension/download"
            download
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)',
              color: '#fff',
              borderRadius: 8,
              fontWeight: 500,
              fontSize: 13,
              textDecoration: 'none',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            ⬇ Download Extension
          </a>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            Unzip → chrome://extensions → Developer mode → Load unpacked
          </span>
        </div>
      </div>

      {/* UCW WORKSPACE EXPORT (SSSS §16 .ucw Bundle Format) */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 20,
        marginTop: 20,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>UCW Bundle (SSSS §16)</h3>
          <span className="badge badge-accent" style={{ fontSize: 10, padding: '2px 8px' }}>UltraChat Workspace</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Export your vault as a <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono, monospace)' }}>package.ucw.json</code> bundle 
          per the SSSS §16 Universal Containerized Workspace format. Bundles can be backed up, shared, sold, and re-provisioned across any SSSS-compatible host.
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>Export Profile</label>
            <select
              id="ucw-export-profile"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 12, outline: 'none' }}
            >
              <option value="backup">backup — full vault snapshot</option>
              <option value="template">template — strips tenant_private</option>
              <option value="sale">sale — portable marketplace bundle</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 200px' }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>Output Filename</label>
            <input
              id="ucw-export-filename"
              type="text"
              defaultValue="package.ucw.json"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 12, outline: 'none', fontFamily: 'var(--font-mono, monospace)' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            id="ucw-export-btn"
            className="btn btn-primary"
            style={{ background: 'linear-gradient(135deg, var(--accent), #5a4bd1)', color: '#fff', borderRadius: 6, fontSize: 13, padding: '8px 20px' }}
            onClick={async () => {
              try {
                const profile = (document.getElementById('ucw-export-profile') as HTMLSelectElement)?.value || 'backup';
                const filename = (document.getElementById('ucw-export-filename') as HTMLInputElement)?.value || 'package.ucw.json';
                const { runSandbox } = await import('../api');
                const result = await runSandbox(`const { execSync } = require("child_process"); try { const out = execSync("npx ssss export . --profile ${profile} --out ${filename} 2>&1", { encoding: "utf-8", cwd: process.env.HOME + "/.agent/skills/total-recall" }); console.log(JSON.stringify({ success: true, output: out })); } catch(e) { console.log(JSON.stringify({ success: false, output: e.stdout || e.message })); }`, 60000);
                if (result.success) {
                  setSuccess(true);
                  setTimeout(() => setSuccess(false), 5000);
                } else {
                  setError(result.output || 'UCW export failed');
                }
              } catch (err: unknown) {
                setError((err as Error).message || 'Export failed');
              }
            }}
          >
            ⬇ Export .ucw Bundle
          </button>
          <button
            id="ucw-validate-btn"
            className="btn btn-ghost"
            style={{ borderRadius: 6, fontSize: 13, padding: '8px 20px' }}
            onClick={async () => {
              try {
                const { runSandbox } = await import('../api');
                const result = await runSandbox('const { execSync } = require("child_process"); try { const out = execSync("npx ssss validate package.ucw.json 2>&1", { encoding: "utf-8", cwd: process.env.HOME + "/.agent/skills/total-recall" }); console.log(JSON.stringify({ success: true, output: out })); } catch(e) { console.log(JSON.stringify({ success: false, output: e.stdout || e.message })); }', 30000);
                if (result.success) {
                  setSuccess(true);
                  setTimeout(() => setSuccess(false), 5000);
                } else {
                  setError(result.output || 'Validation failed');
                }
              } catch (err: unknown) {
                setError((err as Error).message || 'Validation failed');
              }
            }}
          >
            ✓ Validate Bundle
          </button>
          <button
            id="ucw-import-btn"
            className="btn btn-ghost"
            style={{ borderRadius: 6, fontSize: 13, padding: '8px 20px' }}
            onClick={async () => {
              try {
                const { runSandbox } = await import('../api');
                const result = await runSandbox('const { execSync } = require("child_process"); try { const out = execSync("npx ssss import package.ucw.json --vault . 2>&1", { encoding: "utf-8", cwd: process.env.HOME + "/.agent/skills/total-recall" }); console.log(JSON.stringify({ success: true, output: out })); } catch(e) { console.log(JSON.stringify({ success: false, output: e.stdout || e.message })); }', 60000);
                if (result.success) {
                  setSuccess(true);
                  setTimeout(() => setSuccess(false), 5000);
                } else {
                  setError(result.output || 'Import failed');
                }
              } catch (err: unknown) {
                setError((err as Error).message || 'Import failed');
              }
            }}
          >
            ⬆ Import .ucw Bundle
          </button>
          <button
            id="ucw-inspect-btn"
            className="btn btn-ghost"
            style={{ borderRadius: 6, fontSize: 13, padding: '8px 20px' }}
            onClick={async () => {
              try {
                const { runSandbox } = await import('../api');
                const result = await runSandbox('const { execSync } = require("child_process"); try { const out = execSync("npx ssss inspect package.ucw.json --files 2>&1", { encoding: "utf-8", cwd: process.env.HOME + "/.agent/skills/total-recall" }); console.log(JSON.stringify({ success: true, output: out })); } catch(e) { console.log(JSON.stringify({ success: false, output: e.stdout || e.message })); }', 30000);
                if (result.success) {
                  setSuccess(true);
                  setTimeout(() => setSuccess(false), 5000);
                } else {
                  setError(result.output || 'Inspect failed');
                }
              } catch (err: unknown) {
                setError((err as Error).message || 'Inspect failed');
              }
            }}
          >
            🔍 Inspect Bundle
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 12 }}>
          Powered by <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>@ssss/cli</code> v0.7.0 — <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>npx ssss export|import|validate|inspect</code>
        </p>
      </div>

      {/* SECRETS.ENC KEY VIEWER */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 20,
        marginTop: 16,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Stored Secrets (secrets.enc)</h3>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          These credentials are stored in your encrypted secrets file. Values are masked for security.
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          {configData?.secrets && Object.entries(configData.secrets).map(([key, value]) => (
            <div key={key} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.04)',
            }}>
              <span style={{ fontSize: 13, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-primary)' }}>
                {key}
              </span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-tertiary)' }}>
                {value ? `${String(value).slice(0, 4)}${'•'.repeat(Math.min(20, String(value).length - 4))}` : '(not set)'}
              </span>
            </div>
          ))}
          {(!configData?.secrets || Object.keys(configData.secrets).length === 0) && (
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '12px', textAlign: 'center' }}>
              No secrets configured. Add API keys through the visual settings editor above.
            </div>
          )}
        </div>
      </div>

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
