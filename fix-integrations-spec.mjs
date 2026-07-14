import fs from 'fs';
let content = fs.readFileSync('src/server/routes/integrations.spec.mjs', 'utf8');

// Remove the mock of _shared.mjs
content = content.replace(/vi\.mock\('\.\/_shared\.mjs',.*\}\);\n/s, '');

fs.writeFileSync('src/server/routes/integrations.spec.mjs', content);
