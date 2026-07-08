import fs from 'fs';
let content = fs.readFileSync('frontend/src/pages/UsagePage.tsx', 'utf8');
content = content.replace(/openrouter: UsageBreakdown;/g, 'openrouter?: UsageBreakdown;');
fs.writeFileSync('frontend/src/pages/UsagePage.tsx', content);
