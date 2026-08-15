/**
 * Express route inventory.
 *
 * The committed `route-manifest.json` is a tripwire for accidental route
 * changes: anything added or removed shows up as a failing spec rather than as
 * a silent change to the public API surface.
 *
 * Extraction lives here, rather than inside the spec, because the manifest has
 * to be regenerated whenever a route legitimately changes. When the spec owned
 * the only copy of this logic the manifest could only be updated by hand, which
 * is how two real routes came to be missing from it — the tripwire failed, and
 * the failure was invisible to anyone running a subset of the suite.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The single source of truth both the spec and the generator read/write. */
export const MANIFEST_PATH = path.join(__dirname, 'route-manifest.json');

/** Flatten an Express router stack into `{ method, path }` entries. */
export function extractRoutes(router) {
  const routes = [];

  function traverse(stack) {
    if (!stack || !Array.isArray(stack)) return;

    for (const layer of stack) {
      if (layer.route) {
        const pathStr = layer.route.path;
        const methods = Object.keys(layer.route.methods)
          .filter((method) => layer.route.methods[method])
          .map((method) => method.toUpperCase());

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

/**
 * Order routes deterministically.
 *
 * Router registration order is an implementation detail that shifts whenever
 * imports are reordered, so both sides sort before comparing.
 */
export function sortRoutes(routes) {
  return [...routes].sort((a, b) => {
    const byPath = a.path.localeCompare(b.path);
    return byPath !== 0 ? byPath : a.method.localeCompare(b.method);
  });
}
