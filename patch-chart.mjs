import fs from 'fs';
let content = fs.readFileSync('frontend/src/components/UsageChart.tsx', 'utf8');

content = content.replace(/<Bar dataKey="gemini"/g, '<Bar isAnimationActive={false} dataKey="gemini"');
content = content.replace(/<Bar dataKey="claude"/g, '<Bar isAnimationActive={false} dataKey="claude"');
content = content.replace(/<Bar dataKey="codex"/g, '<Bar isAnimationActive={false} dataKey="codex"');
content = content.replace(/<Bar dataKey="openrouter"/g, '<Bar isAnimationActive={false} dataKey="openrouter"');

fs.writeFileSync('frontend/src/components/UsageChart.tsx', content);
