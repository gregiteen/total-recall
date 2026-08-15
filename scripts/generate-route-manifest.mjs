/**
 * Regenerate src/server/route-manifest.json from the live Express router.
 *
 * Run after any intentional route change:
 *   npm run routes:manifest
 *
 * Reuses the same extraction the drift spec uses, so a regenerated manifest
 * always matches what the spec will compare against. Prints the delta rather
 * than writing silently — a manifest update should be a reviewable diff, since
 * the whole point of the file is to make route changes visible.
 */

import fs from 'node:fs';
import restRouter from '../src/server/rest.mjs';
import { MANIFEST_PATH, extractRoutes, sortRoutes } from '../src/server/route-inventory.mjs';

const live = sortRoutes(extractRoutes(restRouter));

let previous = [];
try {
  previous = sortRoutes(JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')));
} catch {
  console.log('No readable existing manifest — writing a fresh one.');
}

const key = (route) => `${route.method} ${route.path}`;
const previousKeys = new Set(previous.map(key));
const liveKeys = new Set(live.map(key));

const added = live.filter((route) => !previousKeys.has(key(route)));
const removed = previous.filter((route) => !liveKeys.has(key(route)));

for (const route of added) console.log(`  + ${key(route)}`);
for (const route of removed) console.log(`  - ${key(route)}`);

if (!added.length && !removed.length) {
  console.log(`Manifest already matches the live router (${live.length} routes).`);
  process.exit(0);
}

fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(live, null, 2)}\n`);
console.log(
  `\nWrote ${live.length} routes to route-manifest.json ` +
    `(+${added.length}/-${removed.length}). Commit it with the route change.`,
);
