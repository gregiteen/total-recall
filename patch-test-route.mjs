import fs from 'fs';
let content = fs.readFileSync('src/server/rest.mjs', 'utf8');
content = content.replace("router.get('/api/openrouter-models', async (req, res) => {", "router.get('/api/test-route', (req, res) => res.json({hello: 'world'}));\nrouter.get('/api/openrouter-models', async (req, res) => {");
fs.writeFileSync('src/server/rest.mjs', content);
