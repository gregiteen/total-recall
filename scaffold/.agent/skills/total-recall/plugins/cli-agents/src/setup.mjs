/** Configure through Total Recall's existing connect, compilation and plugin-record owners. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { findBinary, runProcess, agentEnvironment } from './worker.mjs';

export async function setupIntegrations({ node, cwd = process.cwd(), env = process.env, probe = runProcess } = {}) {
  const binary=findBinary('total-recall',env);
  if(!binary)throw new Error('Total Recall CLI is unavailable');
  const connected=[];
  for(const client of ['claude-code','codex','antigravity','cursor','dsh','grok','muse','pi','hermes']) {
    const result=await probe(binary,['connect',client],{cwd,env:agentEnvironment(env),timeoutMs:120000});
    if(result.exitCode!==0 || result.reason)throw new Error(`Total Recall connect ${client} failed`);
    connected.push(client);
  }
  const root=env.TR_PACKAGE_ROOT;
  if(!root || !path.isAbsolute(root) || JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).name!=='total-recall-brain')throw new Error('Verified native Total Recall host is required');
  let placement=null;
  if(node) {
    const {getPlugin}=await import(pathToFileURL(path.join(root,'src/core/plugin-loader.mjs')));
    const {patchPluginRecord,ensurePluginRecord}=await import(pathToFileURL(path.join(root,'src/core/plugin-store.mjs')));
    const mesh=await import(pathToFileURL(path.join(root,'src/core/mesh.mjs')));
    const target=mesh.findMeshNode(node);
    if(!target)throw new Error('Maintenance node is not recorded in the mesh');
    const plugin=getPlugin('cli-agents',cwd);
    if(!plugin?.valid)throw new Error('CLI-agents is not installed in the selected workspace');
    await ensurePluginRecord(plugin);
    placement=target.hostname;
    await patchPluginRecord(plugin,{task_nodes:{maintenance:placement}});
  }
  return {ok:true,connected,universalInstructions:'AGENTS.md; every dispatch also receives a freshly generated bootstrap',maintenanceNode:placement};
}
