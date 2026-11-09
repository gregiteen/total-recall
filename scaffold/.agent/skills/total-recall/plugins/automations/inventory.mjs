import os from 'node:os';
import { collectLocalAutomations, coreModule, SOURCES, scheduledTasks, recordId } from './adapters.mjs';
export { scheduledTasks } from './adapters.mjs';

const MAX_PEER_BYTES = 4 * 1024 * 1024;
export function parseInventoryOutput(output) {
  if (typeof output !== 'string' || Buffer.byteLength(output) > MAX_PEER_BYTES) throw new Error('Invalid inventory output');
  try { return JSON.parse(output); } catch {
    // Host logs may surround command output. Accept one versioned inventory,
    // never guess between multiple command results or parse a logger payload.
    const values = output.trim().split('\n').flatMap(line => { try { const value = JSON.parse(line); return value?.schema_version === 1 && Array.isArray(value.nodes) ? [value] : []; } catch { return []; } });
    if (values.length !== 1) throw new Error('Expected one versioned inventory result');
    return values[0];
  }
}
const unavailableCoverage = (status, checked_at) => SOURCES.map(source => ({ source, status, checked_at }));
function verifyLocalResult(value) {
  if (!value || !Array.isArray(value.automations) || !Array.isArray(value.coverage)) throw new Error('Invalid local inventory');
  if (value.automations.length > 10000 * SOURCES.length) throw new Error('Peer inventory exceeds record limit');
  const statuses = new Set(['ok', 'partial', 'unsupported', 'disabled', 'error', 'unauthorized', 'offline']);
  for (const coverage of value.coverage) if (!SOURCES.includes(coverage.source) || !statuses.has(coverage.status)) throw new Error('Invalid peer coverage');
  for (const record of value.automations) if (typeof record.id !== 'string' || !SOURCES.includes(record.source) || typeof record.name !== 'string') throw new Error('Invalid peer automation');
  return value;
}
function nodeResult(base, value) {
  const missing = SOURCES.filter(source => !value.coverage.some(item => item.source === source));
  const coverage = [...value.coverage, ...missing.map(source => ({ source, status: 'unsupported', checked_at: base.checked_at, error: 'Peer did not report this source' }))];
  // Remote mutation is never advertised through a local-only control.
  const automations = value.automations.map(record => ({ ...record, node_id: base.node_id, actions: base.self ? record.actions || [] : [] }));
  return { ...base, status: coverage.every(source => ['ok', 'disabled'].includes(source.status)) ? 'ok' : 'partial', automations, coverage };
}

/** The plugin owns composition; every source and peer failure remains visible. */
export async function meshAutomationInventory(packageRoot, options = {}) {
  const checked_at = new Date().toISOString();
  const mesh = options.mesh || await coreModule(packageRoot, 'mesh');
  const self = options.self || mesh.getMeshSelf?.() || { hostname: os.hostname(), self: true };
  const selfId = self.ip || self.hostname || os.hostname();
  let nodes = options.localOnly ? [{ ...self, self: true }] : options.nodes || mesh.listEnrichedMeshNodes();
  if (!nodes.some(node => node.self || (node.ip && node.ip === self.ip))) nodes = [{ ...self, self: true }, ...nodes];
  nodes = [...new Map(nodes.map(node => [node.ip || node.hostname, node])).values()];
  const local = options.local || await collectLocalAutomations(packageRoot, { ...options, node_id: selfId });
  const execPeer = options.execPeer || mesh.execMeshCommand;
  let authorization = options.authorization;
  if (!options.localOnly && authorization === undefined) {
    try { authorization = await (await coreModule(packageRoot, 'mesh-auth')).getMeshSyncAuthorization(); } catch { authorization = null; }
  }
  const peerUrl = options.peerUrl || (await coreModule(packageRoot, 'plugin-peers')).meshPeerUrl;
  const fetchImpl = options.fetchImpl || (await coreModule(packageRoot, 'throttled-fetch')).throttledFetch;
  const records = await Promise.all(nodes.map(async node => {
    const node_id = node.ip || node.hostname;
    const base = { node_id, hostname: node.hostname, ip: node.ip, self: Boolean(node.self || node_id === selfId), online: Boolean(node.self || node.online), checked_at, automations: [], coverage: [] };
    if (base.self) return nodeResult(base, verifyLocalResult(local));
    const unavailable = (status, error) => ({ ...base, status, ...(error ? { error } : {}), coverage: unavailableCoverage(status === 'unreachable' ? 'error' : status, checked_at) });
    if (!node.online) return unavailable('offline');
    const port = node.brain_port || Number(process.env.TR_SERVER_PORT || process.env.PORT || 3000);
    try {
      if (execPeer) {
        try {
          // Mesh owns the authenticated transport. The command is fixed and read-only.
          // A mesh-sync token is not a PAT for the generic plugin-run HTTP route.
          const result = await execPeer(node_id, 'total-recall automations list --local --json', { timeoutMs: 15000 });
          if (result.success && result.exitCode === 0) {
            const inventory = parseInventoryOutput(result.stdout);
            if (inventory.schema_version !== 1 || !Array.isArray(inventory.nodes) || inventory.nodes.length !== 1 || inventory.nodes[0].self !== true) throw new Error('Unsupported peer inventory');
            return nodeResult(base, verifyLocalResult(inventory.nodes[0]));
          }
        } catch { /* Retain metadata through its separate mesh-auth contract below. */ }
      }
      if (!authorization) return unavailable('unauthorized', 'Full peer inventory is unavailable; mesh metadata authorization is unavailable');
      // Old or unreachable CLI hosts may still expose plugin declarations.
      const fallback = await fetchImpl(peerUrl(node.ip, '/api/mesh/plugins/installed', port), { headers: { Authorization: authorization } }, 5000);
      if (!fallback.ok) return unavailable(fallback.status === 404 ? 'unsupported' : [401, 403].includes(fallback.status) ? 'unauthorized' : 'error', `HTTP ${fallback.status}`);
      const data = await fallback.json();
      if (!Array.isArray(data.plugins)) throw new Error('Invalid legacy peer response');
      return nodeResult(base, { automations: scheduledTasks(data.plugins, { node_id }), coverage: SOURCES.map(source => ({ source, status: source === 'plugin-tasks' ? 'partial' : 'unsupported', checked_at,
        error: source === 'plugin-tasks' ? 'Peer metadata reports declarations only; placement and outcome evidence may be missing' : 'Full peer inventory is unavailable' })) });
    } catch (error) { return unavailable('unreachable', error.name === 'SyntaxError' ? 'Invalid peer JSON' : error.message); }
  }));
  return { schema_version: 1, checked_at, complete: records.every(node => node.status === 'ok'), nodes: records };
}

export function filterInventory(inventory, filters = {}) {
  let nodes = inventory.nodes;
  if (filters.node) nodes = nodes.filter(node => [node.node_id, node.hostname, node.ip].includes(filters.node));
  if (filters.node && !nodes.length) throw new Error('Unknown node');
  return { ...inventory, nodes: nodes.map(node => ({ ...node, automations: node.automations.filter(record => (!filters.source || record.source === filters.source) && (!filters.trigger || record.trigger?.kind === filters.trigger) && (!filters.state || record.state === filters.state)) })) };
}
