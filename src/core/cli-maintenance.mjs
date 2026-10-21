/** Daemon-owned change detection for CLI inventories and every registered surface. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { listLocalBrains } from './brain-registry.mjs';
import { buildPluginCatalog } from './plugin-catalog.mjs';
import { discoverPlugins, PACKAGE_ROOT } from './plugin-loader.mjs';
import { runBounded } from './startup-health.mjs';
import { logger } from './logger.mjs';

export function cliInputFingerprint(root) {
  const hash=crypto.createHash('sha256');
  const add=file=>{try{const stat=fs.statSync(file);hash.update(`${file}:${stat.mtimeMs}:${stat.size}\n`);}catch{hash.update(`missing:${file}\n`);}};
  for(const file of ['bin/total-recall.mjs','src/core/cli-commands.mjs','src/core/cli-quick-reference.mjs'])add(path.join(PACKAGE_ROOT,file));
  const walk=directory=>{for(const item of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,item.name);if(item.isDirectory())walk(file);else if(item.name.endsWith('.mjs'))add(file);}};
  walk(path.join(PACKAGE_ROOT,'src/cli'));
  hash.update(buildPluginCatalog(root).fingerprint);
  for(const plugin of discoverPlugins(root)){add(plugin.manifestPath);if(plugin.manifest.cli?.handler)add(path.join(plugin.dir,plugin.manifest.cli.handler));}
  return hash.digest('hex');
}

export async function maintainCliSurfaces({brainDir,brains,force=false,run=runBounded,fingerprint=cliInputFingerprint}={}) {
  const results=[];
  for(const brain of brains || listLocalBrains({globalBrainDir:brainDir})) {
    if(!brain.exists || brain.enabled===false)continue;
    const root=brain.root || path.dirname(path.dirname(brain.brainDir));
    const file=path.join(brain.brainDir,'memory-derived/cli-maintenance.json');
    let previous;try{previous=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
    const current=fingerprint(root);
    if(!force && previous?.fingerprint===current){results.push({root,status:'current'});continue;}
    const result=await run(process.execPath,[path.join(PACKAGE_ROOT,'bin/total-recall.mjs'),'plugin','refresh',...(brain.kind==='global'?['--global']:[])],{cwd:root,timeoutMs:600000,maxBytes:262144});
    if(result.code!==0){results.push({root,status:'failed',error:result.reason || result.output?.slice(-1000) || 'CLI compilation failed'});continue;}
    fs.mkdirSync(path.dirname(file),{recursive:true});
    const temp=`${file}.${process.pid}.tmp`;fs.writeFileSync(temp,JSON.stringify({fingerprint:current,compiledAt:new Date().toISOString()}));fs.renameSync(temp,file);
    results.push({root,status:'refreshed'});
  }
  return {ok:results.every(row=>row.status!=='failed'),results};
}

export function startCliSurfaceMaintenance({brainDir,intervalMs=30000}={}) {
  let busy=false;
  const tick=async()=>{if(busy)return;busy=true;try{const result=await maintainCliSurfaces({brainDir});if(!result.ok)logger.error('cli-maintenance',JSON.stringify(result));}catch(error){logger.error('cli-maintenance',error.message);}finally{busy=false;}};
  const timer=setInterval(tick,intervalMs);timer.unref?.();void tick();
  return {stop(){clearInterval(timer);}};
}
