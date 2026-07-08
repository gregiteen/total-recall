import fs from 'fs';
let content = fs.readFileSync('frontend/src/pages/ModelsPage.tsx', 'utf8');

// Fix 1: gemini_api_key -> google_api_key
content = content.replace(/gemini_api_key/g, 'google_api_key');

// Fix 2: const groups = {}; -> const groups: Record<string, typeof orModels> = {};
content = content.replace(/const groups = {};/g, 'const groups: Record<string, typeof orModels> = {};');

// Fix 3: Remove inline usage stats
content = content.replace(/\{usageStats\?.breakdown\?.gemini && \([\s\S]*?<\/[dD]iv>\s*\)\}/, '');
content = content.replace(/\{usageStats\?.breakdown\?.claude && \([\s\S]*?<\/[dD]iv>\s*\)\}/, '');
content = content.replace(/\{usageStats\?.breakdown\?.codex && \([\s\S]*?<\/[dD]iv>\s*\)\}/, '');
content = content.replace(/\{usageStats\?.breakdown\?.openrouter && \([\s\S]*?<\/[dD]iv>\s*\)\}/, '');

fs.writeFileSync('frontend/src/pages/ModelsPage.tsx', content);
