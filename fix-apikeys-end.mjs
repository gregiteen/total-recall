import fs from 'fs';
let content = fs.readFileSync('frontend/src/pages/ApiKeysPage.tsx', 'utf8');
content = content.replace(/undefinedundefined/g, '');
content = content.trimEnd() + '\n    </div>\n  );\n}\n';
fs.writeFileSync('frontend/src/pages/ApiKeysPage.tsx', content);
