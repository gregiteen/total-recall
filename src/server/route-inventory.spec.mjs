/**
 * Express Route Inventory Spec
 *
 * Scans the live Express router stack exported by rest.mjs and validates
 * it against the committed src/server/route-manifest.json to ensure
 * documentation drift and stale route mutations are caught immediately in CI.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import restRouter from './rest.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(__dirname, 'route-manifest.json');

function extractRoutes(router) {
  const routes = [];

  function traverse(stack) {
    if (!stack || !Array.isArray(stack)) return;

    for (const layer of stack) {
      if (layer.route) {
        // Direct route
        const pathStr = layer.route.path;
        const methods = Object.keys(layer.route.methods)
          .filter(m => layer.route.methods[m])
          .map(m => m.toUpperCase());

        for (const method of methods) {
          routes.push({ method, path: pathStr });
        }
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        // Sub-router mounted via router.use()
        traverse(layer.handle.stack);
      }
    }
  }

  traverse(router.stack);
  return routes;
}

describe('Express Router Stack Inventory', () => {
  it('exactly matches the committed route-manifest.json', () => {
    // Read manifest
    const manifestRaw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const expectedRoutes = JSON.parse(manifestRaw);

    // Extract live routes from restRouter
    const liveRoutes = extractRoutes(restRouter);

    // Sort both arrays for deterministic comparison
    const sortFn = (a, b) => {
      const cmp = a.path.localeCompare(b.path);
      if (cmp !== 0) return cmp;
      return a.method.localeCompare(b.method);
    };

    liveRoutes.sort(sortFn);
    expectedRoutes.sort(sortFn);

    // Assert length matches
    expect(liveRoutes.length).toBe(expectedRoutes.length);

    // Assert exact equality of each entry
    expect(liveRoutes).toEqual(expectedRoutes);
  });
});
