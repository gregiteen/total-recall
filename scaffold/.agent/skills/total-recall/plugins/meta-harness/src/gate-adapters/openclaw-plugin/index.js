// Total Recall preflight gate for OpenClaw. Installed by `total-recall preflight install`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { registerGate } from './gate-client.js';

/** This machine's paths, written beside the plugin at install. The gate still runs without them. */
function readSettings(rootDir) {
  const folder = rootDir || path.dirname(fileURLToPath(import.meta.url));
  try {
    return JSON.parse(fs.readFileSync(path.join(folder, 'gate.json'), 'utf8'));
  } catch {
    return {};
  }
}

export default definePluginEntry({
  id: 'total-recall-gate',
  name: 'Total Recall Gate',
  description: 'Asks Total Recall whether each tool call may run.',
  register(api) {
    registerGate(api, readSettings(api.rootDir));
  },
});
