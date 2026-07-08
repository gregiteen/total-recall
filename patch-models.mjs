import fs from 'fs';

let content = fs.readFileSync('src/server/rest.mjs', 'utf8');

// 1. Fix Gemini key lookup to check secrets.enc
const geminiLookupOld = `    let apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      // Find GOOGLE_API_KEY in upwards .env files
      try {
        let dir = process.cwd();
        while (dir !== path.dirname(dir)) {
          const envPath = path.join(dir, '.env');
          if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            for (const line of content.split('\\n')) {
              const match = line.match(/^\\s*GOOGLE_API_KEY\\s*=\\s*(["']?)(.*?)\\1\\s*$/);
              if (match) {
                apiKey = match[2];
                break;
              }
            }
          }
          if (apiKey) break;
          dir = path.dirname(dir);
        }
      } catch {}
    }`;

const geminiLookupNew = `    let apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      try {
        const secretsPath = path.join(AGENT_DIR, 'secrets.enc');
        if (fs.existsSync(secretsPath)) {
          const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8')) || {};
          apiKey = secrets.gemini_api_key || secrets.google_api_key;
        }
      } catch {}
    }`;

content = content.replace(geminiLookupOld, geminiLookupNew);

// 2. Remove fallbackModels from gemini
content = content.replace(/    const fallbackModels = \[\s*\{ id: 'gemini-1\.5-pro'.*?\];/s, '');
content = content.replace(/    if \(\!apiKey\) \{\s*const pricingMap = await getPricingMap\(\);\s*const modelsWithPricing = fallbackModels\.map.*?return res\.json\(\{ models: modelsWithPricing, source: 'fallback' \}\);\s*\}/s, `    if (!apiKey) return res.json({ models: [], source: 'missing_key' });`);
content = content.replace(/    res\.json\(\{ models: fallbackModels, source: 'fallback_error' \}\);/g, `    res.json({ models: [], source: 'api_error' });`);

// 3. Remove fallbackModels from claude
content = content.replace(/    const fallbackModels = \[\s*\{ id: 'claude-fable-5'.*?\];/s, '');
content = content.replace(/    if \(\!apiKey\) \{\s*const pricingMap = await getPricingMap\(\);\s*const modelsWithPricing = fallbackModels\.map.*?return res\.json\(\{ models: modelsWithPricing, source: 'fallback' \}\);\s*\}/s, `    if (!apiKey) return res.json({ models: [], source: 'missing_key' });`);

// 4. Remove fallbackModels from openai
content = content.replace(/    const fallbackModels = \[\s*\{ id: 'gpt-5\.6-sol'.*?\];/s, '');
content = content.replace(/    if \(\!apiKey\) \{\s*const pricingMap = await getPricingMap\(\);\s*const modelsWithPricing = fallbackModels\.map.*?return res\.json\(\{ models: modelsWithPricing, source: 'fallback' \}\);\s*\}/s, `    if (!apiKey) return res.json({ models: [], source: 'missing_key' });`);

fs.writeFileSync('src/server/rest.mjs', content);
