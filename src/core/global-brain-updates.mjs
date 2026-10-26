/** Verify and maintain globally installed CLIs without replacing a source checkout. */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {BRAIN_PACKAGES} from './brain-updates.mjs';
import {comparePackageVersions} from './package-version.mjs';
import {updateSourceBrainPackage} from './source-brain-updates.mjs';

/**
 * A global link that points at a source checkout of `name` under another
 * directory name (the package was once published as `total-recall`). Missing it
 * made the update `npm install -g` over the bin and replace the operator's
 * source checkout with a registry copy.
 */
export function findLinkedSourceCheckout(root,name){
  let entries=[];try{entries=fs.readdirSync(root,{withFileTypes:true});}catch{return null;}
  for(const entry of entries){
    if(!entry.isSymbolicLink())continue;
    try{
      const dir=fs.realpathSync(path.join(root,entry.name));
      if(JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8')).name===name&&fs.existsSync(path.join(dir,'.git')))return dir;
    }catch{}
  }
  return null;
}

export function updateGlobalBrainPackages({versions,exec=spawnSync,sourceUpdate=updateSourceBrainPackage}={}) {
  const prefix=exec('npm',['root','--global'],{encoding:'utf8',timeout:15000});
  if(prefix.status!==0)return {failed:1,results:[{status:'failed',error:'Cannot resolve global npm root'}]};
  const root=prefix.stdout.trim();
  const results=[];
  const install=[];
  for(const name of BRAIN_PACKAGES){
    let directory=path.join(root,name);
    if(!fs.existsSync(directory))directory=findLinkedSourceCheckout(root,name)||directory;
    const file=path.join(directory,'package.json');
    let installed;try{installed=JSON.parse(fs.readFileSync(file,'utf8')).version;}catch{}
    const row={package:name,installed:installed || null,latest:versions[name],status:'up_to_date'};results.push(row);
    if(installed===versions[name])continue;
    if(!versions[name]){row.status='failed';row.error='Published version is unavailable';continue;}
    if(installed && comparePackageVersions(installed,versions[name])===1){row.status='failed';row.error='Newer local/preview global package; refusing implicit downgrade';continue;}
    if(fs.existsSync(path.join(directory,'.git'))){
      const result=sourceUpdate({directory:fs.realpathSync(directory),name,version:versions[name],exec});
      row.status=result.ok?'updated':'failed';row.source=true;
      if(result.ok){row.installed=result.installed;row.commit=result.commit;}else row.error=`Source checkout update failed: ${result.error}`;
      continue;
    }
    row.status='pending';install.push(`${name}@${versions[name]}`);
  }
  if(install.length){
    const result=exec('npm',['install','--global','--no-audit','--no-fund',...install],{encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024});
    for(const row of results.filter(row=>row.status==='pending')){
      try{row.installed=JSON.parse(fs.readFileSync(path.join(root,row.package,'package.json'),'utf8')).version;}catch{}
      row.status=result.status===0 && row.installed===row.latest?'updated':'failed';
      if(row.status==='failed')row.error=result.error?.message || result.stderr?.slice(-1000) || 'Global version verification failed';
    }
  }
  return {failed:results.filter(row=>row.status==='failed').length,results};
}
