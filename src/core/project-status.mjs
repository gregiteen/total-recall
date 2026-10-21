/** Read-only inventory of recorded project work. No inferred completion or live readiness. */
import fs from 'node:fs';
import path from 'node:path';
import {listUpdateRoots,resolveRegistryFiles,readRegistryEntries} from './package-auto-update.mjs';
import {listTasks,resolveQueueDir} from './task-envelope.mjs';
import {globalBrainDirFor} from './brain-registry.mjs';

export function outstandingProjectStatus(options={}) {
  const globalBrainDir=options.brainDir || globalBrainDirFor();
  const roots=listUpdateRoots({...options,brainDir:globalBrainDir});
  const missing=resolveRegistryFiles({...options,brainDir:globalBrainDir}).flatMap(file=>readRegistryEntries(file)).filter(row=>row.path && !fs.existsSync(row.path)).map(row=>({root:row.path,status:'missing-registered-root'}));
  const projects=[];
  const queues=new Set([globalBrainDir]);
  for(const {root,name} of roots){
    queues.add(path.join(root,'.agent/skills/total-recall'));
    const row={name,root,projects:[],status:'no-outstanding-tracker-found'};
    for(const state of ['in-progress','planned','backlog','blocked']){
      const directory=path.join(root,'docs/projects',state);
      if(!fs.existsSync(directory))continue;
      for(const entry of fs.readdirSync(directory,{withFileTypes:true}).filter(entry=>entry.isDirectory())){
        const folder=path.join(directory,entry.name);
        const files=fs.readdirSync(folder).filter(file=>/PROJECT_TRACKER\.md$|^TRACKER\.md$/i.test(file));
        if(!files.length){row.projects.push({id:entry.name,state,status:'tracker-missing',folder});continue;}
        for(const file of files){
          const tracker=path.join(folder,file),body=fs.readFileSync(tracker,'utf8'),lines=body.split(/\r?\n/);
          const open=lines.flatMap((text,index)=>/^\s*[-*]\s+\[ \]/.test(text)?[{line:index+1,text:text.trim()}]:[]);
          const done=lines.filter(text=>/^\s*[-*]\s+\[[xX]\]/.test(text)).length;
          const status=body.match(/^(?:>\s*)?(?:\*\*)?(?:Project Status|Status)\s*:(?:\*\*)?\s*(.+)$/im)?.[1]?.trim() || 'not-declared';
          const blockers=lines.flatMap((text,index)=>/\b(blocked|blocker|blocking)\b/i.test(text) && !/^\s*[-*]\s+\[[xX]\]/.test(text)?[{line:index+1,text:text.trim()}]:[]);
          row.projects.push({id:entry.name,state,status,tracker,modifiedAt:fs.statSync(tracker).mtime.toISOString(),openCount:open.length,checkedCount:done,open,blockerMentions:blockers});
        }
      }
    }
    if(row.projects.length)row.status='recorded-outstanding-work';
    projects.push(row);
  }
  const tasks=[];
  for(const brainDir of queues)for(const task of listTasks(resolveQueueDir(brainDir),{status:'all'})){
    if(['completed','cancelled'].includes(task.status))continue;
    tasks.push({brainDir,slug:task.slug,intent:String(task.intent || '').trim().split(/\r?\n/).find(line=>line.trim() && !line.startsWith('#'))?.slice(0,300) || task.slug,status:task.status,executor:task.executor,priority:task.priority,source:task._filepath});
  }
  return {generatedAt:new Date().toISOString(),evidence:'Recorded trackers and task envelopes; live completion and deployments are not verified',rootCount:projects.length,projectCount:projects.reduce((n,row)=>n+row.projects.length,0),openCheckboxCount:projects.reduce((n,row)=>n+row.projects.reduce((m,p)=>m+(p.openCount || 0),0),0),projects,tasks,missing};
}

export function formatOutstandingProjectStatus(report){
  const clean=value=>String(value ?? 'unknown').replaceAll('|','\\|').replace(/\s+/g,' ').trim();
  const lines=['# Outstanding projects and tasks',`Generated ${report.generatedAt}.`,report.evidence,`${report.rootCount} registered roots; ${report.projectCount} project folders; ${report.openCheckboxCount} unchecked items; ${report.tasks.length} outstanding task records.`,'','Counts include duplicated plans in separate repositories. Missing trackers and empty checklists do not establish completion.',''];
  for(const repo of report.projects){
    lines.push(`## ${repo.name}`,'',`Source: ${repo.root}`,'');
    if(!repo.projects.length){lines.push('No outstanding project folder was found in the inspected Kanban directories. Project status remains unverified.','');continue;}
    lines.push('| Project | Recorded state | Open items | Source updated |','| --- | --- | ---: | --- |');
    for(const project of repo.projects)lines.push(`| [${clean(project.id)}](${project.tracker || project.folder}) | ${clean(project.state)}${project.status==='tracker-missing'?'; tracker missing':''} | ${project.openCount ?? '?'} | ${project.modifiedAt?.slice(0,10) || 'unknown'} |`);
    lines.push('');
    for(const project of repo.projects.filter(project=>project.open?.length)){
      lines.push(`### ${clean(project.id)}: recorded remaining work`,'');
      for(const item of project.open)lines.push(`- ${clean(item.text.replace(/^[-*]\s+\[ \]\s*/,''))} ([source](${project.tracker}:${item.line}))`);
      lines.push('');
    }
  }
  lines.push('## Outstanding daemon tasks','','| Task | Status | Executor | Source |','| --- | --- | --- | --- |');
  for(const task of report.tasks)lines.push(`| ${clean(task.slug)} | ${clean(task.status)} | ${clean(task.executor)} | [record](${task.source}) |`);
  for(const row of report.missing)lines.push(`Missing registered root: ${row.root}`);
  return lines.join('\n')+'\n';
}
