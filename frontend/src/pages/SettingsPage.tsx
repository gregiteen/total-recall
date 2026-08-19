import React, { useState, useEffect } from 'react';
import {
  fetchConfigJson,
  saveConfigJson,
  fetchHealth,
  runAgentDiagnostics,
  checkUpdate,
  runUpdate,
  restartDaemon,
  restartServer,
  triggerRecompile,
  apiFetch,
  getApiBase,
} from '../api';
import type { HealthData } from '../types';
import type { ConfigJson } from '../types';
import { MobilePairing } from '../components/MobilePairing';
import { TailnetEnroll } from '../components/TailnetEnroll';

function normalizeConfigJson(data: ConfigJson): ConfigJson {
  const next = { ...data } as ConfigJson & Record<string, unknown>;
  if (!next.security) next.security = {};
  if (!next.security.dashboard) next.security.dashboard = {};
  if (!next.security.api) next.security.api = {};
  if (!next.security.network) next.security.network = {};
  if (!next.security.bind) next.security.bind = {};
  if (!next.security.rate_limits) next.security.rate_limits = {};
  if (!next.security.sandbox) next.security.sandbox = {};
  if (!next.security.privacy) next.security.privacy = {};
  if (!next.budget) next.budget = { budget: {} };
  if (!next.budget.budget) next.budget.budget = {};
  if (!next.brain) next.brain = {};
  if (!next.secrets) next.secrets = {};
  return next;
}

export default function SettingsPage({ activeBrainId }: { activeBrainId?: string }) {
  const [configData, setConfigData] = useState<ConfigJson | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [sandboxLog, setSandboxLog] = useState('');


  const [health, setHealth] = useState<HealthData | null>(null);
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string | null>(null);

  const [updateInfo, setUpdateInfo] = useState<{
    updateAvailable: boolean;
    latestVersion?: string;
    currentVersion?: string;
  } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [restartingDaemon, setRestartingDaemon] = useState(false);
  const [restartingServer, setRestartingServer] = useState(false);

  const handleRestartServer = async () => {
    setRestartingServer(true);
    setUpdateMessage(null);
    try {
      const res = await restartServer();
      setUpdateMessage(res.message);
      if (res.scheduled) {
        // The server is about to drop this connection on purpose. Poll health
        // until it answers again instead of leaving the page looking hung.
        setTimeout(function poll(attempt = 0) {
          fetchHealth()
            .then((h) => {
              setHealth(h);
              setUpdateMessage('Server restarted — reconnected.');
              setRestartingServer(false);
            })
            .catch(() => {
              if (attempt >= 20) {
                setUpdateMessage('Server restarted but has not answered yet — reload in a moment.');
                setRestartingServer(false);
                return;
              }
              setTimeout(() => poll(attempt + 1), 1500);
            });
        }, 2000);
        return;
      }
    } catch (err: unknown) {
      setUpdateMessage('Restart error: ' + (err as Error).message);
    }
    setRestartingServer(false);
  };

  const handleRestartDaemon = async () => {
    setRestartingDaemon(true);
    setUpdateMessage(null);
    try {
      const res = await restartDaemon();
      setUpdateMessage(res.message || 'Daemon restarted successfully.');
      const h = await fetchHealth().catch(() => null);
      if (h) setHealth(h);
    } catch (err: unknown) {
      setUpdateMessage('Restart error: ' + (err as Error).message);
    } finally {
      setRestartingDaemon(false);
    }
  };
  const [rebuilding, setRebuilding] = useState(false);
  
  const loadConfig = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchConfigJson();
      setConfigData(normalizeConfigJson(data));
    } catch (err) {
      console.error(err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load settings');
      setConfigData(null);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchHealth().then(setHealth).catch(console.error);
    // Update check must never block config load (server used to spawnSync npm view).
    checkUpdate()
      .then((u) =>
        setUpdateInfo({
          updateAvailable: !!u.updateAvailable,
          latestVersion: u.latestVersion,
          currentVersion: u.currentVersion,
        }),
      )
      .catch(console.error);
    setTimeout(() => { void loadConfig(); }, 0);
  }, [activeBrainId]);

  
  const AGENTS_LIST = [
    { id: 'antigravity', name: 'Antigravity (Gemini SDK)', desc: 'Primary core developer agent' },
    { id: 'gemini', name: 'Gemini CLI', desc: 'Direct Gemini assistant binary' },
    { id: 'claude', name: 'Claude Code', desc: 'Anthropic developer CLI wrapper' },
    { id: 'codex', name: 'Codex CLI', desc: 'OpenAI agent binary integration' },
    { id: 'grok', name: 'Grok CLI', desc: 'xAI developer binary integration' }
  ];

  const availableAgents: string[] = Array.isArray(health?.cli_agents)
    ? health.cli_agents
    : Array.isArray((health as unknown as { agents?: string[] } | null)?.agents)
      ? ((health as unknown as { agents: string[] }).agents)
      : [];

  const handleRunDiagnostics = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunningDiagnostics(true);
    setDiagnosticLogs(null);
    try {
      const res = await runAgentDiagnostics();
      setDiagnosticLogs(res.output);
      fetchHealth().then(setHealth).catch(console.error);
    } catch (err: unknown) {
      setDiagnosticLogs('Error: ' + (err as Error).message);
    } finally {
      setRunningDiagnostics(false);
    }
  };

  const handleRunUpdate = async () => {
    setUpdating(true);
    setUpdateMessage(null);
    try {
      const res = await runUpdate();
      if (res.success) {
        const s = res.summary;
        const bits = [
          s?.updated != null ? `${s.updated} updated` : null,
          s?.up_to_date != null ? `${s.up_to_date} current` : null,
          s?.latest ? `latest ${s.latest}` : null,
        ].filter(Boolean);
        // Say what actually happened to this server, rather than telling the
        // user to go work out whether a restart is needed.
        const restartNote = res.restart?.scheduled
          ? ' Server is restarting into the new code.'
          : res.restart?.required
            ? ` Server still runs the old code — ${res.restart.reason}`
            : '';
        setUpdateMessage(
          bits.length
            ? `Update complete — ${bits.join(' · ')}.${restartNote}`
            : (res.message || 'Update complete.') + restartNote,
        );
      } else {
        const failDetail = (res.summary?.results || [])
          .filter((r) => r.status === 'failed')
          .map((r) => `${r.name}: ${r.error || 'failed'}`)
          .slice(0, 3)
          .join('; ');
        setUpdateMessage(
          `Update failed: ${res.message}${failDetail ? ` (${failDetail})` : ''}`,
        );
      }
      const refreshed = await checkUpdate().catch(() => null);
      if (refreshed) {
        setUpdateInfo({
          updateAvailable: !!refreshed.updateAvailable,
          latestVersion: refreshed.latestVersion,
          currentVersion: refreshed.currentVersion,
        });
      }
    } catch (err: unknown) {
      setUpdateMessage('Update error: ' + (err as Error).message);
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveVisual = async () => {
    if (!configData) return;
    setSaveStatus('saving');
    try {
      // Do not persist masked secret placeholders back into the store.
      const payload = { ...configData } as ConfigJson & { secrets?: Record<string, string> };
      if (payload.secrets) {
        const cleaned: Record<string, string> = {};
        for (const [k, v] of Object.entries(payload.secrets)) {
          if (typeof v === 'string' && v && !v.includes('•') && v !== '[redacted]') {
            cleaned[k] = v;
          }
        }
        payload.secrets = cleaned;
      }
      await saveConfigJson(payload);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleRebuildIndex = async () => {
    setRebuilding(true);
    setSandboxLog('[Running] Rebuilding instruction surfaces…');
    try {
      const res = await triggerRecompile();
      setSandboxLog(
        `[Finished] Rebuilding instruction surfaces\n\n${res.message || (res.success ? 'Compile complete.' : 'Compile finished with warnings.')}`,
      );
    } catch (err) {
      setSandboxLog(`[Failed] Rebuild\n\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRebuilding(false);
    }
  };

  const handleDownloadExtension = async () => {
    try {
      const res = await apiFetch(`${getApiBase()}/api/extension/download`);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'total-recall-extension.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setSandboxLog(
        `[Failed] Extension download\n\n${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  // State Update Helpers


  const updateSecurityNested = (category: string, key: string, value: unknown) => {
    setConfigData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        security: {
          ...prev.security,
          [category]: {
            ...((prev.security as Record<string, unknown>)[category] as Record<string, unknown> || {}),
            [key]: value
          }
        }
      };
    });
  };

  const updateBudgetProp = (key: string, value: unknown) => {
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

  const updateBrainProp = (key: string, value: unknown) => {
    setConfigData(prev => prev ? { ...prev, brain: { ...prev.brain, [key]: value } } : null);
  };



  // Instead of parsing it back and forth on every keystroke, 
  // we just use simple helpers that don't aggressively trim trailing commas.
  const getCsv = (arr: unknown) => Array.isArray(arr) ? arr.filter(Boolean).join(', ') : '';
  const setCsv = (str: string) =>
    str
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

  if (loading && !configData) {
    return (
      <div style={{ padding: 40, color: 'var(--text-secondary)' }} data-testid="settings-loading">
        <div className="glass-card" style={{ display: 'inline-block', padding: '12px 24px' }}>
          Loading Settings...
        </div>
      </div>
    );
  }

  if (loadError && !configData) {
    return (
      <div style={{ padding: 40 }} data-testid="settings-error" role="alert">
        <div
          className="glass-card"
          style={{
            display: 'inline-block',
            padding: '16px 24px',
            border: '1px solid #ef4444',
            color: '#ef4444',
          }}
        >
          Failed to load settings: {loadError}
          <button
            type="button"
            className="btn-primary"
            style={{ marginLeft: 16 }}
            onClick={() => loadConfig()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!configData) {
    return null;
  }

  return (
    <div className="settings-page-wrapper" data-testid="settings-page">
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
        <div className="settings-card glow-on-hover">
          <MobilePairing />
        </div>

        <div className="settings-card glow-on-hover">
          <TailnetEnroll />
        </div>

        {/* --- Global System Layer --- */}
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
                onChange={(e) =>
                  updateBudgetProp(
                    'daily_cap_usd',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
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
                onChange={(e) =>
                  updateBudgetProp(
                    'weekly_cap_usd',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
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

          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 12px', lineHeight: 1.5 }}>
            Active vault layer is chosen in the <strong>sidebar brain selector</strong> (bottom left).
            Fields below edit this install’s <code>brain.json</code> identity — not the active layer.
          </p>

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
              <option value="codex">Codex (OpenAI)</option>
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
              <button
                type="button"
                className="btn-primary"
                style={{ display: 'block', width: '100%', boxSizing: 'border-box' }}
                onClick={handleDownloadExtension}
              >
                Download Extension
              </button>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>🛠️</div>
              <h4 style={{ margin: '0 0 8px', fontSize: 15 }}>Developer Utilities</h4>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 16px', lineHeight: 1.5 }}>
                Rebuild compiled instruction surfaces (vault compile) without a shell sandbox.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button 
                  className="btn-secondary" 
                  style={{ flex: 1 }}
                  disabled={rebuilding}
                  onClick={handleRebuildIndex}
                >
                  {rebuilding ? 'Rebuilding…' : 'Rebuild Index'}
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
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, padding: '16px 20px', background: 'rgba(0,0,0,0.2)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {updateInfo?.updateAvailable
                  ? `Update available (latest v${updateInfo.latestVersion || '?'})`
                  : 'Host package is up to date'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Running v{updateInfo?.currentVersion || health?.version || '—'}
                {updateInfo?.latestVersion ? ` · npm latest v${updateInfo.latestVersion}` : ''}
                {updateInfo?.updateAvailable
                  ? ' · registered projects or host package can be upgraded'
                  : ''}
              </div>
              {updateMessage && (
                <div style={{ fontSize: 12, color: updateMessage.includes('error') || updateMessage.includes('failed') ? '#ef4444' : '#10b981', marginTop: 8 }}>
                  {updateMessage}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                className="btn-secondary"
                onClick={handleRestartDaemon}
                disabled={restartingDaemon}
                style={{ fontSize: 13, padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}
              >
                {restartingDaemon ? 'Restarting…' : 'Restart Daemon'}
              </button>
              <button
                className="btn-secondary"
                onClick={handleRestartServer}
                disabled={restartingServer}
                data-testid="restart-server"
                title="Restart the brain server so newly installed code is the code that runs"
                style={{ fontSize: 13, padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}
              >
                {restartingServer ? 'Restarting…' : 'Restart Server'}
              </button>
              <button 
                className="btn-primary"
                onClick={handleRunUpdate}
                disabled={updating}
                style={{ background: updateInfo?.updateAvailable ? '#3fb950' : undefined, border: 'none' }}
              >
                {updating ? 'Updating…' : updateInfo?.updateAvailable ? 'Apply Updates' : 'Check & Sync Projects'}
              </button>
            </div>
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
                  const activeAgent = availableAgents.includes(a.id);
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
    </div>
  );
}
