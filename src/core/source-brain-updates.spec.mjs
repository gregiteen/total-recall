import {describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {updateSourceBrainPackage} from './source-brain-updates.mjs';

describe('published source checkout propagation',()=>{
  it('checks registry commit and candidate identity before fast-forward, then verifies readback',()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tr-source-update-'));
    const file=path.join(directory,'package.json'),name='total-recall-brain',version='3.40.2',commit='a'.repeat(40);
    fs.writeFileSync(file,JSON.stringify({name,version:'3.40.1'}));
    const exec=vi.fn((binary,args)=>{
      let stdout='';
      if(args[0]==='view')stdout=JSON.stringify(commit);
      if(args[0]==='remote')stdout='https://example.test/core.git';
      if(args[0]==='show')stdout=JSON.stringify({name,version});
      if(args[0]==='rev-parse')stdout=commit;
      if(args[0]==='merge')fs.writeFileSync(file,JSON.stringify({name,version}));
      return {status:0,stdout};
    });
    try{
      expect(updateSourceBrainPackage({directory,name,version,exec})).toMatchObject({ok:true,commit,installed:version});
      const calls=exec.mock.calls.map(([,args])=>args);
      expect(calls.find(args=>args[0]==='merge')).toEqual(['merge','--ff-only',commit]);
      expect(calls.findIndex(args=>args[0]==='show')).toBeLessThan(calls.findIndex(args=>args[0]==='merge'));
    }finally{fs.rmSync(directory,{recursive:true,force:true});}
  });
  it('leaves dirty source checkouts untouched',()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tr-source-dirty-'));
    fs.writeFileSync(path.join(directory,'package.json'),JSON.stringify({name:'total-recall-brain',version:'3.40.1'}));
    const exec=vi.fn(()=>({status:0,stdout:' M source.mjs'}));
    try{
      expect(updateSourceBrainPackage({directory,name:'total-recall-brain',version:'3.40.2',exec})).toMatchObject({ok:false,error:'Source checkout has uncommitted changes'});
      expect(exec).toHaveBeenCalledTimes(1);
    }finally{fs.rmSync(directory,{recursive:true,force:true});}
  });
});
