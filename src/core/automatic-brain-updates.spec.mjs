import {describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
vi.mock('./brain-updates.mjs',()=>({updateAllBrains:vi.fn()}));
vi.mock('./cli-maintenance.mjs',()=>({maintainCliSurfaces:vi.fn()}));
vi.mock('./package-auto-update.mjs',()=>({isPackageAutoUpdateEnabled:()=>true,listUpdateRoots:()=>[{root:'/registered/app'}]}));
vi.mock('./plugin-updates.mjs',()=>({updateInstalledPlugins:vi.fn().mockResolvedValue({updated:0,failed:0,results:[]})}));
vi.mock('./global-brain-updates.mjs',()=>({updateGlobalBrainPackages:vi.fn().mockResolvedValue({failed:0,results:[]})}));
vi.mock('./source-brain-updates.mjs',()=>({updateSourceBrainPackages:vi.fn().mockResolvedValue({failed:0,results:[]})}));
vi.mock('./portable-skills-maintenance.mjs',()=>({maintainPortableSkills:vi.fn().mockResolvedValue({skipped:true,failed:0,results:[]})}));
vi.mock('./running-server.mjs', async importOriginal => ({
  ...await importOriginal(),
  runningServerStatus: vi.fn().mockResolvedValue({ status: 'none' }),
}));
import {runAutomaticBrainUpdates,automaticUpdateStatus,startAutomaticBrainUpdates} from './automatic-brain-updates.mjs';

const temporary=[];
afterEach(()=>{vi.useRealTimers();for(const root of temporary.splice(0))fs.rmSync(root,{recursive:true,force:true});});
const brain=()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tr-automatic-'));temporary.push(dir);return dir;};
describe('daemon automatic package maintenance',()=>{
  it('reports a server left on an old release without counting it a failure',async()=>{
    const compile=vi.fn().mockResolvedValue({ok:true,results:[]});
    const update=vi.fn().mockResolvedValue({versions:{'total-recall-brain':'3.43.2'},failed:0,results:[]});
    const serverCheck=vi.fn().mockResolvedValue({status:'stale',running:'3.43.0',latest:'3.43.2',reason:'old process'});
    const report=await runAutomaticBrainUpdates({brainDir:brain(),update,compile,serverCheck});
    expect(serverCheck).toHaveBeenCalledWith(expect.objectContaining({latest:'3.43.2'}));
    expect(report.server).toMatchObject({status:'stale',running:'3.43.0'});
    expect(report.local_failed).toBe(0);
    expect(report.failed).toBe(0);
  });
  it('asks to replace a stale server after everything that moves files, with what it needs',async()=>{
    const order=[];
    const compile=vi.fn(async()=>{order.push('compile');return {ok:true,results:[]};});
    const update=vi.fn().mockResolvedValue({versions:{'total-recall-brain':'3.43.3'},failed:0,results:[]});
    const globalUpdate=vi.fn(async()=>{order.push('global');return {failed:0,results:[],root:'/global'};});
    const stale={status:'stale',url:'http://127.0.0.1:3000',running:'3.43.2',latest:'3.43.3',reason:'old process'};
    const serverCheck=vi.fn(async()=>{order.push('check');return stale;});
    const replaceServer=vi.fn(async()=>{order.push('replace');return {status:'current',running:'3.43.3',latest:'3.43.3',replacement:{method:'restart',state:'replaced',from:'3.43.2'}};});
    const dir=brain();
    const report=await runAutomaticBrainUpdates({brainDir:dir,update,compile,globalUpdate,serverCheck,replaceServer});
    expect(order).toEqual(['global','compile','check','replace']);
    expect(replaceServer).toHaveBeenCalledWith(expect.objectContaining({brainDir:dir,server:stale,globalRoot:'/global'}));
    expect(report.server).toMatchObject({status:'current',replacement:{state:'replaced'}});
    expect(report.local_failed).toBe(0);
  });
  it('leaves a server that is not stale alone',async()=>{
    const compile=vi.fn().mockResolvedValue({ok:true,results:[]});
    const update=vi.fn().mockResolvedValue({versions:{'total-recall-brain':'3.43.3'},failed:0,results:[]});
    const replaceServer=vi.fn();
    const serverCheck=vi.fn().mockResolvedValue({status:'current',running:'3.43.3',latest:'3.43.3'});
    await runAutomaticBrainUpdates({brainDir:brain(),update,compile,serverCheck,replaceServer});
    expect(replaceServer).not.toHaveBeenCalled();
  });
  it.each(['held','failed'])('counts a %s replacement as this machine\'s failure, so peers dispatch it again',async(state)=>{
    const compile=vi.fn().mockResolvedValue({ok:true,results:[]});
    const update=vi.fn().mockResolvedValue({versions:{'total-recall-brain':'3.43.3'},failed:0,results:[]});
    const serverCheck=vi.fn().mockResolvedValue({status:'stale',running:'3.43.2',latest:'3.43.3',reason:'old process'});
    const replaceServer=vi.fn().mockResolvedValue({status:'stale',running:'3.43.2',latest:'3.43.3',reason:'old process',replacement:{method:'restart',state,reason:'why'}});
    const report=await runAutomaticBrainUpdates({brainDir:brain(),update,compile,serverCheck,replaceServer});
    expect(report.local_failed).toBe(1);
    expect(report.failed).toBe(1);
  });
  it('passes a hold on to the next run',async()=>{
    const dir=brain();
    const compile=vi.fn().mockResolvedValue({ok:true,results:[]});
    const update=vi.fn().mockResolvedValue({versions:{'total-recall-brain':'3.43.3'},failed:0,results:[]});
    const serverCheck=vi.fn().mockResolvedValue({status:'stale',running:'3.43.2',latest:'3.43.3'});
    const held={status:'stale',running:'3.43.2',latest:'3.43.3',replacement:{method:'restart',state:'held',held_since:500}};
    const replaceServer=vi.fn().mockResolvedValue(held);
    await runAutomaticBrainUpdates({brainDir:dir,update,compile,serverCheck,replaceServer,force:true});
    await runAutomaticBrainUpdates({brainDir:dir,update,compile,serverCheck,replaceServer,force:true});
    expect(replaceServer.mock.calls[1][0].previous).toEqual(held);
  });
  it('does not count a host that cannot replace its server as failed',async()=>{
    const compile=vi.fn().mockResolvedValue({ok:true,results:[]});
    const update=vi.fn().mockResolvedValue({versions:{'total-recall-brain':'3.43.3'},failed:0,results:[]});
    const serverCheck=vi.fn().mockResolvedValue({status:'stale',running:'3.43.2',latest:'3.43.3'});
    const replaceServer=vi.fn().mockResolvedValue({status:'stale',running:'3.43.2',latest:'3.43.3',replacement:{method:'deploy',reason:'production'}});
    const report=await runAutomaticBrainUpdates({brainDir:brain(),update,compile,serverCheck,replaceServer});
    expect(report.local_failed).toBe(0);
  });
  it('retries fast for its own failures, and at the normal interval for a peer with no way to update', async () => {
    const brainDir=brain();
    const start=10000000;
    const compile=vi.fn().mockResolvedValue({ok:true,results:[]});
    const update=vi.fn().mockResolvedValue({versions:{'total-recall-brain':'3.40.2'},failed:0,results:[]});
    const meshUpdate=vi.fn().mockResolvedValue({failed:3,results:[{status:'failed',error:'Mesh peer has no configured update transport'}]});
    const first=await runAutomaticBrainUpdates({brainDir,update,compile,meshUpdate,fleet:true,now:()=>start});
    expect(first.failed).toBe(3);
    expect(first.local_failed).toBe(0);
    const tenMinutes=start+10*60*1000;
    expect((await runAutomaticBrainUpdates({brainDir,update,compile,meshUpdate,fleet:true,now:()=>tenMinutes})).reason).toBe('throttled');
    const local=vi.fn().mockResolvedValue({versions:{'total-recall-brain':'3.40.2'},failed:1,results:[]});
    const later=start+2*60*60*1000;
    expect((await runAutomaticBrainUpdates({brainDir,update:local,compile,meshUpdate,fleet:true,now:()=>later})).local_failed).toBe(1);
    const retried=await runAutomaticBrainUpdates({brainDir,update,compile,meshUpdate,fleet:true,now:()=>later+6*60*1000});
    expect(retried.reason).toBeUndefined();
  });

  it('updates the shared plugin folder and counts their failures',async()=>{
    const brainDir=path.join(brain(),'.agent','skills','total-recall');
    const update=vi.fn().mockResolvedValue({versions:{'total-recall-brain':'3.40.2'},failed:0,results:[]});
    const compile=vi.fn().mockResolvedValue({ok:true,results:[]});
    const pluginUpdate=vi.fn().mockResolvedValue({updated:1,failed:1,results:[{id:'maps',status:'updated'},{id:'gone',status:'failed',error:'source missing'}]});
    const report=await runAutomaticBrainUpdates({brainDir,update,compile,pluginUpdate,now:()=>10000000});
    expect(pluginUpdate).toHaveBeenCalledWith({roots:[path.resolve(brainDir,'../../..')]});
    expect(report.plugins.updated).toBe(1);
    expect(report.failed).toBe(1);
  });
  it('updates both package consumers, ensures defaults and persists actual failures',async()=>{
    const brainDir=brain();
    const update=vi.fn().mockResolvedValue({versions:{'total-recall-brain':'3.40.2','@gregiteen/ssss-cli':'0.11.2'},failed:1,results:[{status:'failed'}]});
    const compile=vi.fn().mockResolvedValue({ok:false,results:[{status:'failed',error:'surface'}]});
    const report=await runAutomaticBrainUpdates({brainDir,update,compile,now:()=>10000000});
    expect(update).toHaveBeenCalledWith({brainDir,dryRun:false,ensureDefaults:true});
    expect(compile).toHaveBeenCalledWith({brainDir,force:true});
    expect(report.failed).toBe(2);
    expect(automaticUpdateStatus(brainDir).last.failed).toBe(2);
    expect((await runAutomaticBrainUpdates({brainDir,update,compile,now:()=>10000001})).reason).toBe('throttled');
    expect(update).toHaveBeenCalledTimes(1);
  });
  it('keeps peer dispatch out of the node\'s own failure count',async()=>{
    const update=vi.fn().mockResolvedValue({versions:{'total-recall-brain':'3.40.2'},failed:0,results:[]});
    const compile=vi.fn().mockResolvedValue({ok:true,results:[]});
    const meshUpdate=vi.fn().mockResolvedValue({failed:2,results:[{status:'dispatched'},{status:'dispatched'}]});
    const report=await runAutomaticBrainUpdates({brainDir:brain(),fleet:true,update,compile,meshUpdate,now:()=>10000000});
    expect(report.local_failed).toBe(0);
    expect(report.failed).toBe(2);
  });
  it('checks on boot and by elapsed time with no tasks, never overlaps and stops',async()=>{
    vi.useFakeTimers();
    let release;
    const run=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValue({code:0});
    const maintenance=startAutomaticBrainUpdates({brainDir:brain(),intervalMs:1000,run});
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(1);
    release({code:0});await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0][1]).toContain('--automatic');
    maintenance.stop();await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it('reports a failed maintenance child instead of silently accepting its exit',async()=>{
    const onError=vi.fn();
    const maintenance=startAutomaticBrainUpdates({brainDir:brain(),run:async()=>({code:1,output:'npm failed'}),onError});
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith('npm failed');
    maintenance.stop();
  });
  it('counts portable skill verification failures in local maintenance',async()=>{
    const update=vi.fn().mockResolvedValue({versions:{'total-recall-brain':'3.40.2'},failed:0,results:[]});
    const compile=vi.fn().mockResolvedValue({ok:true,results:[]});
    const skillMaintenance=vi.fn().mockResolvedValue({apply:true,failed:2,results:[{status:'missing'}]});
    const brainDir=brain();
    const report=await runAutomaticBrainUpdates({brainDir,update,compile,skillMaintenance,now:()=>10000000});
    expect(skillMaintenance).toHaveBeenCalledWith({brainDir});
    expect(report.local_failed).toBe(2);
    expect(automaticUpdateStatus(brainDir).last.skills.results[0].status).toBe('missing');
  });

});
