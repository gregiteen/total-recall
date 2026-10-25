/** The existing TR daemon maintains both published brain packages, not only TR. */
import fs from 'node:fs';
import path from 'node:path';
import { updateAllBrains } from './brain-updates.mjs';
import { isPackageAutoUpdateEnabled } from './package-auto-update.mjs';
import { maintainCliSurfaces } from './cli-maintenance.mjs';
import { runBounded, cliEntry } from './startup-health.mjs';
import { logger } from './logger.mjs';
import { readProcessCommand, shouldHonorPidLock } from './pid-lock.mjs';
import { updateGlobalBrainPackages } from './global-brain-updates.mjs';
import { updateMeshBrainPackages } from './mesh-brain-updates.mjs';
import { updateSourceBrainPackages } from './source-brain-updates.mjs';
import { updateInstalledPlugins } from './plugin-updates.mjs';

export function automaticUpdateStatus(brainDir) {
  let last;
  try { last=JSON.parse(fs.readFileSync(path.join(brainDir,'memory-derived/automatic-brain-updates.json'),'utf8')); } catch {}
  return {enabled:isPackageAutoUpdateEnabled(), intervalMs:60*60*1000, last:last || null};
}

// Keep synchronous package-manager work outside the daemon's event loop. This
// timer runs even when the task queue is empty; it does not create a scheduler.
export function startAutomaticBrainUpdates({brainDir,intervalMs=60*60*1000,run=runBounded,onError=message=>logger.error('automatic-brain-updates',message)}={}) {
  let busy=false,stopped=false;
  const tick=async()=>{
    if(busy || stopped)return;
    busy=true;
    try {
      const result=await run(process.execPath,[cliEntry,'update','--automatic','--json'],{cwd:path.resolve(brainDir,'../../..'),timeoutMs:55*60*1000,maxBytes:8*1024*1024});
      if(result.code!==0)onError(result.reason || result.output || 'Automatic update failed');
    } catch(error){onError(error.message);} finally{busy=false;}
  };
  // Wake frequently enough to retry failures; successful checks remain hourly.
  const timer=setInterval(tick,Math.min(intervalMs,5*60*1000));timer.unref?.();void tick();
  return {tick,stop(){stopped=true;clearInterval(timer);}};
}

export async function runAutomaticBrainUpdates({brainDir,fleet=false,force=false,skipThrottle=false,intervalMs=60*60*1000,update=updateAllBrains,compile=maintainCliSurfaces,globalUpdate=updateGlobalBrainPackages,meshUpdate=updateMeshBrainPackages,sourceUpdate=updateSourceBrainPackages,pluginUpdate=updateInstalledPlugins,now=Date.now}={}) {
  if(!force && !isPackageAutoUpdateEnabled())return {skipped:true,reason:'disabled',results:[]};
  const file=path.join(brainDir,'memory-derived/automatic-brain-updates.json');
  let saved;try{saved=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
  const delay=saved?.failed?Math.min(intervalMs,5*60*1000):intervalMs;
  if(!force && !skipThrottle && saved?.checkedAt && now()>=saved.checkedAt && now()-saved.checkedAt<delay)return {skipped:true,reason:'throttled',results:[]};
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const lock=`${file}.lock`;
  let fd;
  if(fs.existsSync(lock)){
    const text=fs.readFileSync(lock,'utf8');
    const verdict=Number(text)===process.pid ? {honor:true} : shouldHonorPidLock(Number(text),{isAlive:pid=>{try{process.kill(pid,0);return true;}catch{return false;}},readCommand:readProcessCommand,entryHint:'total-recall'});
    if(!verdict.honor && fs.readFileSync(lock,'utf8')===text)fs.unlinkSync(lock);
  }
  try {fd=fs.openSync(lock,'wx',0o600);fs.writeFileSync(fd,String(process.pid));}
  catch(error){if(error.code==='EEXIST')return {skipped:true,reason:'maintenance-already-running',failed:1,results:[]};throw error;}
  try {
    let report;
    try {
      const summary=await update({brainDir,dryRun:false,ensureDefaults:true});
      const global=summary.versions?await globalUpdate({versions:summary.versions}):{failed:1,results:[],error:'Cannot maintain global packages without verified published versions'};
      const sources=summary.versions?await sourceUpdate({brainDir,versions:summary.versions}):{failed:1,results:[]};
      // The shared plugin folder follows the source each plugin was installed from (git, mesh peer, directory).
      const plugins=await pluginUpdate({roots:[path.resolve(brainDir,'../../..')]});
      const mesh=fleet && summary.versions?await meshUpdate({versions:summary.versions,version:summary.versions['total-recall-brain']}):{failed:0,results:[],scope:'local-only'};
      const changed=summary.updated>0 || plugins.updated>0 || global.results.some(row=>row.status==='updated') || sources.results.some(row=>row.status==='updated') || JSON.stringify(saved?.versions)!==JSON.stringify(summary.versions);
      const surfaces=await compile({brainDir,force:changed});
      report={...summary,global,sources,plugins,mesh,surfaces,failed:(summary.failed || 0)+global.failed+sources.failed+plugins.failed+mesh.failed+(surfaces.ok?0:surfaces.results.filter(row=>row.status==='failed').length),checkedAt:now()};
    }catch(error){report={failed:1,error:error.message,checkedAt:now(),results:[]};}
    const temporary=`${file}.${process.pid}.tmp`;fs.writeFileSync(temporary,JSON.stringify(report,null,2));fs.renameSync(temporary,file);
    return report;
  } finally {fs.closeSync(fd);fs.unlinkSync(lock);}
}
