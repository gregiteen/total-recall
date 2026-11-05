/** Bind only to the verified native Total Recall storage contract. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

function resolveStateStoreSource() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [process.env.TR_PACKAGE_ROOT, path.resolve(here, '..', '..', 'total-recall'), path.resolve(process.cwd(), '..', 'total-recall'), process.cwd()].filter(Boolean);
  for (const root of candidates) {
    try {
      if (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name !== 'total-recall-brain') continue;
      const file = path.join(root, 'src/core/plugin-state-store.mjs');
      if (fs.existsSync(file)) return file;
    } catch { /* try the next candidate */ }
  }
  return null;
}
const source = resolveStateStoreSource();
if (!source) throw new Error('Cannot bind the native Total Recall storage contract: no total-recall-brain host found. Run inside a Total Recall host or set TR_PACKAGE_ROOT.');
export const { PluginStateStore } = await import(pathToFileURL(source).href);
