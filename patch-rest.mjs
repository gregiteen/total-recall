import fs from 'fs';
let content = fs.readFileSync('src/server/rest.mjs', 'utf8');

// Fix Gemini fallback models
content = content.replace(
  /const fallbackModels = \[\n\s*\{ id: 'gemini-3.5-flash'.*?\n\s*\];/s,
  `const fallbackModels = [
      { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-flash-8b', displayName: 'Gemini 1.5 Flash 8B' },
      { id: 'gemini-2.0-flash-exp', displayName: 'Gemini 2.0 Flash Exp' },
      { id: 'gemini-2.0-pro-exp', displayName: 'Gemini 2.0 Pro Exp' }
    ];`
);

// Fix Gemini pricing lookup (was 'anthropic/${m.id}')
content = content.replace(
  /pricingMap\[\`anthropic\/\$\{m\.id\}\`\] \|\| pricingMap\[m\.id\] \|\| null;/g,
  'pricingMap[`google/${m.id}`] || pricingMap[m.id] || null;'
);

// Fix OpenAI pricing lookup (was 'google/${m.id}')
content = content.replace(
  /pricingMap\[\`google\/\$\{m\.id\}\`\] \|\| pricingMap\[m\.id\] \|\| null;/g,
  'pricingMap[`openai/${m.id}`] || pricingMap[m.id] || null;'
);

fs.writeFileSync('src/server/rest.mjs', content);
