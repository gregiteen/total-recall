import fs from 'fs';
let content = fs.readFileSync('frontend/src/pages/ModelsPage.tsx', 'utf8');

// Gemini
const oldGemini = `<select
                  value={configData?.gemini_model || ''}
                  onChange={(e) => updateConfigProp('gemini_model', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    outline: 'none'
                  }}
                >`;
const newGemini = `<select
                  disabled={!configData?.secrets?.gemini_api_key}
                  value={configData?.gemini_model || ''}
                  onChange={(e) => updateConfigProp('gemini_model', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    opacity: !configData?.secrets?.gemini_api_key ? 0.5 : 1,
                    cursor: !configData?.secrets?.gemini_api_key ? 'not-allowed' : 'pointer'
                  }}
                >`;

// Anthropic
const oldClaude = `<select
                  value={configData?.claude_model || ''}
                  onChange={(e) => updateConfigProp('claude_model', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    outline: 'none'
                  }}
                >`;
const newClaude = `<select
                  disabled={!configData?.secrets?.anthropic_api_key}
                  value={configData?.claude_model || ''}
                  onChange={(e) => updateConfigProp('claude_model', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    opacity: !configData?.secrets?.anthropic_api_key ? 0.5 : 1,
                    cursor: !configData?.secrets?.anthropic_api_key ? 'not-allowed' : 'pointer'
                  }}
                >`;

// OpenAI
const oldOpenai = `<select
                  value={configData?.openai_model || ''}
                  onChange={(e) => updateConfigProp('openai_model', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    outline: 'none'
                  }}
                >`;
const newOpenai = `<select
                  disabled={!configData?.secrets?.openai_api_key}
                  value={configData?.openai_model || ''}
                  onChange={(e) => updateConfigProp('openai_model', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    opacity: !configData?.secrets?.openai_api_key ? 0.5 : 1,
                    cursor: !configData?.secrets?.openai_api_key ? 'not-allowed' : 'pointer'
                  }}
                >`;

// OpenRouter
const oldOpenrouter = `<select
                  value={configData?.openrouter_model || ''}
                  onChange={(e) => updateConfigProp('openrouter_model', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    outline: 'none'
                  }}
                >`;
const newOpenrouter = `<select
                  disabled={!configData?.secrets?.openrouter_api_key}
                  value={configData?.openrouter_model || ''}
                  onChange={(e) => updateConfigProp('openrouter_model', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    opacity: !configData?.secrets?.openrouter_api_key ? 0.5 : 1,
                    cursor: !configData?.secrets?.openrouter_api_key ? 'not-allowed' : 'pointer'
                  }}
                >`;

content = content.replace(oldGemini, newGemini);
content = content.replace(oldClaude, newClaude);
content = content.replace(oldOpenai, newOpenai);
content = content.replace(oldOpenrouter, newOpenrouter);

fs.writeFileSync('frontend/src/pages/ModelsPage.tsx', content);
