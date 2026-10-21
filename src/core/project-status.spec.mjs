import {describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
vi.mock('./package-auto-update.mjs',()=>({listUpdateRoots:({roots=[]})=>roots.map(root=>({root,name:path.basename(root)})),resolveRegistryFiles:()=>[],readRegistryEntries:()=>[]}));
vi.mock('./task-envelope.mjs',()=>({listTasks:()=>[],resolveQueueDir:root=>root}));
import {outstandingProjectStatus,formatOutstandingProjectStatus} from './project-status.mjs';
describe('all-project status',()=>{
  it('reports missing trackers and remaining work without treating zero checkboxes as completion',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'tr-project-report-'));
    try{
      const directory=path.join(root,'docs/projects/in-progress/ONE');fs.mkdirSync(directory,{recursive:true});
      fs.writeFileSync(path.join(directory,'ONE_PROJECT_TRACKER.md'),'# One\n**Status:** In Progress\n- [ ] unfinished\n- [x] checked\nSome prose status: not the project state\n');
      fs.mkdirSync(path.join(root,'docs/projects/planned/TWO'),{recursive:true});
      const report=outstandingProjectStatus({brainDir:root,roots:[root]});
      expect(report.projectCount).toBe(2);expect(report.openCheckboxCount).toBe(1);
      expect(report.projects[0].projects[0].status).toBe('In Progress');
      expect(report.projects[0].projects[1].status).toBe('tracker-missing');
      const rendered=formatOutstandingProjectStatus(report);
      expect(rendered).toContain('unfinished');expect(rendered).toContain('live completion and deployments are not verified');
      expect(rendered).toContain('tracker missing');
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  });
});
