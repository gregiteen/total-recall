import fs from 'fs';
import { execSync } from 'child_process';
let content = fs.readFileSync('src/server/routes/integrations.spec.mjs', 'utf8');
content = content.replace("expect(res.status).toBe(200);", "if(res.status !== 200) console.log('RESPONSE TEXT:', res.text); expect(res.status).toBe(200);");
fs.writeFileSync('src/server/routes/integrations.spec.mjs', content);
try {
  execSync('npm test -- src/server/routes/integrations.spec.mjs', { stdio: 'inherit' });
} catch (e) {}
