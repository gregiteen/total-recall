import fs from 'fs';
let content = fs.readFileSync('src/server/rest.mjs', 'utf8');

const applyFallbackPricing = (provider, codeBlock, prefix) => {
  const oldCode = `    if (!apiKey) {
      return res.json({ models: fallbackModels, source: 'fallback' });
    }`;
  
  const newCode = `    if (!apiKey) {
      const pricingMap = await getPricingMap();
      const modelsWithPricing = fallbackModels.map(m => {
        const pricing = pricingMap[\`${prefix}\${m.id}\`] || pricingMap[m.id] || null;
        return { ...m, pricing };
      });
      return res.json({ models: modelsWithPricing, source: 'fallback' });
    }`;
  
  content = content.replace(oldCode, newCode);
};

applyFallbackPricing('claude', '', 'anthropic/');
applyFallbackPricing('openai', '', '');
applyFallbackPricing('gemini', '', 'google/');

fs.writeFileSync('src/server/rest.mjs', content);
