import fs from 'node:fs';
import path from 'node:path';

const restPath = 'src/server/rest.mjs';
let content = fs.readFileSync(restPath, 'utf8');

// The prefixes we want to extract
const prefixes = {
  '/api/context': 'context.mjs',
  '/api/field': 'field.mjs',
  '/api/dream': 'dream.mjs',
  '/api/vault': 'vault.mjs',
  '/api/import': 'import.mjs',
  '/api/brain/export': 'export.mjs',
  '/api/files': 'files.mjs',
  '/api/scripts': 'scripts.mjs',
  '/api/tasks': 'tasks.mjs',
  '/api/capture': 'capture.mjs',
  '/api/tts': 'tts.mjs',
  '/api/instructions': 'instructions.mjs',
  '/api/ssss': 'ssss.mjs'
};

// We will extract blocks that look like router.<method>('/api/prefix' ... until the matching '});'
// Since regex matching blocks is hard in JS, we'll iterate lines.

let lines = content.split('\n');
let newLines = [];
let currentBlock = null;
let currentPrefix = null;
let currentModule = null;
let blocksByModule = {};

let insideBlock = false;
let braceCount = 0;

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];

  if (!insideBlock && line.match(/^router\.(get|post|put|delete|patch|use)\(['"`](\/api\/[a-zA-Z0-9/-]+)/)) {
    // Check if it belongs to one of our prefixes
    let match = line.match(/^router\.(get|post|put|delete|patch|use)\(['"`](\/api\/[a-zA-Z0-9/-]+)/);
    let url = match[2];
    
    // Find matching prefix
    let matchedPrefix = Object.keys(prefixes).find(p => url.startsWith(p));
    if (matchedPrefix) {
      insideBlock = true;
      currentBlock = [line];
      currentModule = prefixes[matchedPrefix];
      braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      if (braceCount === 0 && line.includes(';')) {
        // One liner
        insideBlock = false;
        if (!blocksByModule[currentModule]) blocksByModule[currentModule] = [];
        blocksByModule[currentModule].push(currentBlock.join('\n'));
      }
      continue;
    }
  }

  if (insideBlock) {
    currentBlock.push(line);
    braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    if (braceCount <= 0 && line.match(/^\}\);/)) {
      insideBlock = false;
      if (!blocksByModule[currentModule]) blocksByModule[currentModule] = [];
      blocksByModule[currentModule].push(currentBlock.join('\n'));
    }
    continue;
  }

  // Also catch preceding JSDoc comments if they exist
  // We'll just leave them or delete them later. For now, leave them in rest.mjs if they aren't part of the block.
  
  newLines.push(line);
}

// Generate the files
for (const [mod, blocks] of Object.entries(blocksByModule)) {
  const routerName = mod.replace('.mjs', 'Router');
  let fileContent = `import { Router } from 'express';\nimport fs from 'node:fs';\nimport path from 'node:path';\nimport crypto from 'node:crypto';\nimport { requireAuth, requireScope } from '../auth.mjs';\nimport { serverError, ROOT, BRAIN_DIR, VAULT_DIR, SKILLS_DIR, INSTRUCTIONS } from './_shared.mjs';\nimport { logger } from '../../core/logger.mjs';\n\nconst router = Router();\n\n`;
  fileContent += blocks.join('\n\n');
  fileContent += `\n\nexport default router;\n`;
  fs.writeFileSync(`src/server/routes/${mod}`, fileContent);
  console.log(`Created ${mod} with ${blocks.length} routes.`);
}

// Now replace rest.mjs with newLines
// Wait, we need to add the imports and router.use for these modules!
let restContent = newLines.join('\n');
for (const mod of Object.keys(blocksByModule)) {
  const routerName = mod.replace('.mjs', 'Router');
  restContent = restContent.replace(/const router = Router\(\);/, `import ${routerName} from './routes/${mod}';\n$&`);
  restContent = restContent.replace(/export \{ router as restRouter \};/, `router.use(${routerName});\n$&`);
}

fs.writeFileSync('src/server/rest-cleaned.mjs', restContent);
console.log('Wrote rest-cleaned.mjs');
