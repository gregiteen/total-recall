import { useState, useEffect, useCallback } from 'react';
import { fetchHealth, runAgentDiagnostics, fetchConfigJson, saveConfigJson, fetchUsageStats, fetchGeminiModels, fetchClaudeModels, fetchOpenaiModels, fetchOpenRouterModels } from '../api';
import { UsageChart } from '../components/UsageChart';
import type { HealthData, ConfigJson, UsageData, GeminiModelInfo } from '../types';

export default function ModelsPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [configData, setConfigData] = useState<ConfigJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // CLI Agent Diagnostics state
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string | null>(null);

  // OpenRouter state
  const [orModels, setOrModels] = useState<GeminiModelInfo[]>([]);

  // Global usage & dynamic models state
  const [usageStats, setUsageStats] = useState<UsageData | null>(null);
  const [geminiModels, setGeminiModels] = useState<GeminiModelInfo[]>([]);
  const [claudeModels, setClaudeModels] = useState<GeminiModelInfo[]>([]);
  const [openaiModels, setOpenaiModels] = useState<GeminiModelInfo[]>([]);

  const fetchSystemData = useCallback(async () => {
    try {
      const systemHealth = await fetchHealth();
      setHealth(systemHealth);
      
      const data = await fetchConfigJson();
      if (!data.secrets) data.secrets = {};
      if (!data.brain) data.brain = {};
      setConfigData(data);
      
      const stats = await fetchUsageStats().catch(() => null);
      setUsageStats(stats);
      
      const gemModels = await fetchGeminiModels().catch(() => []);
      setGeminiModels(gemModels);

      const claModels = await fetchClaudeModels().catch(() => []);
      setClaudeModels(claModels);

      const openModels = await fetchOpenaiModels().catch(() => []);
      setOpenaiModels(openModels);
      
      const openRouterModels = await fetchOpenRouterModels().catch(() => []);
      setOrModels(openRouterModels);
      
      setError(null);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to sync system data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate metrics polling on mount
    void fetchSystemData();
  }, [fetchSystemData]);

  const handleSaveConfig = async () => {
    if (!configData) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveConfigJson(configData);
      setSuccess('Configuration saved successfully. Kernel will hot-reload settings.');
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleRunDiagnostics = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunningDiagnostics(true);
    setError(null);
    setSuccess(null);
    setDiagnosticLogs(null);
    try {
      const res = await runAgentDiagnostics();
      setDiagnosticLogs(res.output);
      if (res.success) {
        setSuccess('CLI Agent diagnostics completed successfully.');
      } else {
        setError('CLI Agent diagnostics finished with warnings or missing binaries.');
      }
      void fetchSystemData();
    } catch (err: unknown) {
      setError((err as Error).message || 'Diagnostics execution failed.');
    } finally {
      setRunningDiagnostics(false);
    }
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

  const updateBrainProp = (prop: string, value: string) => {
    if (!configData) return;
    setConfigData({
      ...configData,
      brain: {
        ...configData.brain,
        [prop]: value
      }
    });
  };

  const AGENTS_LIST = [
    { id: 'antigravity', name: 'Antigravity (Gemini SDK)', desc: 'Primary core developer agent' },
    { id: 'gemini', name: 'Gemini CLI', desc: 'Direct Gemini assistant binary' },
    { id: 'claude', name: 'Claude Code', desc: 'Anthropic developer CLI wrapper' },
    { id: 'codex', name: 'Codex CLI', desc: 'OpenAI agent binary integration' }
  ];


  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div className="page-header" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="md-hidden" onClick={() => document.querySelector('.sidebar')?.classList.add('open')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div>
            <h1>Models & Agents</h1>
            <p>Configure Bring Your Own Model (BYOM) settings and manage active reasoning agents</p>
          </div>
        </div>
        {configData && (
          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="btn btn-primary"
            style={{ minWidth: 120 }}
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        )}
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

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          <div>Loading models and agents...</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, flex: 1, minHeight: 0 }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24 }}>
            
            {/* Ollama Panel */}
            <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <span style={{ fontSize: 20 }}>🦙</span>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>Local Provider</h3>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Connect Ollama, LM Studio, vLLM, or Llama.cpp</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="local_endpoint" style={{ fontSize: 13, fontWeight: 500 }}>Provider Base URL</label>
                <input
                  id="local_endpoint"
                  type="text"
                  placeholder="http://127.0.0.1:11434 or http://127.0.0.1:1234/v1"
                  value={configData?.brain?.local_endpoint || ''}
                  onChange={(e) => updateBrainProp('local_endpoint', e.target.value)}
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
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Leave blank to use the default localhost endpoint.</span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                 <span className="badge" style={{
                    background: health?.ollama === 'running' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    color: health?.ollama === 'running' ? '#10b981' : '#ef4444',
                    border: health?.ollama === 'running' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                    fontSize: 10,
                    padding: '4px 8px'
                  }}>
                    {health?.ollama === 'running' ? 'Connected' : 'Offline'}
                  </span>
                  {health?.ollama === 'running' && health?.ollama_models && (
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {health.ollama_models.length} local models available
                    </span>
                  )}
              </div>
            </div>

            {/* Cloud API Keys Panel */}
            <div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <span style={{ fontSize: 20 }}>🔑</span>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>Cloud Models (API Keys)</h3>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Bring your own cloud models</p>
                </div>
              </div>

              {/* Google Gemini API Key */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label htmlFor="google_api_key" style={{ fontSize: 13, fontWeight: 500 }}>Google Gemini API Key</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: configData?.brain?.preferred_agent === 'gemini' ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                    <input 
                      type="radio" 
                      name="preferred_agent" 
                      checked={configData?.brain?.preferred_agent === 'gemini'} 
                      onChange={() => updateBrainProp('preferred_agent', 'gemini')}
                    />
                    Set Active
                  </label>
                </div>
                <form onSubmit={e => e.preventDefault()} style={{display:'inline',margin:0,padding:0,width:'100%'}}><input id="google_api_key"
                  type="password"
                  placeholder="AIzaSy..."
                  value={configData?.secrets?.google_api_key || ''}
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
                /></form>
                
                <select
                  disabled={!configData?.secrets?.google_api_key}
                  value={configData?.brain?.gemini_model || ''}
                  onChange={(e) => updateBrainProp('gemini_model', e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    outline: 'none',
                    fontSize: 13,
                    marginTop: 4
                  }}
                >
                  <option value="">Default Gemini Model</option>
                  {geminiModels.map(m => {
                    let costStr = '';
                    if (m.pricing && m.pricing.prompt && m.pricing.completion) {
                      const promptCost = (parseFloat(m.pricing.prompt as string) * 1000000).toFixed(2);
                      const compCost = (parseFloat(m.pricing.completion as string) * 1000000).toFixed(2);
                      costStr = ` - $${promptCost}/$${compCost} per 1M`;
                    }
                    return (
                      <option key={m.id} value={m.id}>{m.displayName} ({m.id}){costStr}</option>
                    );
                  })}
                </select>
                  {!configData?.secrets?.google_api_key && (
                    <div style={{ fontSize: 11, color: 'var(--text-error, #f44336)', marginTop: 8 }}>
                      ⚠ API Key required to unlock model selection
                    </div>
                  )}
                </div>

              {/* Anthropic API Key */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label htmlFor="anthropic_api_key" style={{ fontSize: 13, fontWeight: 500 }}>Anthropic API Key (Claude)</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: configData?.brain?.preferred_agent === 'claude' ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                    <input 
                      type="radio" 
                      name="preferred_agent" 
                      checked={configData?.brain?.preferred_agent === 'claude'} 
                      onChange={() => updateBrainProp('preferred_agent', 'claude')}
                    />
                    Set Active
                  </label>
                </div>
                <form onSubmit={e => e.preventDefault()} style={{display:'inline',margin:0,padding:0,width:'100%'}}><input id="anthropic_api_key"
                  type="password"
                  placeholder="sk-ant-..."
                  value={configData?.secrets?.anthropic_api_key || ''}
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
                /></form>
                
                <select
                  disabled={!configData?.secrets?.anthropic_api_key}
                  value={configData?.brain?.claude_model || ''}
                  onChange={(e) => updateBrainProp('claude_model', e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    outline: 'none',
                    fontSize: 13,
                    marginTop: 4
                  }}
                >
                  <option value="">Default Claude Model</option>
                  {claudeModels.map(m => {
                    let costStr = '';
                    if (m.pricing && m.pricing.prompt && m.pricing.completion) {
                      const promptCost = (parseFloat(m.pricing.prompt as string) * 1000000).toFixed(2);
                      const compCost = (parseFloat(m.pricing.completion as string) * 1000000).toFixed(2);
                      costStr = ` - $${promptCost}/$${compCost} per 1M`;
                    }
                    return (
                      <option key={m.id} value={m.id}>{m.displayName} ({m.id}){costStr}</option>
                    );
                  })}
                </select>
                  {!configData?.secrets?.anthropic_api_key && (
                    <div style={{ fontSize: 11, color: 'var(--text-error, #f44336)', marginTop: 8 }}>
                      ⚠ API Key required to unlock model selection
                    </div>
                  )}
                </div>

              {/* OpenAI API Key */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label htmlFor="openai_api_key" style={{ fontSize: 13, fontWeight: 500 }}>OpenAI API Key (Codex)</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: configData?.brain?.preferred_agent === 'codex' ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                    <input 
                      type="radio" 
                      name="preferred_agent" 
                      checked={configData?.brain?.preferred_agent === 'codex'} 
                      onChange={() => updateBrainProp('preferred_agent', 'codex')}
                    />
                    Set Active
                  </label>
                </div>
                <form onSubmit={e => e.preventDefault()} style={{display:'inline',margin:0,padding:0,width:'100%'}}><input id="openai_api_key"
                  type="password"
                  placeholder="sk-proj-..."
                  value={configData?.secrets?.openai_api_key || ''}
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
                /></form>
                
                <select
                  disabled={!configData?.secrets?.openai_api_key}
                  value={configData?.brain?.openai_model || ''}
                  onChange={(e) => updateBrainProp('openai_model', e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    outline: 'none',
                    fontSize: 13,
                    marginTop: 4
                  }}
                >
                  <option value="">Default OpenAI Model</option>
                  {openaiModels.map(m => {
                    let costStr = '';
                    if (m.pricing && m.pricing.prompt && m.pricing.completion) {
                      const promptCost = (parseFloat(m.pricing.prompt as string) * 1000000).toFixed(2);
                      const compCost = (parseFloat(m.pricing.completion as string) * 1000000).toFixed(2);
                      costStr = ` - $${promptCost}/$${compCost} per 1M`;
                    }
                    return (
                      <option key={m.id} value={m.id}>{m.displayName} ({m.id}){costStr}</option>
                    );
                  })}
                </select>
                  {!configData?.secrets?.openai_api_key && (
                    <div style={{ fontSize: 11, color: 'var(--text-error, #f44336)', marginTop: 8 }}>
                      ⚠ API Key required to unlock model selection
                    </div>
                  )}
                </div>

              {/* OpenRouter API Key */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label htmlFor="openrouter_api_key" style={{ fontSize: 13, fontWeight: 500 }}>OpenRouter API Key</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: configData?.brain?.preferred_agent === 'openrouter' ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                    <input 
                      type="radio" 
                      name="preferred_agent" 
                      checked={configData?.brain?.preferred_agent === 'openrouter'} 
                      onChange={() => updateBrainProp('preferred_agent', 'openrouter')}
                    />
                    Set Active
                  </label>
                </div>
                <form onSubmit={e => e.preventDefault()} style={{display:'inline',margin:0,padding:0,width:'100%'}}><input id="openrouter_api_key"
                  type="password"
                  placeholder="sk-or-..."
                  value={configData?.secrets?.openrouter_api_key || ''}
                  onChange={(e) => updateSecretsProp('openrouter_api_key', e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    outline: 'none',
                    fontSize: 13
                  }}
                /></form>
                
                
                
                {loading && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: '0 4px' }}>Fetching models...</div>}

                {!loading && orModels.length === 0 && configData?.secrets?.openrouter_api_key?.startsWith('sk-or-') && (
                  <div style={{ fontSize: 11, color: 'var(--accent-red)', padding: '0 4px' }}>Failed to fetch OpenRouter models.</div>
                )}
                {!loading && orModels.length > 0 && (
                  <select
                    id="openrouter_model"
                    value={configData?.brain?.openrouter_model || ''}
                    onChange={(e) => updateBrainProp('openrouter_model', e.target.value)}
                    style={{
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      padding: '8px 12px',
                      borderRadius: 6,
                      outline: 'none',
                      fontSize: 13,
                      marginTop: 4
                    }}
                  >
                    <option value="">Default OpenRouter Model</option>
                    {(() => {
                      const groups: Record<string, typeof orModels> = {};
                      orModels.forEach(m => {
                        const provider = m.id.split('/')[0].toUpperCase();
                        if (!groups[provider]) groups[provider] = [];
                        groups[provider].push(m);
                      });
                      
                      // Sort providers alphabetically
                      const sortedProviders = Object.keys(groups).sort((a, b) => a.localeCompare(b));
                      
                      return sortedProviders.map(provider => {
                        // Sort models within provider by ID alphabetically
                        const sortedModels = groups[provider].sort((a, b) => a.id.localeCompare(b.id));
                        return (
                        <optgroup key={provider} label={provider}>
                          {sortedModels.map(m => {
                            let costStr = '';
                            if (m.pricing && m.pricing.prompt && m.pricing.completion) {
                              const promptCost = (parseFloat(m.pricing.prompt) * 1000000).toFixed(2);
                              const compCost = (parseFloat(m.pricing.completion) * 1000000).toFixed(2);
                              costStr = ` - ${promptCost}/${compCost} per 1M`;
                            }
                            return (
                              <option key={m.id} value={m.id}>{m.displayName} ({m.id}){costStr}</option>
                            );
                          })}
                        </optgroup>
                        );
                      });
                    })()}
                  </select>
                )}
              </div>
              
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                These keys are stored locally and injected into the CLI reasoning agents on dispatch.
              </span>
            </div>
            </div>

          <UsageChart 
            usageData={usageStats} 
            geminiModels={geminiModels} 
            claudeModels={claudeModels} 
            openaiModels={openaiModels} 
          />

          {/* CLI Agents Catalog & Diagnostics */}
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
      )}

    </div>
  );
}
