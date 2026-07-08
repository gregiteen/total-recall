import fs from 'fs';
let content = fs.readFileSync('src/server/rest.mjs', 'utf8');
content = content.replace("router.get('/api/openrouter-models', requireAuth, async (req, res) => {", "router.get('/api/openrouter-models', async (req, res) => {");
fs.writeFileSync('src/server/rest.mjs', content);
