
export default function Test() {
  return (
    <>
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
    </>
  )
}
