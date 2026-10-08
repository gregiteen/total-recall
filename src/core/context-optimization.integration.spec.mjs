// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { buildLocalSearchIndex, fastSearch } from './fast-recall.mjs';
import { buildRulesBlock } from './surface.mjs';
import { compileContext } from './context-compiler.mjs';
import { generateRepoExpert } from '../cli/repo-expert-generate.mjs';
import { writeNodeValidatedAsync } from './validated-write.mjs';
vi.mock('./logger.mjs', () => ({logger: {info:vi.fn(), warn:vi.fn(), error:vi.fn(), debug:vi.fn()}}));
describe('context optimization populated synthetic walkthrough', () => {
 it('searches 10,000 real Markdown documents without full-vault hydration', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tr-local-10k-'));
  const vaultDir=path.join(root,'memory-vault'), derivedDir=path.join(root,'memory-derived');
  fs.mkdirSync(path.join(vaultDir,'facts'),{recursive:true});
  const nodes=[];
  try {
   for(let i=0;i<10000;i++) {
    const slug=`fixture-${i}`, file=path.join(vaultDir,'facts',slug+'.md');
    const body=`bodyunique${i} local full text`;
    fs.writeFileSync(file,`---\ntype: memory\nslug: ${slug}\ncategory: facts\nstatus: active\n---\n${body}`);
    nodes.push({slug,category:'facts',status:'active',body,_filePath:file});
   }
   buildLocalSearchIndex(nodes,{vaultDir,derivedDir});
   const script=`import {fastSearch} from ${JSON.stringify(new URL('./fast-recall.mjs',import.meta.url).href)}; const start=performance.now(); const r=fastSearch('bodyunique9999',{derivedDir:${JSON.stringify(derivedDir)},vaultDir:${JSON.stringify(vaultDir)},fullText:true}); console.log(JSON.stringify({ms:performance.now()-start,slug:r[0]?.slug,stats:r.stats}));`;
   const project=path.join(root,'project');
   const brain=path.join(project,'.agent/skills/total-recall');
   fs.mkdirSync(brain,{recursive:true});
   fs.symlinkSync(vaultDir,path.join(brain,'memory-vault'));
   fs.symlinkSync(derivedDir,path.join(brain,'memory-derived'));
   const cliPath=new URL('../../bin/total-recall.mjs',import.meta.url);
   const cliStart=performance.now();
   const cli=spawnSync(process.execPath,[cliPath.pathname,'recall','bodyunique9999','--project','--local','--timings','--format','json'],{cwd:project,env:{...process.env,HOME:root,AGENT_DIR:path.join(project,'.agent'),TR_SECRETS_NO_KEYCHAIN:'1'},encoding:'utf8'});
   const cliMs=performance.now()-cliStart;
   expect(cli.status,cli.stderr).toBe(0);
   expect(JSON.parse(cli.stdout)[0].slug).toBe('fixture-9999');
   console.log(JSON.stringify({cli_first_output_and_exit_ms:cliMs}));
   expect(cliMs).toBeLessThan(500);
   const cold=[];
   for(let i=0;i<5;i++) {
    const start=performance.now();
    const run=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
    expect(run.status).toBe(0);
    const result=JSON.parse(run.stdout);
    expect(result.slug).toBe('fixture-9999');
    expect(result.stats.hydrated_documents).toBe(1);
    cold.push(performance.now()-start);
   }
   const warm=[];
   for(let i=0;i<12;i++) {
    const start=performance.now();fastSearch('bodyunique9999',{vaultDir,derivedDir,fullText:true});warm.push(performance.now()-start);
   }
   cold.sort((a,b)=>a-b);warm.sort((a,b)=>a-b);
   console.log(JSON.stringify({fixture_documents:10000,cold_process_p95_ms:cold.at(-1),warm_p95_ms:warm.at(-1)}));
   expect(cold.at(-1)).toBeLessThan(500);
   expect(warm.at(-1)).toBeLessThan(50);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
 });
 it('routes a small bootstrap to complete action-specific constraints and rejects overflow',async()=>{
  const nodes=Array.from({length:100},(_,i)=>({slug:`rule-${i}`,title:`Rule ${i}`,category:'invariants',status:'active',body:`constraint ${i} `.repeat(30),tags:[`context:action:${i%2?'test':'publish'}`]}));
  const block=await buildRulesBlock(null,nodes,{bootstrap:true});
  expect(block.length).toBeLessThan(4000);
  expect(block).toContain('Before taking action');
  const capsule=await compileContext({nodes,actions:['test'],budget:{total:16000}});
  expect(capsule.ready).toBe(true);
  expect(capsule.stats.required_ids).toHaveLength(50);
  const small=await compileContext({nodes,actions:['test'],budget:{total:10}});
  expect(small.ready).toBe(false);expect(small.stats.required_ids).toHaveLength(50);
 });
 it('round-trips validated save, local recall, action capsule, refresh and rollback without a provider',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tr-validated-context-'));
  const vaultDir=path.join(root,'vault'),derivedDir=path.join(root,'derived');
  fs.mkdirSync(vaultDir,{recursive:true});
  try {
   const node={type:'memory',slug:'validated-rule',title:'Validated fixture',category:'invariants',status:'active',body:'Preserve all required fixture instructions.',tags:['context:action:test']};
   const write=await writeNodeValidatedAsync(node,vaultDir);
   expect(write.success).toBe(true);
   const {loadNodes}=await import('./vault.mjs');
   const nodes=loadNodes(vaultDir);
   buildLocalSearchIndex(nodes,{vaultDir,derivedDir});
   expect(fastSearch('validated-rule',{vaultDir,derivedDir})[0].body).toBe(node.body);
   const before=await compileContext({nodes,actions:['test']});
   expect(before.ready).toBe(true);
   expect(before.context).toContain(node.body);
   const offline=await compileContext({nodes,actions:['edit']});
   expect(offline.stats.required_ids).toHaveLength(0);
   const changed=await compileContext({nodes:[{...nodes[0],body:'Changed fixture.'}],actions:['test']});
   expect(changed.stats.version).not.toBe(before.stats.version);
   expect((await compileContext({nodes,actions:['test']})).stats.version).toBe(before.stats.version);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });
 it('regenerates a compact expert with a separately loadable reference',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tr-expert-small-'));
  try {
   fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'fixture-project'}));
   const result=generateRepoExpert(root,{force:true});
   expect(fs.readFileSync(result.destFile,'utf8').length).toBeLessThan(2000);
   expect(fs.existsSync(path.join(path.dirname(result.destFile),'references/architecture.md'))).toBe(true);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });
});
