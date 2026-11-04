/**
 * Gate Adapters registry for Meta Harness (tr-plugin-cli-agents).
 * Provides harness-specific parsing, emission, installation and verification.
 */
import { claudeAdapter } from './claude.mjs';

const ADAPTERS = new Map([
  ['claude', claudeAdapter],
  ['claude-code', claudeAdapter]
]);

export function get(harnessId) {
  if (!harnessId) return null;
  return ADAPTERS.get(String(harnessId).toLowerCase()) || null;
}

export function list() {
  const seen = new Set();
  const result = [];
  for (const adapter of ADAPTERS.values()) {
    if (!seen.has(adapter.id)) {
      seen.add(adapter.id);
      result.push(adapter);
    }
  }
  return result;
}

export function install(harnessId, opts = {}) {
  const adapter = get(harnessId);
  if (!adapter) throw new Error(`Unknown harness adapter: ${harnessId}`);
  if (typeof adapter.install !== 'function') {
    throw new Error(`Harness adapter ${harnessId} does not support installation`);
  }
  return adapter.install(opts);
}

export function verify(harnessId, opts = {}) {
  const adapter = get(harnessId);
  if (!adapter) throw new Error(`Unknown harness adapter: ${harnessId}`);
  if (typeof adapter.verify !== 'function') {
    throw new Error(`Harness adapter ${harnessId} does not support verification`);
  }
  return adapter.verify(opts);
}

export default {
  get,
  list,
  install,
  verify,
  adapters: {
    claude: claudeAdapter
  }
};
