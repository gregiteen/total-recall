import fs from 'fs';
let content = fs.readFileSync('frontend/src/api.ts', 'utf8');

// Replace standard endpoints with cache busting parameters
content = content.replace(/apiFetch\(\`\$\{API_BASE\}\/api\/gemini-models\`\)/g, 'apiFetch(`${API_BASE}/api/gemini-models?t=${Date.now()}`)');
content = content.replace(/apiFetch\(\`\$\{API_BASE\}\/api\/claude-models\`\)/g, 'apiFetch(`${API_BASE}/api/claude-models?t=${Date.now()}`)');
content = content.replace(/apiFetch\(\`\$\{API_BASE\}\/api\/openai-models\`\)/g, 'apiFetch(`${API_BASE}/api/openai-models?t=${Date.now()}`)');
content = content.replace(/apiFetch\(\`\$\{API_BASE\}\/api\/openrouter-models\`\)/g, 'apiFetch(`${API_BASE}/api/openrouter-models?t=${Date.now()}`)');

fs.writeFileSync('frontend/src/api.ts', content);
