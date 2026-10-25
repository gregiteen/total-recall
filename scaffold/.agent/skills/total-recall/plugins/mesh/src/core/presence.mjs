import { spawn } from 'node:child_process';
import { getLocalPresence, resolveActiveDevice } from './mesh-activity.mjs';
import { getMeshPeers, listEnrichedMeshNodes, meshVaultRoot, execMeshCommand } from './mesh.mjs';
import { getMeshSyncAuthorization } from './mesh-auth.mjs';

function validRecord(record, peer) {
  const age = Date.now() - Date.parse(record?.timestamp);
  return record && record.node_id === peer.hostname && record.mesh_ip === peer.ip && age >= -5000 && age <= 60000;
}
export async function getMeshPresence({ fetchImpl = fetch, includePeers = true } = {}) {
  const local = getLocalPresence();
  const peers = [];
  if (includePeers) {
    const candidates = listEnrichedMeshNodes(meshVaultRoot()).filter(peer => !peer.self && !peer.vault_only && peer.online && peer.ip);
    const authorization = candidates.some(peer => Number.isInteger(Number(peer.brain_port)) && Number(peer.brain_port) > 0 && Number(peer.brain_port) <= 65535) ? await getMeshSyncAuthorization() : null;
    await Promise.all(candidates.map(async peer => {
      try {
        const port = Number(peer.brain_port);
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('No valid presence service port is recorded for this peer');
        const response = await fetchImpl(`http://${peer.ip}:${port}/api/mesh/presence/local`, { headers: { Authorization: authorization }, redirect: 'error', signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`Peer HTTP ${response.status}`);
        const record = await response.json();
        if (!validRecord(record, peer)) throw new Error('Peer presence identity or freshness is invalid');
        peers.push({ ...record, state: 'observed' });
      } catch (error) { peers.push({ node_id: peer.hostname, mesh_ip: peer.ip, state: 'unavailable', error: error.message, timestamp: null }); }
    }));
  }
  return { success: true, local, peers, active_device: resolveActiveDevice([local, ...peers]), timestamp: new Date().toISOString() };
}
function executeLocal(command) {
  return new Promise(resolve => {
    let output = '', settled = false;
    const child = spawn('/bin/sh', ['-lc', command], { stdio: ['ignore', 'pipe', 'pipe'] });
    const collect = chunk => { output = (output + chunk.toString()).slice(0, 262144); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const timer = setTimeout(() => child.kill('SIGKILL'), 30000);
    const finish = result => { if (settled) return; settled = true; clearTimeout(timer); resolve({ ...result, output }); };
    child.on('error', () => finish({ success: false, error: 'Command could not start' }));
    child.on('close', (code, signal) => finish({ success: code === 0 && !signal, exitCode: code, signal }));
  });
}
export async function dispatchMesh(input = {}, dependencies = {}) {
  if (typeof input.command !== 'string' || !input.command.trim() || input.command.length > 16384) throw new Error('A bounded command is required');
  if (input.notification != null) throw new Error('Notification delivery requires an operator-alerts operation');
  const presence = await (dependencies.getPresence || getMeshPresence)();
  const target = input.target || presence.active_device?.node_id;
  if (!target) throw new Error('No fresh active device is available; select a target');
  const local = target === presence.local.node_id || target === 'local';
  const registered = getMeshPeers({ includeSelf: true }).find(peer => peer.hostname === target || peer.ip === target);
  if (!local && !registered) throw new Error('Unknown mesh target');
  const result = local ? await (dependencies.executeLocal || executeLocal)(input.command) : await (dependencies.executeRemote || execMeshCommand)(target, input.command);
  const success = result.success === true || result.exitCode === 0 || result.code === 0;
  return { success, dispatched: success, target_node: target, is_local: local, command_result: result, timestamp: new Date().toISOString() };
}
