import {describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {updateSourceBrainPackage,updateSourceBrainPackages,serverRunsFrom} from './source-brain-updates.mjs';

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
  it('leaves a checkout a live server runs from alone, because npm ci deletes node_modules under it',()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tr-source-serving-'));
    fs.writeFileSync(path.join(directory,'package.json'),JSON.stringify({name:'total-recall-brain',version:'3.40.1'}));
    const exec=vi.fn(()=>({status:0,stdout:''}));
    try{
      const result=updateSourceBrainPackage({directory,name:'total-recall-brain',version:'3.40.2',exec,serving:()=>true});
      expect(result).toMatchObject({ok:false,serving:true});
      expect(exec).not.toHaveBeenCalled();
    }finally{fs.rmSync(directory,{recursive:true,force:true});}
  });
  it('reports serving without counting it a failure, so maintenance does not retry every five minutes',()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tr-source-serving-row-'));
    fs.mkdirSync(path.join(directory,'.git'));
    fs.writeFileSync(path.join(directory,'package.json'),JSON.stringify({name:'total-recall-brain',version:'3.40.1'}));
    try{
      const report=updateSourceBrainPackages({versions:{'total-recall-brain':'3.40.2'},roots:[directory],update:()=>({ok:false,serving:true,error:'x'})});
      expect(report.failed).toBe(0);
      expect(report.results[0]).toMatchObject({status:'serving',installed:'3.40.1',latest:'3.40.2'});
    }finally{fs.rmSync(directory,{recursive:true,force:true});}
  });
  it('installs without inheriting NODE_ENV, which would strip dev dependencies',()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tr-source-env-'));
    const file=path.join(directory,'package.json'),name='total-recall-brain',version='3.40.2',commit='b'.repeat(40);
    fs.writeFileSync(file,JSON.stringify({name,version:'3.40.1'}));
    const envs={};
    const exec=(binary,args,options)=>{
      envs[args[0]]=options.env;
      let stdout='';
      if(args[0]==='view')stdout=JSON.stringify(commit);
      if(args[0]==='remote')stdout='https://example.test/core.git';
      if(args[0]==='show')stdout=JSON.stringify({name,version});
      if(args[0]==='rev-parse')stdout=commit;
      if(args[0]==='merge')fs.writeFileSync(file,JSON.stringify({name,version}));
      return {status:0,stdout};
    };
    const before=process.env.NODE_ENV;process.env.NODE_ENV='production';
    try{
      expect(updateSourceBrainPackage({directory,name,version,exec,serving:()=>false}).ok).toBe(true);
      expect(envs.ci).toBeDefined();
      expect(envs.ci.NODE_ENV).toBeUndefined();
    }finally{process.env.NODE_ENV=before;fs.rmSync(directory,{recursive:true,force:true});}
  });
});

describe('serverRunsFrom',()=>{
  const listing=(rows)=>(binary,args)=>{
    if(binary==='pgrep')return {status:rows.length?0:1,stdout:rows.map(row=>row.pid).join('\n')};
    if(binary==='ps'){const row=rows.find(item=>String(item.pid)===args[args.length-1]);return {status:row?0:1,stdout:row?.args||''};}
    if(binary==='readlink'){const row=rows.find(item=>args[0].includes(`/${item.pid}/`));return {status:row?0:1,stdout:row?.cwd||''};}
    if(binary==='lsof'){const row=rows.find(item=>args.includes(String(item.pid)));return {status:row?0:1,stdout:row?.cwd?`p${row.pid}\nn${row.cwd}\n`:''};}
    return {status:1,stdout:''};
  };
  it('finds a server by the absolute path in its arguments, as systemd starts it',()=>{
    expect(serverRunsFrom('/root/total-recall',{exec:listing([{pid:7,args:'/usr/local/bin/node /root/total-recall/src/server/index.mjs',cwd:'/root/total-recall'}]),platform:'linux'})).toBe(true);
  });
  it('finds a server by its working directory, as launchd starts it',()=>{
    expect(serverRunsFrom('/repo',{exec:listing([{pid:8,args:'node src/server/index.mjs',cwd:'/repo'}]),platform:'darwin'})).toBe(true);
  });
  it('ignores a server running from another install, which is how a swap moves the checkout',()=>{
    expect(serverRunsFrom('/root/total-recall',{exec:listing([{pid:9,args:'/usr/local/bin/node /opt/global/total-recall-brain/src/server/index.mjs',cwd:'/root/total-recall'}]),platform:'linux'})).toBe(false);
    expect(serverRunsFrom('/root/total-recall',{exec:listing([]),platform:'linux'})).toBe(false);
  });
  it('treats an unreadable process as serving, because the safe answer is to leave the files alone',()=>{
    const exec=(binary)=>binary==='pgrep'?{status:0,stdout:'10'}:{status:1,stdout:''};
    expect(serverRunsFrom('/repo',{exec,platform:'linux'})).toBe(true);
  });
});
