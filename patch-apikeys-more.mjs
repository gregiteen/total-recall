import fs from 'fs';

let content = fs.readFileSync('frontend/src/pages/ApiKeysPage.tsx', 'utf8');

const extraKeysHtml = `
              {/* Search & Tool APIs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.05)', marginTop: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Search & External Tools</h4>
                
                {['tavily_api_key', 'brave_api_key', 'exa_api_key', 'serper_api_key', 'github_token'].map(key => (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 500 }}>{key.replace(/_/g, ' ').replace('api', 'API').replace('key', 'Key').replace('token', 'Token').replace(/\\b\\w/g, c => c.toUpperCase())}</label>
                    <input 
                      type="password"
                      placeholder="Enter token..."
                      value={(configData?.secrets as any)?.[key] || ''}
                      onChange={(e) => updateSecretsProp(key, e.target.value)}
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
                ))}
              </div>
`;

// Insert after OpenRouter panel
content = content.replace(/\{\/\* OpenRouter API Key \*\/\}[\s\S]*?<\/div>\s*<\/div>/, `$&
${extraKeysHtml}
`);

// Also change the title to Cloud & Search APIs
content = content.replace(/Cloud Models \(API Keys\)/g, 'Cloud & Search APIs');

fs.writeFileSync('frontend/src/pages/ApiKeysPage.tsx', content);
console.log('patched more apikeys');
