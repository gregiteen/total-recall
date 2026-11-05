/**
 * Gate Adapters registry for Meta Harness (tr-plugin-cli-agents).
 * Provides harness-specific parsing, emission, installation and verification.
 */
import { claudeAdapter } from './claude.mjs';
import { agyAdapter } from './agy.mjs';
import { codexAdapter } from './codex.mjs';
import { dshAdapter } from './dsh.mjs';
import { hermesAdapter } from './hermes.mjs';
import { openclawAdapter } from './openclaw.mjs';
import { cursorAdapter } from './cursor.mjs';
import { devinAdapter } from './devin.mjs';
import { grokAdapter } from './grok.mjs';
import { clineAdapter } from './cline.mjs';
import { piAdapter } from './pi.mjs';

const ADAPTERS = new Map([
  ['claude', claudeAdapter],
  ['claude-code', claudeAdapter],
  ['agy', agyAdapter],
  ['antigravity', agyAdapter],
  ['codex', codexAdapter],
  ['dsh', dshAdapter],
  ['hermes', hermesAdapter],
  ['openclaw', openclawAdapter],
  ['cursor', cursorAdapter],
  ['devin', devinAdapter],
  ['windsurf', devinAdapter],
  ['grok', grokAdapter],
  ['cline', clineAdapter],
  ['pi', piAdapter]
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
    claude: claudeAdapter,
    agy: agyAdapter,
    codex: codexAdapter,
    dsh: dshAdapter,
    hermes: hermesAdapter,
    openclaw: openclawAdapter,
    cursor: cursorAdapter,
    devin: devinAdapter,
    grok: grokAdapter,
    cline: clineAdapter,
    pi: piAdapter
  }
};
