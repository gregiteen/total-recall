import fs from 'fs';
let content = fs.readFileSync('frontend/src/pages/ModelsPage.tsx', 'utf8');

// Replace the outer form with div
content = content.replace(
  /<form className="card" onSubmit=\{\(e\) => e\.preventDefault\(\)\} style=\{\{ padding: 24, background: 'rgba\(18, 18, 26, 0\.6\)', backdropFilter: 'blur\(8px\)', border: '1px solid var\(--border\)', display: 'flex', flexDirection: 'column', gap: 16 \}\}>/,
  `<div className="card" style={{ padding: 24, background: 'rgba(18, 18, 26, 0.6)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 16 }}>`
);

content = content.replace(
  /              <span style=\{\{ fontSize: 10, color: 'var\(--text-tertiary\)' \}\}>\n                These keys are stored locally and injected into the CLI reasoning agents on dispatch\.\n              <\/span>\n            <\/form>/,
  `              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                These keys are stored locally and injected into the CLI reasoning agents on dispatch.
              </span>
            </div>`
);

// Now wrap each password input in its own form
// For each group:
content = content.replace(/<input\s+type="password"\s+value=\{configData\.secrets\.npm_token \|\| ''\}/g, `<form onSubmit={e => e.preventDefault()} style={{display:'inline',margin:0,padding:0,width:'100%'}}><input type="password" value={configData.secrets.npm_token || ''}`);
content = content.replace(/(onChange=\{.*?npm_token.*?\}\s*\/>)/, '$1</form>');

content = content.replace(/<input\s+type="password"\s+value=\{configData\.secrets\.gemini_api_key \|\| ''\}/g, `<form onSubmit={e => e.preventDefault()} style={{display:'inline',margin:0,padding:0,width:'100%'}}><input type="password" value={configData.secrets.gemini_api_key || ''}`);
content = content.replace(/(onChange=\{.*?gemini_api_key.*?\}\s*\/>)/, '$1</form>');

content = content.replace(/<input\s+type="password"\s+value=\{configData\.secrets\.anthropic_api_key \|\| ''\}/g, `<form onSubmit={e => e.preventDefault()} style={{display:'inline',margin:0,padding:0,width:'100%'}}><input type="password" value={configData.secrets.anthropic_api_key || ''}`);
content = content.replace(/(onChange=\{.*?anthropic_api_key.*?\}\s*\/>)/, '$1</form>');

content = content.replace(/<input\s+type="password"\s+value=\{configData\.secrets\.openrouter_api_key \|\| ''\}/g, `<form onSubmit={e => e.preventDefault()} style={{display:'inline',margin:0,padding:0,width:'100%'}}><input type="password" value={configData.secrets.openrouter_api_key || ''}`);
content = content.replace(/(onChange=\{.*?openrouter_api_key.*?\}\s*\/>)/, '$1</form>');

fs.writeFileSync('frontend/src/pages/ModelsPage.tsx', content);
