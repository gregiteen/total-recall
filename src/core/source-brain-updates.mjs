/** Fast-forward a clean source-linked CLI to the registry's exact release commit. */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {listUpdateRoots} from './package-auto-update.mjs';
import {PACKAGE_ROOT} from './plugin-loader.mjs';
import {comparePackageVersions} from './package-version.mjs';

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
    row.status=result.ok?'updated':'failed';
    if(result.ok){row.installed=result.installed;row.commit=result.commit;}else row.error=result.error;
  }
  return {failed:results.filter(row=>row.status==='failed').length,results};
}

export function updateSourceBrainPackage({directory,name,version,exec=spawnSync}={}) {
  const run=(binary,args,timeout=30000)=>{
    const result=exec(binary,args,{cwd:directory,encoding:'utf8',timeout,maxBuffer:8*1024*1024});
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
    run('npm',['ci','--no-audit','--no-fund'],600000);
    if(read().version!==version || run('git',['rev-parse','HEAD'])!==commit)throw new Error('Source release readback failed');
    return {ok:true,installed:version,commit};
  }catch(error){return {ok:false,error:error.message};}
}
