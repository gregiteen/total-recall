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
import express from 'express';
import restRouter from './rest.mjs';
import { MANIFEST_PATH, extractRoutes, sortRoutes } from './route-inventory.mjs';

describe('Express Router Stack Inventory', () => {
  it('records each method for every alias and preserves regular expression paths', () => {
    const router = express.Router();
    const alias = /^\/version\/\d+$/i;
    const pattern = /^\/assets\/.+$/u;
    const handler = () => {};
    router.route(['/old', '/new', alias]).get(handler).post(handler);
    router.get(pattern, handler);

    expect(sortRoutes(extractRoutes(router))).toEqual(sortRoutes([
      { method: 'GET', path: '/old' },
      { method: 'GET', path: '/new' },
      { method: 'GET', path: String(alias) },
      { method: 'POST', path: '/old' },
      { method: 'POST', path: '/new' },
      { method: 'POST', path: String(alias) },
      { method: 'GET', path: String(pattern) },
    ]));
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
