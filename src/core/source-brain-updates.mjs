/** Fast-forward a clean source-linked CLI to the registry's exact release commit. */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {listUpdateRoots} from './package-auto-update.mjs';
import {PACKAGE_ROOT} from './plugin-loader.mjs';
import {comparePackageVersions} from './package-version.mjs';
import {installEnv} from './brain-updates.mjs';

/**
 * Whether a live server runs from this checkout. systemd starts one with an absolute
 * path and launchd with a relative one, so the arguments decide when they can and the
 * working directory otherwise. A process that cannot be read counts as serving: leaving
 * the files alone is the safe answer, and the next run asks again.
 */
export function serverRunsFrom(directory,{exec=spawnSync,platform=process.platform}={}) {
  const read=(binary,args)=>exec(binary,args,{encoding:'utf8',timeout:5000});
  const listed=read('pgrep',['-f','src/server/index\\.mjs']);
  if(listed.status!==0)return false;
  let real=directory;try{real=fs.realpathSync(directory);}catch{}
  const roots=new Set([directory,real]);
  for(const pid of String(listed.stdout||'').split(/\s+/).filter(Boolean)){
    const args=read('ps',['-o','args=','-p',pid]);
    if(args.status!==0)return true;
    const prefix=/(\S*)src\/server\/index\.mjs/.exec(args.stdout||'')?.[1];
    if(prefix===undefined)continue;
    if(prefix.startsWith('/')){if(roots.has(prefix.replace(/\/+$/,'')))return true;continue;}
    const cwd=platform==='linux'?read('readlink',[`/proc/${pid}/cwd`]):read('lsof',['-a','-p',pid,'-d','cwd','-Fn']);
    if(cwd.status!==0)return true;
    const dir=platform==='linux'?String(cwd.stdout||'').trim():/^n(.+)$/m.exec(cwd.stdout||'')?.[1];
    if(!dir || roots.has(dir))return true;
  }
  return false;
}

export function updateSourceBrainPackages({brainDir,versions,roots,update=updateSourceBrainPackage}={}) {
  const results=[];
  for(const directory of new Set(roots || [PACKAGE_ROOT,...listUpdateRoots({brainDir}).map(item=>item.root)])) {
    if(!fs.existsSync(path.join(directory,'.git')))continue;
    let pkg;try{pkg=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));}catch{continue;}
    if(!Object.hasOwn(versions,pkg.name))continue;
    const latest=versions[pkg.name],row={root:directory,package:pkg.name,installed:pkg.version,latest,status:'up_to_date'};results.push(row);
    if(pkg.version===latest)continue;
    if(comparePackageVersions(pkg.version,latest)===1){row.status='failed';row.error='Newer source preview; refusing implicit downgrade';continue;}
    const result=update({directory,name:pkg.name,version:latest});
    row.status=result.ok?'updated':result.serving?'serving':'failed';
    if(result.ok){row.installed=result.installed;row.commit=result.commit;}else if(result.serving)row.note=result.error;else row.error=result.error;
  }
  return {failed:results.filter(row=>row.status==='failed').length,results};
}

export function updateSourceBrainPackage({directory,name,version,exec=spawnSync,serving=serverRunsFrom}={}) {
  // Merging and npm ci rewrite the code and delete node_modules under the process using them.
  if(serving(directory))return {ok:false,serving:true,error:'A live server runs from this checkout. Replacing that server moves it.'};
  const run=(binary,args,timeout=30000,env=process.env)=>{
    const result=exec(binary,args,{cwd:directory,encoding:'utf8',timeout,maxBuffer:8*1024*1024,env});
    if(result.status!==0)throw new Error(result.error?.message || result.stderr?.trim().slice(-1000) || `${binary} failed`);
    return result.stdout?.trim() || '';
  };
  const read=()=>JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
  try {
    if(read().name!==name)throw new Error('Source package identity mismatch');
    if(run('git',['status','--porcelain']))throw new Error('Source checkout has uncommitted changes');
    const commit=JSON.parse(run('npm',['view',`${name}@${version}`,'gitHead','--json']));
    if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('Published package has no verified source commit');
    const remote=run('git',['remote','get-url','origin']);
    if(!remote.startsWith('https://'))throw new Error('Source update requires an HTTPS origin');
    run('git',['fetch','origin',commit],120000);
    const candidate=JSON.parse(run('git',['show',`${commit}:package.json`]));
    if(candidate.name!==name || candidate.version!==version)throw new Error('Published source commit does not match the package version');
    run('git',['merge','--ff-only',commit]);
    run('npm',['ci','--no-audit','--no-fund'],600000,installEnv());
    if(read().version!==version || run('git',['rev-parse','HEAD'])!==commit)throw new Error('Source release readback failed');
    return {ok:true,installed:version,commit};
  }catch(error){return {ok:false,error:error.message};}
}
