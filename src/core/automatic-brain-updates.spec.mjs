import {describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
vi.mock('./brain-updates.mjs',()=>({updateAllBrains:vi.fn()}));
vi.mock('./cli-maintenance.mjs',()=>({maintainCliSurfaces:vi.fn()}));
vi.mock('./package-auto-update.mjs',()=>({isPackageAutoUpdateEnabled:()=>true}));
vi.mock('./global-brain-updates.mjs',()=>({updateGlobalBrainPackages:vi.fn().mockResolvedValue({failed:0,results:[]})}));
vi.mock('./source-brain-updates.mjs',()=>({updateSourceBrainPackages:vi.fn().mockResolvedValue({failed:0,results:[]})}));
import {runAutomaticBrainUpdates,automaticUpdateStatus,startAutomaticBrainUpdates} from './automatic-brain-updates.mjs';

const temporary=[];
afterEach(()=>{vi.useRealTimers();for(const root of temporary.splice(0))fs.rmSync(root,{recursive:true,force:true});});
const brain=()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tr-automatic-'));temporary.push(dir);return dir;};
describe('daemon automatic package maintenance',()=>{
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
});
