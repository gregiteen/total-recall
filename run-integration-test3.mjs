import fs from 'fs';
import { execSync } from 'child_process';
let content = fs.readFileSync('src/server/routes/integrations.mjs', 'utf8');
content = content.replace("const { client, baseUrl } = req.body || {};", "console.log('BODY IS:', req.body); const { client, baseUrl } = req.body || {};");
fs.writeFileSync('src/server/routes/integrations.mjs', content);
try {
  execSync('npm test -- src/server/routes/integrations.spec.mjs', { stdio: 'inherit' });
} catch (e) {}
