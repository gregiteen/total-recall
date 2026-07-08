import fs from 'fs';
let content = fs.readFileSync('src/server/rest.mjs', 'utf8');

// Remove the filter block
const filterRegex = /\.filter\(m => \{\s*\/\/ Only keep Gemini 3\.1 and newer models[\s\S]*?return false;\s*\}\)/;
content = content.replace(filterRegex, '');

fs.writeFileSync('src/server/rest.mjs', content);
