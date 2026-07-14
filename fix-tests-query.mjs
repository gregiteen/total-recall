import fs from 'fs';
let content = fs.readFileSync('src/server/routes/integrations.spec.mjs', 'utf8');

content = content.replace(
  /\.post\('\/api\/integrations\/connect'\)\s*\n\s*\.send\(\{\}\)/g,
  ".post('/api/integrations/connect')"
);

fs.writeFileSync('src/server/routes/integrations.spec.mjs', content);
