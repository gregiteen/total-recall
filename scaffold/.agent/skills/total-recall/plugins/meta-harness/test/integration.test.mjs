import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { totalRecallBootstrap } from '../src/worker.mjs';
import { documentationStatus, refreshDocumentation, DOC_SOURCES } from '../src/documentation.mjs';
import { manageRuntime } from '../src/runtime.mjs';
import { setupIntegrations } from '../src/setup.mjs';

function fixture(t) { const root=fs.mkdtempSync(path.join(os.tmpdir(),'cli-agents-integration-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root; }
test('every supported adapter owns an official documentation source',()=>{
 assert.deepEqual(DOC_SOURCES.map(source=>source.id),['claude','codex','agy','cursor','dsh','grok','muse','pi','hermes']);
 for(const source of DOC_SOURCES)assert.match(source.index,/^https:/);
});
test('downloads actual documents, validates hashes, retains last good content and reports refresh failure',async t=>{
 const directory=fixture(t);
 const index='# Official documentation index\nhttps://code.claude.com/docs/en/headless.md\n';
 const page='# Headless reference\nThis is the actual downloaded official page content.\n';
 const fetchImpl=async url=>new Response(String(url).endsWith('llms.txt')?index:page);
 const report=await refreshDocumentation({directory,agent:'claude',fetchImpl});
 assert.equal(report.ok,true);assert.equal(report.agents[0].pages,2);
 assert.equal(documentationStatus({directory,agent:'claude'}).ok,true);
 const saved=JSON.parse(fs.readFileSync(path.join(directory,'claude/index.json'),'utf8'));
 assert.equal(fs.readFileSync(path.join(directory,'claude',saved.pages[1].file),'utf8'),page);
 const failed=await refreshDocumentation({directory,agent:'claude',fetchImpl:async()=>new Response('gone',{status:503})});
 assert.equal(failed.ok,false);assert.equal(documentationStatus({directory,agent:'claude'}).ok,false);
 assert.equal(fs.readFileSync(path.join(directory,'claude',saved.pages[1].file),'utf8'),page);
 fs.writeFileSync(path.join(directory,'claude',saved.pages[1].file),'corrupt');
 assert.equal(documentationStatus({directory,agent:'claude'}).agents[0].complete,false);
});
test('documentation refuses redirects away from official origins',async t=>{
 const result=await refreshDocumentation({directory:fixture(t),agent:'claude',fetchImpl:async()=>new Response('',{status:302,headers:{location:'https://untrusted.invalid/docs'}})});
 assert.equal(result.ok,false);assert.match(result.agents[0].error,/Unapproved/);
});
test('partial catalog downloads retain successful pages and report every failed source',async t=>{
 const directory=fixture(t);
 const index='# Official documentation\nhttps://code.claude.com/docs/good.md\nhttps://code.claude.com/docs/missing.md\n';
 const result=await refreshDocumentation({directory,agent:'claude',fetchImpl:async url=>String(url).endsWith('llms.txt')?new Response(index):String(url).endsWith('missing.md')?new Response('missing',{status:404}):new Response('# Reference\nThe successful source remains readable after partial refresh.')});
 assert.equal(result.ok,false);assert.equal(result.agents[0].downloadedPages,2);assert.equal(result.agents[0].failedCount,1);
 const status=documentationStatus({directory,agent:'claude'});assert.equal(status.agents[0].pages,2);assert.equal(status.agents[0].complete,false);
});
test('Grok indexes the full official Build catalog without unrelated API pages',async t=>{
 const calls=[];
 const result=await refreshDocumentation({directory:fixture(t),agent:'grok',fetchImpl:async url=>{calls.push(String(url));return new Response(String(url).endsWith('llms.txt')?'# Official index\nhttps://docs.x.ai/build/cli/reference.md\nhttps://docs.x.ai/build/settings.md\nhttps://docs.x.ai/developers/api.md\n':'# Actual official reference\nContent for this Build documentation page.');}});
 assert.equal(result.ok,true);assert.equal(calls.length,3);assert.ok(calls.every(url=>!url.includes('/developers/')));
});
test('dispatch bootstrap executes Total Recall context and complete inventories before returning task text',async t=>{
 const root=fixture(t);fs.writeFileSync(path.join(root,'total-recall'),'#!/bin/sh\nexit 0\n',{mode:0o700});
 const calls=[];
 const probe=async(_binary,args)=>{
  calls.push(args);
  const output=args[0]==='context'?{ready:true,context:'REQUIRED RULE'}:args[0]==='plugin'?{commands:['every-plugin-command']}:args[0]==='composable-cli'?{commands:['every-composed-command']}:{ok:true,directory:root};
  return {exitCode:0,stdout:args[0]==='--help'?'FULL CLI HELP':JSON.stringify(output)};
 };
 const prompt=await totalRecallBootstrap({agent:'codex',cwd:root,prompt:'TASK',permissions:{write:true}},{probe,env:{PATH:root,HOME:root}});
 for(const value of ['REQUIRED RULE','FULL CLI HELP','every-plugin-command','every-composed-command','TASK'])assert.ok(prompt.includes(value));
 assert.deepEqual(calls.map(args=>args[0]),['cli-agents','context','--help','plugin','composable-cli','cli-agents']);
 await assert.rejects(totalRecallBootstrap({agent:'codex',cwd:root,prompt:'TASK'},{probe:async()=>({exitCode:0,stdout:'{"ready":false}'}),env:{PATH:root,HOME:root}}),/not ready/);
});
test('unified runtime management passes literal args and refuses secret-bearing argv',async t=>{
 const root=fixture(t);fs.writeFileSync(path.join(root,'hermes'),'#!/bin/sh\nexit 0\n',{mode:0o700});let call;
 const result=await manageRuntime('hermes',['gateway','status'],{env:{PATH:root,HOME:root},probe:async(binary,args)=>{call={binary,args};return {exitCode:0,stdout:'service status'};}});
 assert.equal(result.ok,true);assert.deepEqual(call.args,['gateway','status']);
 await assert.rejects(manageRuntime('hermes',['--api-key','private']),/Credential/);
});
test('setup configures agent instruction surfaces through Total Recall connect and tolerates unsupported clients',async t=>{
 const root=fixture(t);fs.writeFileSync(path.join(root,'total-recall'),'#!/bin/sh\nexit 0\n',{mode:0o700});fs.writeFileSync(path.join(root,'package.json'),'{"name":"total-recall-brain"}');const calls=[];
 const result=await setupIntegrations({cwd:root,env:{PATH:root,HOME:root,TR_PACKAGE_ROOT:root},probe:async(_binary,args)=>{
   calls.push(args);
   if(args[1]==='muse') return {exitCode:1,stdout:'Unknown client: muse\n'};
   return {exitCode:0};
 }});
 assert.equal(result.ok,true);
 assert.deepEqual(result.connected,['claude-code','codex','antigravity','cursor','dsh','grok','pi','hermes']);
});
