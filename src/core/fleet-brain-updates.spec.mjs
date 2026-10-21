import {describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {updateGlobalBrainPackages} from './global-brain-updates.mjs';
import {updateMeshBrainPackages} from './mesh-brain-updates.mjs';
const versions={'total-recall-brain':'3.40.2','@gregiteen/ssss-cli':'0.11.2'};
describe('automatic global and mesh package updates',()=>{
 it('verifies actual global installs after npm and refuses source checkout replacement',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tr-global-update-'));
  const installed=(name,version)=>{const dir=path.join(root,name);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({version}));};
  try{
   installed('total-recall-brain','3.40.1');fs.mkdirSync(path.join(root,'total-recall-brain/.git'));
   const exec=vi.fn((_binary,args)=>{
    if(args[0]==='root')return {status:0,stdout:root};
    installed('@gregiteen/ssss-cli',versions['@gregiteen/ssss-cli']);return {status:0};
   });
   const result=updateGlobalBrainPackages({versions,exec,sourceUpdate:()=>({ok:false,error:'uncommitted changes'})});
   expect(result.failed).toBe(1);expect(result.results[0].error).toContain('Source checkout');
   expect(result.results[1].status).toBe('updated');
   expect(exec.mock.calls[1][1]).not.toContain('total-recall-brain@3.40.2');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });
 it('does not call dispatched or offline peers verified and checks both package versions',async()=>{
  const nodes=[{self:true,ip:'self'},{ip:'phone',online:true},{ip:'offline',online:false,access:{ssh_user:'alice'}},{ip:'old',online:true,access:{ssh_user:'alice'}},{ip:'current',online:true,access:{ssh_user:'alice'}}];
  const exec=vi.fn(async(node,command)=>{
   if(command.includes('nohup'))return {success:true};
   return {success:true,stdout:JSON.stringify({last:{failed:0,checkedAt:1000,versions:node==='old'?{...versions,'@gregiteen/ssss-cli':'0.10.0'}:versions}})};
  });
  const report=await updateMeshBrainPackages({version:versions['total-recall-brain'],versions,listNodes:()=>nodes,exec,now:()=>2000});
  expect(report.failed).toBe(2);
  expect(report.results.map(row=>row.status)).toEqual(['failed','dispatched','verified']);
  expect(exec.mock.calls.find(([node,cmd])=>node==='old' && cmd.includes('nohup'))[1]).toContain('--local-only');
  expect(exec.mock.calls.some(([node])=>node==='phone' || node==='self' || node==='offline')).toBe(false);
 });
});
