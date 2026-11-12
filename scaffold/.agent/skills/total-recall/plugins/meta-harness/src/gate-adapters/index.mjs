/**
 * Gate Adapters registry for Metaharness (tr-plugin-cli-agents).
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

const BINARIES = { claude: 'claude', agy: 'agy', codex: 'codex', dsh: 'dsh', hermes: 'hermes', openclaw: 'openclaw', cursor: 'cursor-agent', devin: 'devin', grok: 'grok', cline: 'cline', pi: 'pi' };

/**
 * Install the gate for every harness present on this machine. Safe to run repeatedly.
 * A harness that fails is reported, never skipped silently. The worker is imported here
 * because the preflight gate loads this module on every tool call.
 */
export async function installAll({ home, env = process.env, dryRun = false } = {}) {
  const { findBinary } = await import('../worker.mjs');
  const rows = [];
  for (const adapter of list()) {
    const binary = BINARIES[adapter.id] || adapter.id;
    if (!findBinary(binary, env)) { rows.push({ harness: adapter.id, status: 'not-present' }); continue; }
    try {
      const result = adapter.install({ ...(home ? { home } : {}), dryRun });
      if (result.unsupported) rows.push({ harness: adapter.id, status: 'unsupported', reason: result.unsupported });
      else rows.push({ harness: adapter.id, status: dryRun ? 'would-install' : 'installed', settings: result.settings, ...(result.note ? { note: result.note } : {}) });
    } catch (err) {
      rows.push({ harness: adapter.id, status: 'failed', error: err.message });
    }
  }
  return { ok: rows.every((row) => row.status !== 'failed'), rows };
}

/**
 * Take the gate out of every harness, for `total-recall uninstall` only. A fail-closed hook that
 * outlives Total Recall would deny every call in that harness. A harness that fails is reported.
 */
export function removeAll({ home, env, dryRun = false } = {}) {
  const rows = [];
  for (const adapter of list()) {
    try {
      const result = adapter.install({ ...(home ? { home } : {}), ...(env ? { env } : {}), dryRun, remove: true });
      const removed = result.removed || [];
      rows.push({ harness: adapter.id, status: removed.length ? 'removed' : 'absent', removed, ...(result.note ? { note: result.note } : {}) });
    } catch (err) {
      rows.push({ harness: adapter.id, status: 'failed', error: err.message });
    }
  }
  return { ok: rows.every((row) => row.status !== 'failed'), rows };
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
  installAll,
  removeAll,
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
