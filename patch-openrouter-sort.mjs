import fs from 'fs';
let content = fs.readFileSync('frontend/src/pages/ModelsPage.tsx', 'utf8');

// Replace the grouping logic
const regex = /const groups: Record<string, typeof orModels> = \{\};[\s\S]*?return Object\.keys\(groups\)\.map\(provider => \(/;

const newLogic = `const groups: Record<string, typeof orModels> = {};
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
                        return (`;

content = content.replace(regex, newLogic);

// We also need to fix the map over groups[provider] since we now have sortedModels
content = content.replace(/\{groups\[provider\]\.map\(m => \{/g, '{sortedModels.map(m => {');

fs.writeFileSync('frontend/src/pages/ModelsPage.tsx', content);
