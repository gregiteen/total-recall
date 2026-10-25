import {describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {maintainCliSurfaces} from './cli-maintenance.mjs';
describe('automatic CLI surfaces',()=>{
 it('compiles changed inputs, retries failures, and forces SSSS-only release refresh',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tr-surface-maintenance-'));
  try{
   const brainDir=path.join(root,'.agent/skills/total-recall');fs.mkdirSync(brainDir,{recursive:true});
   const brains=[{root,brainDir,exists:true,enabled:true,kind:'project'}];let version='one';
   const run=vi.fn().mockResolvedValue({code:0});const options={brainDir,brains,run,fingerprint:()=>version};
   expect((await maintainCliSurfaces(options)).results[0].status).toBe('refreshed');
   expect((await maintainCliSurfaces(options)).results[0].status).toBe('current');
   version='two';run.mockResolvedValueOnce({code:1,output:'Compilation failed'});
   expect((await maintainCliSurfaces(options)).ok).toBe(false);
   run.mockResolvedValueOnce({code:1,output:'',stderr:'Required plugin auth is missing or invalid'});
   expect((await maintainCliSurfaces(options)).results[0].error).toContain('Required plugin auth');
   expect((await maintainCliSurfaces(options)).results[0].status).toBe('refreshed');
   expect((await maintainCliSurfaces({...options,force:true})).results[0].status).toBe('refreshed');
   expect(run.mock.calls[0][1]).toContain('refresh');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });
});
