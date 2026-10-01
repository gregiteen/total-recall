// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const fixture=vi.hoisted(()=>({root:'',allow:true}));
vi.mock('../auth.mjs',()=>({requireAuth:(req,res,next)=>{req.auth={};next();},requireScope:()=> (req,res,next)=>fixture.allow?next():res.status(403).json({error:'denied'})}));
vi.mock('./_shared.mjs',()=>({INSTRUCTIONS:'unused',ROOT:'unused',resolveVaultFromQuery:(req,opts)=>{if(req.query.brain==='project:missing'&&opts.strict)throw Object.assign(new Error('missing'),{status:404});return path.join(fixture.root,'memory-vault');},pathsForVault:()=>({instructionsFile:path.join(fixture.root,'INSTRUCTIONS.md'),skillsDir:path.join(fixture.root,'.agent/skills')}),serverError:(res,err)=>res.status(err.status||500).json({error:'unavailable'})}));
import router from './instructions.mjs';
describe('selected instruction isolation',()=>{
 let server,base;
 beforeEach(async()=>{fixture.allow=true;fixture.root=fs.mkdtempSync(path.join(os.tmpdir(),'tr-instructions-'));fs.writeFileSync(path.join(fixture.root,'INSTRUCTIONS.md'),'Selected bootstrap');const app=express();app.use(router);server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${server.address().port}`;});
 afterEach(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(fixture.root,{recursive:true,force:true});});
 it('returns selected content and explicit identity',async()=>{const res=await fetch(base+'/api/instructions?brain=project:fixture');expect(res.status).toBe(200);expect(res.headers.get('x-total-recall-brain')).toBe('project:fixture');expect(await res.text()).toBe('Selected bootstrap');});
 it('never falls back for an unavailable selected brain',async()=>expect((await fetch(base+'/api/instructions?brain=project:missing')).status).toBe(404));
 it('preserves denial for missing instruction scope',async()=>{fixture.allow=false;expect((await fetch(base+'/api/instructions?brain=project:fixture')).status).toBe(403);});
});
