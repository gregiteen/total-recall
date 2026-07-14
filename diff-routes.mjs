import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { restRouter } from './src/server/rest.mjs';

function extractRoutes(router) {
  const routes = [];
  function traverse(stack) {
    if (!stack || !Array.isArray(stack)) return;
    for (const layer of stack) {
      if (layer.route) {
        const pathStr = layer.route.path;
        const methods = Object.keys(layer.route.methods)
          .filter(m => layer.route.methods[m])
          .map(m => m.toUpperCase());
        for (const method of methods) {
          routes.push({ method, path: pathStr });
        }
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        traverse(layer.handle.stack);
      }
    }
  }
  traverse(router.stack);
  return routes;
}

const manifestRaw = fs.readFileSync('src/server/route-manifest.json', 'utf8');
const expectedRoutes = JSON.parse(manifestRaw);
const liveRoutes = extractRoutes(restRouter);

const expectedSet = new Set(expectedRoutes.map(r => `${r.method} ${r.path}`));
const liveSet = new Set(liveRoutes.map(r => `${r.method} ${r.path}`));

const added = [...liveSet].filter(r => !expectedSet.has(r));
const removed = [...expectedSet].filter(r => !liveSet.has(r));

console.log('--- ADDED ---');
console.log(added.join('\n'));
console.log('\n--- REMOVED ---');
console.log(removed.join('\n'));

// Update manifest
fs.writeFileSync('src/server/route-manifest.json', JSON.stringify(liveRoutes, null, 2));

