/**
 * Express Route Inventory Spec
 *
 * Scans the live Express router stack exported by rest.mjs and validates
 * it against the committed src/server/route-manifest.json to ensure
 * documentation drift and stale route mutations are caught immediately in CI.
 *
 * When a route change is intentional, regenerate the manifest:
 *   npm run routes:manifest
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import restRouter from './rest.mjs';
import { MANIFEST_PATH, extractRoutes, sortRoutes } from './route-inventory.mjs';

describe('Express Router Stack Inventory', () => {
  it('retires the seven one-off routes and append compaction while retaining dashboard routes and one SSSS reader', () => {
    const routes = extractRoutes(restRouter);
    for (const retired of ['/api/context/preview', '/api/context/stream', '/api/context/flash/health',
      '/api/brains/sync', '/api/tasks/cleanup', '/api/tasks/failed', '/api/vault/hash', '/api/vault/compact']) {
      expect(routes.filter(route => route.path === retired)).toEqual([]);
    }
    for (const kept of ['/api/context', '/api/tasks', '/api/vault/status', '/api/vault/compile', '/api/v1/ssss']) {
      expect(routes.some(route => route.path === kept)).toBe(true);
    }
    for (const kept of ['/api/ssss', '/api/ssss/instructions', '/api/ssss/skill/ssss',
      '/api/ssss/spec', '/api/ssss/references', '/api/ssss/references/:name']) {
      expect(routes.filter(route => route.method === 'GET' && route.path === kept)).toHaveLength(1);
    }
  });
  it('exactly matches the committed route-manifest.json', () => {
    const expectedRoutes = sortRoutes(JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')));
    const liveRoutes = sortRoutes(extractRoutes(restRouter));

    // Compared before the length assertion so a mismatch names the offending
    // routes instead of only reporting two numbers that differ.
    expect(liveRoutes).toEqual(expectedRoutes);
    expect(liveRoutes.length).toBe(expectedRoutes.length);
  });
});
