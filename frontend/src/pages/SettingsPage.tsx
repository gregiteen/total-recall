import React, { useState, useEffect } from 'react';
import { fetchConfigJson, saveConfigJson, runSandbox, fetchHealth, runAgentDiagnostics, checkUpdate, runUpdate, fetchBrains } from '../api';
import type { HealthData } from '../types';
import type { ConfigJson } from '../types';

export default function SettingsPage() {
  const [configData, setConfigData] = useState<ConfigJson | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [sandboxLog, setSandboxLog] = useState('');
  const [domainToBlock, setDomainToBlock] = useState('');

  const [health, setHealth] = useState<HealthData | null>(null);
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string | null>(null);

  const [updateInfo, setUpdateInfo] = useState<{ updateAvailable: boolean, latestVersion?: string } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  
  const [brains, setBrains] = useState<any[]>([]);
  const activeBrain = localStorage.getItem('total-recall-active-brain') || '';
  
  useEffect(() => {
    fetchHealth().then(setHealth).catch(console.error);
    checkUpdate().then(setUpdateInfo).catch(console.error);
    fetchBrains().then(setBrains).catch(console.error);
    fetchConfigJson()
      .then(data => {
        // Ensure all nested structures exist for controlled inputs
        if (!data.security) data.security = {};
        if (!data.security.dashboard) data.security.dashboard = {};
        if (!data.security.api) data.security.api = {};
        if (!data.security.network) data.security.network = {};
        if (!data.security.bind) data.security.bind = {};
        if (!data.security.rate_limits) data.security.rate_limits = {};
        if (!data.security.sandbox) data.security.sandbox = {};
        if (!data.security.privacy) data.security.privacy = {};
        if (!data.budget) data.budget = { budget: {} };
        if (!data.budget.budget) data.budget.budget = {};
        if (!data.brain) data.brain = {};
        if (!data.secrets) data.secrets = {};
        setConfigData(data);
      })
      .catch(console.error);
  }, []);

  
  const AGENTS_LIST = [
    { id: 'antigravity', name: 'Antigravity (Gemini SDK)', desc: 'Primary core developer agent' },
    { id: 'gemini', name: 'Gemini CLI', desc: 'Direct Gemini assistant binary' },
    { id: 'claude', name: 'Claude Code', desc: 'Anthropic developer CLI wrapper' },
    { id: 'codex', name: 'Codex CLI', desc: 'OpenAI agent binary integration' },
    { id: 'grok', name: 'Grok CLI', desc: 'xAI developer binary integration' }
  ];

  const handleRunDiagnostics = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunningDiagnostics(true);
    setDiagnosticLogs(null);
    try {
      const res = await runAgentDiagnostics();
      setDiagnosticLogs(res.output);
      fetchHealth().then(setHealth).catch(console.error);
    } catch (err: any) {
      setDiagnosticLogs('Error: ' + err.message);
    } finally {
      setRunningDiagnostics(false);
    }
  };

  const handleRunUpdate = async () => {
    setUpdating(true);
    setUpdateMessage(null);
    try {
      const res = await runUpdate();
      setUpdateMessage(res.success ? 'Update complete. Restarting...' : 'Update failed: ' + res.message);
    } catch (err: any) {
      setUpdateMessage('Update error: ' + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveVisual = async () => {
    if (!configData) return;
    setSaveStatus('saving');
    try {
      await saveConfigJson(configData);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const executeSandboxCommand = async (command: string, description: string) => {
    setSandboxLog(`[Running] ${description}...\n$ ${command}`);
    const res = await runSandbox(`
      const { execSync } = require('child_process');
      try {
        const out = execSync('${command}', { encoding: 'utf8' });
        console.log(out);
      } catch (e) {
        console.error(e.stdout || e.message);
      }
    `);
    setSandboxLog(`[Finished] ${description}\n\n` + res.output);
  };

  // State Update Helpers
  const updateSecurityProp = (key: string, value: any) => {
    setConfigData(prev => prev ? { ...prev, security: { ...prev.security, [key]: value } } : null);
  };

  const updateSecurityNested = (category: string, key: string, value: any) => {
    setConfigData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        security: {
          ...prev.security,
          [category]: {
            ...((prev.security as any)[category] || {}),
            [key]: value
          }
        }
      };
    });
  };

  const updateBudgetProp = (key: string, value: any) => {
    setConfigData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        budget: {
          ...prev.budget,
          budget: {
            ...(prev.budget.budget || {}),
            [key]: value
          }
        }
      };
    });
  };

  const updateBrainProp = (key: string, value: any) => {
    setConfigData(prev => prev ? { ...prev, brain: { ...prev.brain, [key]: value } } : null);
  };

  const updateSecretProp = (key: string, value: any) => {
    setConfigData(prev => prev ? { ...prev, secrets: { ...prev.secrets, [key]: value } } : null);
  };

  // Instead of parsing it back and forth on every keystroke, 
  // we just use simple helpers that don't aggressively trim trailing commas.
  const getCsv = (arr: any) => Array.isArray(arr) ? arr.join(', ') : '';
  const setCsv = (str: string) => str.split(',').map(s => s.trimStart());

  if (!configData) {
    return (
      <div style={{ padding: 40, color: 'var(--text-secondary)' }}>
        <div className="glass-card" style={{ display: 'inline-block', padding: '12px 24px' }}>
          Loading Settings...
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page-wrapper">
      <style>{`
        .settings-page-wrapper {
          padding: 32px 40px 100px;
          max-width: 1200px;
          margin: 0 auto;
          animation: fade-in 0.4s ease-out;
        }

        .settings-header-sticky {
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(13, 17, 23, 0.85);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          padding: 24px 0;
          margin-bottom: 32px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .settings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
          gap: 24px;
        }

        .settings-card {
          background: rgba(23, 32, 51, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 28px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
          position: relative;
          overflow: hidden;
        }
        
        .settings-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; height: 100%;
          background: radial-gradient(circle at top right, rgba(255,255,255,0.03), transparent 60%);
          pointer-events: none;
        }

        .settings-card:hover {
          border-color: rgba(255, 255, 255, 0.12);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
        }

        .settings-icon-wrap {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          border: 1px solid rgba(255,255,255,0.1);
          flex-shrink: 0;
        }

        .field-col {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 20px;
        }

        .field-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 20px;
          padding: 12px 16px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.03);
          transition: border-color 0.2s ease;
        }
        
        .field-row:hover {
          border-color: rgba(255,255,255,0.1);
        }

        .field-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          letter-spacing: 0.3px;
          text-transform: uppercase;
        }

        .settings-input, .settings-select {
          background: rgba(9, 13, 20, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-primary);
          padding: 12px 16px;
          border-radius: 10px;
          font-size: 14px;
          transition: all 0.2s ease;
          width: 100%;
          outline: none;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
        }
        
        .settings-input.secret {
          font-family: 'JetBrains Mono', monospace;
          letter-spacing: 1px;
        }

        .settings-input:focus, .settings-select:focus {
          border-color: var(--accent);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.2), 0 0 0 3px rgba(59, 130, 246, 0.2);
        }

        .settings-checkbox {
          appearance: none;
          width: 44px;
          height: 24px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          position: relative;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          outline: none;
          border: 1px solid rgba(255,255,255,0.05);
          flex-shrink: 0;
        }

        .settings-checkbox::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          width: 18px;
          height: 18px;
          background: #fff;
          border-radius: 50%;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }

        .settings-checkbox:checked {
          background: var(--accent);
          border-color: var(--accent);
          box-shadow: 0 0 12px rgba(59, 130, 246, 0.4);
        }

        .settings-checkbox:checked::after {
          transform: translateX(20px);
        }

        .btn-primary {
          background: linear-gradient(135deg, var(--accent), #2563eb);
          color: #fff;
          border: none;
          padding: 10px 24px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
        }
        
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
        }

        .btn-secondary {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-primary);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 8px 16px;
          border-radius: 8px;
          font-weight: 500;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .terminal-log {
          background: rgba(0, 0, 0, 0.6);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 16px;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 12px;
          color: #a8b2d1;
          white-space: pre-wrap;
          max-height: 200px;
          overflow-y: auto;
          margin-top: 16px;
        }

        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="settings-header-sticky">
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, background: 'linear-gradient(to right, #fff, #a8b2d1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            System Settings
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>
            Configure core system behavior, security, network bindings, and integration layers.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {saveStatus === 'saved' && <span style={{ color: '#34d399', fontSize: 14, fontWeight: 600 }}>✓ Saved successfully</span>}
          {saveStatus === 'error' && <span style={{ color: '#ef4444', fontSize: 14, fontWeight: 600 }}>✗ Save failed</span>}
          <button className="btn-primary" onClick={handleSaveVisual} disabled={saveStatus === 'saving'}>
            {saveStatus === 'saving' ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      <div className="settings-grid">
        
        {/* Network & Binding */}
        <div className="settings-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 20 }}>
            <div className="settings-icon-wrap" style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.05))', borderColor: 'rgba(59, 130, 246, 0.2)' }}>🌐</div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Network & Binding</h3>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>Configure server host and ports</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <div className="field-col" style={{ flex: 1 }}>
              <label htmlFor="bind_host" className="field-label">Bind Host</label>
              <input
                id="bind_host"
                type="text"
                className="settings-input"
                value={configData.security.bind?.host ?? '127.0.0.1'}
                onChange={(e) => updateSecurityNested('bind', 'host', e.target.value)}
              />
            </div>
            <div className="field-col" style={{ width: 100 }}>
              <label htmlFor="bind_port" className="field-label">Port</label>
              <input
                id="bind_port"
                type="number"
                className="settings-input"
                value={configData.security.bind?.port ?? 3000}
                onChange={(e) => updateSecurityNested('bind', 'port', parseInt(e.target.value, 10))}
              />
            </div>
          </div>

          <div className="field-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Allow Public Bind</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Allow listening on 0.0.0.0 interfaces</div>
            </div>
            <input
              type="checkbox"
              className="settings-checkbox"
              checked={!!configData.security.bind?.allow_public_bind}
              onChange={(e) => updateSecurityNested('bind', 'allow_public_bind', e.target.checked)}
            />
          </div>

          <div className="field-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Require HTTPS</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Reject insecure HTTP requests</div>
            </div>
            <input
              type="checkbox"
              className="settings-checkbox"
              checked={!!configData.security.network?.require_https}
              onChange={(e) => updateSecurityNested('network', 'require_https', e.target.checked)}
            />
          </div>

          <div className="field-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Public Health Check</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Allow pinging /health without auth</div>
            </div>
            <input
              type="checkbox"
              className="settings-checkbox"
              checked={!!configData.security.network?.public_health}
              onChange={(e) => updateSecurityNested('network', 'public_health', e.target.checked)}
            />
          </div>

          <div className="field-col">
            <label className="field-label">Allowed Origins (CORS)</label>
            <input
              type="text"
              className="settings-input"
              value={getCsv(configData.security.network?.allowed_origins)}
              onChange={(e) => updateSecurityNested('network', 'allowed_origins', setCsv(e.target.value))}
              placeholder="e.g. https://example.com, https://app.example.com"
            />
          </div>

          <div className="field-col">
            <label className="field-label">Trusted Proxies</label>
            <input
              type="text"
              className="settings-input"
              value={getCsv(configData.security.network?.trusted_proxies)}
              onChange={(e) => updateSecurityNested('network', 'trusted_proxies', setCsv(e.target.value))}
              placeholder="e.g. 10.0.0.1, 192.168.1.1"
            />
          </div>
          
          <div className="field-col">
            <label className="field-label">API Requests Per Minute (Rate Limit)</label>
            <input
              type="number"
              className="settings-input"
              value={configData.security.rate_limits?.api_requests_per_minute ?? 1200}
              onChange={(e) => updateSecurityNested('rate_limits', 'api_requests_per_minute', parseInt(e.target.value, 10))}
            />
          </div>

          <div className="field-col">
            <label className="field-label">Sandbox Requests Per Minute</label>
            <input
              type="number"
              className="settings-input"
              value={configData.security.rate_limits?.sandbox_requests_per_minute ?? 60}
              onChange={(e) => updateSecurityNested('rate_limits', 'sandbox_requests_per_minute', parseInt(e.target.value, 10))}
            />
          </div>

          <div className="field-col">
            <label className="field-label">Ingest Requests Per Minute</label>
            <input
              type="number"
              className="settings-input"
              value={configData.security.rate_limits?.ingest_requests_per_minute ?? 300}
              onChange={(e) => updateSecurityNested('rate_limits', 'ingest_requests_per_minute', parseInt(e.target.value, 10))}
            />
          </div>


        </div>

        {/* Security & Privacy */}
        <div className="settings-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 20 }}>
            <div className="settings-icon-wrap" style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.05))', borderColor: 'rgba(16, 185, 129, 0.2)' }}>🛡️</div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Security & Privacy</h3>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>Manage access control and local sandboxing</p>
            </div>
          </div>

          <div className="field-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Sandbox Enabled</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Enforce strict code sandboxing</div>
            </div>
            <input
              type="checkbox"
              className="settings-checkbox"
              checked={!!configData.security.sandbox?.enabled}
              onChange={(e) => updateSecurityNested('sandbox', 'enabled', e.target.checked)}
            />
          </div>

          <div className="field-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Force Password Reset</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Require password change on next login</div>
            </div>
            <input
              type="checkbox"
              className="settings-checkbox"
              checked={!!configData.security.dashboard?.force_password_reset}
              onChange={(e) => updateSecurityNested('dashboard', 'force_password_reset', e.target.checked)}
            />
          </div>

          <div className="field-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Allow Static PATs</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Enable Personal Access Tokens</div>
            </div>
            <input
              type="checkbox"
              className="settings-checkbox"
              checked={!!configData.security.api?.allow_static_pats}
              onChange={(e) => updateSecurityNested('api', 'allow_static_pats', e.target.checked)}
            />
          </div>



          <div className="field-col">
            <label htmlFor="session_ttl_hours" className="field-label">Dashboard Session TTL (Hours)</label>
            <input
              id="session_ttl_hours"
              type="number"
              className="settings-input"
              value={configData.security.dashboard?.session_ttl_hours ?? 24}
              onChange={(e) => updateSecurityNested('dashboard', 'session_ttl_hours', parseInt(e.target.value, 10))}
            />
          </div>
        </div>

        {/* Budget Controls */}
        <div className="settings-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 20 }}>
            <div className="settings-icon-wrap" style={{ background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.05))', borderColor: 'rgba(245, 158, 11, 0.2)' }}>💰</div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Budget Limits</h3>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>Control AI spending dynamically</p>
            </div>
          </div>

          <div className="field-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Enable Budget Caps</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Enforce hard limits on token spend</div>
            </div>
            <input
              type="checkbox"
              className="settings-checkbox"
              checked={!!configData.budget.budget?.enabled}
              onChange={(e) => updateBudgetProp('enabled', e.target.checked)}
            />
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <div className="field-col" style={{ flex: 1 }}>
              <label htmlFor="daily_cap" className="field-label">Daily Cap ($)</label>
              <input
                id="daily_cap"
                type="number"
                step="0.01"
                className="settings-input"
                value={configData.budget.budget?.daily_cap_usd ?? 5.0}
                onChange={(e) => updateBudgetProp('daily_cap_usd', parseFloat(e.target.value))}
              />
            </div>
            <div className="field-col" style={{ flex: 1 }}>
              <label htmlFor="weekly_cap" className="field-label">Weekly Cap ($)</label>
              <input
                id="weekly_cap"
                type="number"
                step="0.01"
                className="settings-input"
                value={configData.budget.budget?.weekly_cap_usd ?? 20.0}
                onChange={(e) => updateBudgetProp('weekly_cap_usd', parseFloat(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* Brain Configuration */}
        <div className="settings-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 20 }}>
            <div className="settings-icon-wrap" style={{ background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(147, 51, 234, 0.05))', borderColor: 'rgba(168, 85, 247, 0.2)' }}>🧠</div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Brain Configuration</h3>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>Manage memory kernel identities</p>
            </div>
          </div>

          <div className="field-col">
            <label className="field-label" style={{ color: 'var(--text-accent)', fontWeight: 600 }}>Select Active Brain</label>
            <select
              className="settings-select"
              style={{ border: '1px solid var(--border-accent)', background: 'rgba(59, 130, 246, 0.05)' }}
              value={activeBrain}
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  localStorage.setItem('total-recall-active-brain', val);
                } else {
                  localStorage.removeItem('total-recall-active-brain');
                }
                window.location.reload();
              }}
            >
              <option value="">Global Brain (Root)</option>
              {brains.map((b: any) => (
                <option key={b.name} value={b.name}>{b.name} ({b.role} - {b.nodes} nodes)</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <div className="field-col" style={{ flex: 1 }}>
              <label className="field-label">Brain URL</label>
              <input
                type="text"
                className="settings-input"
                value={configData.brain?.url || ''}
                onChange={(e) => updateBrainProp('url', e.target.value)}
              />
            </div>
            <div className="field-col" style={{ flex: 1 }}>
              <label className="field-label">Brain Token</label>
              <input
                type="password"
                className="settings-input"
                placeholder={configData.brain?.has_token ? '•••••••••••••••• (Leave blank)' : 'No token set'}
                value={configData.brain?.token || ''}
                onChange={(e) => updateBrainProp('token', e.target.value)}
              />
            </div>
          </div>

          <div className="field-col">
            <label className="field-label">Brain Name</label>
            <input
              type="text"
              className="settings-input"
              value={configData.brain?.name || ''}
              onChange={(e) => updateBrainProp('name', e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <div className="field-col" style={{ flex: 1 }}>
              <label className="field-label">Role</label>
              <input
                type="text"
                className="settings-input"
                value={configData.brain?.role || ''}
                onChange={(e) => updateBrainProp('role', e.target.value)}
              />
            </div>
            <div className="field-col" style={{ flex: 1 }}>
              <label className="field-label">Layer</label>
              <input
                type="text"
                className="settings-input"
                value={configData.brain?.layer || ''}
                onChange={(e) => updateBrainProp('layer', e.target.value)}
              />
            </div>
          </div>

          <div className="field-col">
            <label className="field-label">Tags (Comma-Separated)</label>
            <input
              type="text"
              className="settings-input"
              value={getCsv(configData.brain?.tags)}
              onChange={(e) => updateBrainProp('tags', setCsv(e.target.value))}
            />
          </div>

          <div className="field-row">
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Full Brain Mode</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Enable omni-directional indexing</div>
            </div>
            <input
              type="checkbox"
              className="settings-checkbox"
              checked={!!configData.brain?.full_brain}
              onChange={(e) => updateBrainProp('full_brain', e.target.checked)}
            />
          </div>

          <div className="field-col">
            <label htmlFor="preferred_agent" className="field-label">Preferred CLI Agent</label>
            <select
              id="preferred_agent"
              className="settings-select"
              value={configData.brain?.preferred_agent || 'auto'}
              onChange={(e) => updateBrainProp('preferred_agent', e.target.value)}
            >
              <option value="auto">Auto-Select (Recommended)</option>
              <option value="antigravity">Antigravity (Google Deepmind)</option>
              <option value="gemini">Gemini (Google)</option>
              <option value="claude">Claude (Anthropic)</option>
              <option value="openai">OpenAI (O-Series)</option>
              <option value="grok">Grok (xAI)</option>
            </select>
          </div>
        </div>

        {/* Extensions & Ecosystem */}
        <div className="settings-card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 20 }}>
            <div className="settings-icon-wrap" style={{ background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.2), rgba(219, 39, 119, 0.05))', borderColor: 'rgba(236, 72, 153, 0.2)' }}>🧩</div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Ecosystem Integrations</h3>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>Chrome extensions, UCW bundles, and tools</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 20 }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>🦊</div>
              <h4 style={{ margin: '0 0 8px', fontSize: 15 }}>Total Recall Browser Extension</h4>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 16px', lineHeight: 1.5 }}>
                Capture context directly from your browser. Install from the Chrome Web Store or load unpacked from <code>/extension</code> directory.
              </p>
              <a href="/api/extension/download" download className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}>Download Extension</a>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>📦</div>
              <h4 style={{ margin: '0 0 8px', fontSize: 15 }}>Admin Toolbox</h4>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 16px', lineHeight: 1.5 }}>
                Execute quick administrative operations via the UCW toolkit and sandbox shell.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button 
                  className="btn-secondary" 
                  style={{ flex: 1 }}
                  onClick={() => executeSandboxCommand('npx total-recall compile', 'Manual Index Recompilation')}
                >
                  Compile
                </button>
                <button 
                  className="btn-primary" 
                  style={{ flex: 1 }}
                  onClick={() => executeSandboxCommand('npx @ssss/cli export ./bundle.ucw', 'Exporting UCW Bundle')}
                >
                  Export Bundle
                </button>
              </div>
            </div>
          </div>

          {sandboxLog && (
            <div className="terminal-log">
              {sandboxLog}
            </div>
          )}
        </div>

        {/* System Updates */}
        <div className="settings-card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 20 }}>
            <div className="settings-icon-wrap" style={{ background: 'linear-gradient(135deg, rgba(63, 185, 80, 0.2), rgba(34, 197, 94, 0.05))', borderColor: 'rgba(63, 185, 80, 0.2)' }}>🚀</div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>System Update</h3>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>Manage Total Recall version updates</p>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, padding: '16px 20px', background: 'rgba(0,0,0,0.2)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {updateInfo?.updateAvailable ? `Update Available (v${updateInfo.latestVersion})` : 'System is up to date'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                {updateInfo?.updateAvailable ? 'A new version of Total Recall is available for download.' : 'You are running the latest version.'}
              </div>
              {updateMessage && (
                <div style={{ fontSize: 12, color: updateMessage.includes('error') || updateMessage.includes('failed') ? '#ef4444' : '#10b981', marginTop: 8 }}>
                  {updateMessage}
                </div>
              )}
            </div>
            {updateInfo?.updateAvailable && (
              <button 
                className="btn-primary"
                onClick={handleRunUpdate}
                disabled={updating}
                style={{ background: '#3fb950', border: 'none' }}
              >
                {updating ? 'Updating...' : 'Download & Restart'}
              </button>
            )}
          </div>
        </div>

        {/* CLI Agents */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24 }}>
            
            {/* Catalog */}
            <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <span style={{ fontSize: 20 }}>🧠</span>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>CLI Reasoning Agents</h3>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Headless CLI reasoning agents configured on system</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {AGENTS_LIST.map((a) => {
                  const activeAgent = health?.cli_agents?.includes(a.id);
                  return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{a.name}</span>
                          <span className="badge" style={{
                            fontSize: 9,
                            padding: '2px 6px',
                            background: activeAgent ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: activeAgent ? '#10b981' : '#ef4444',
                            border: activeAgent ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
                          }}>
                            {activeAgent ? 'available' : 'missing'}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{a.desc}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 4 }}>Registry ID: {a.id}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Diagnostics Form */}
            <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <span style={{ fontSize: 20 }}>📡</span>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>CLI Agent Diagnostics</h3>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Trigger active paths check and verify registered agents</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                  This executes a diagnostic check on registered reasoning agents (equivalent to running <code>npx total-recall upgrade --agents</code> in the background) to audit paths and verify binaries.
                </p>

                <button
                  onClick={handleRunDiagnostics}
                  disabled={runningDiagnostics}
                  style={{
                    background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                    color: '#fff',
                    padding: '10px',
                    borderRadius: 6,
                    fontWeight: 500,
                    border: 'none',
                    marginTop: 8,
                    cursor: runningDiagnostics ? 'not-allowed' : 'pointer'
                  }}
                >
                  {runningDiagnostics ? '⏳ Running Audit...' : '🚀 Run Diagnostics Audit'}
                </button>
              </div>

              {diagnosticLogs && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>Diagnostics Console Output:</span>
                  <pre style={{
                    background: '#07070a',
                    border: '1px solid var(--border)',
                    padding: 10,
                    borderRadius: 6,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: '#e6edf3',
                    whiteSpace: 'pre-wrap',
                    maxHeight: 150,
                    overflowY: 'auto'
                  }}>
                    {diagnosticLogs}
                  </pre>
                </div>
              )}
            </div>
      </div>
    </div>
  );
}
