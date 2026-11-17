/** Bind only to an explicitly verified native Total Recall storage contract. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
let source;
if (process.env.TR_PACKAGE_ROOT) {
  const root = path.resolve(process.env.TR_PACKAGE_ROOT);
  if (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name !== 'total-recall-brain') throw new Error('Invalid native Total Recall host');
  source = path.join(root, 'src/core/plugin-state-store.mjs');
} else source = require.resolve('total-recall-brain/src/core/plugin-state-store.mjs');
export const { PluginStateStore } = await import(pathToFileURL(source).href);
