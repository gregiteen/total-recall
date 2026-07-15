const fs = require('fs');
let content = fs.readFileSync('src/core/vault.mjs', 'utf8');

const oldWalk = `    if (entry.isDirectory()) {
      results = results.concat(walkMd(fullPath));
    } else if (entry.name.endsWith('.md')) {`;

const newWalk = `    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.')) {
        results = results.concat(walkMd(fullPath));
      }
    } else if (entry.name.endsWith('.md')) {`;

content = content.replace(oldWalk, newWalk);
fs.writeFileSync('src/core/vault.mjs', content, 'utf8');
