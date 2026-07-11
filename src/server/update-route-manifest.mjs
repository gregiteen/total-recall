import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { restRouter } from './rest.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(__dirname, 'route-manifest.json');

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

const liveRoutes = extractRoutes(restRouter);
const sortFn = (a, b) => {
  const cmp = a.path.localeCompare(b.path);
  if (cmp !== 0) return cmp;
  return a.method.localeCompare(b.method);
};
liveRoutes.sort(sortFn);
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(liveRoutes, null, 2) + '\n');
console.log('Updated route-manifest.json with ' + liveRoutes.length + ' routes');
