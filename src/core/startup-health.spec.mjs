import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startupHealth, processIdentity, healthVerdict, appVerdict, runBounded, verifyListener } from './startup-health.mjs';
const health = { status: 'healthy', version: '1', uptime_seconds: 1, embedding_coverage: 1, daemon: 'running', vfs: { exists: true, skill_exists: true } };
const run = async () => ({ code: 0, output: 'SSSS tooling', reason: null });
const fetchGood = async url => url.pathname === '/health' ? new Response(JSON.stringify(health)) : new Response('# Instructions');
describe('startup health truth and boundaries', () => {
  it('retries a transient transport failure without restarting a running service', async () => {
    let healthCalls = 0, instructionCalls = 0;
    const report = await startupHealth({ brainDir: '/missing', brainUrl: 'http://localhost:3000', ensure: true,
      identity: () => ({ status: 'running', pid: 123 }), listener: async () => true, run,
      fetchImpl: async url => {
        if (url.pathname === '/health' && ++healthCalls === 1) throw new Error('transient transport');
        if (url.pathname === '/api/instructions' && ++instructionCalls === 1) throw new Error('transient transport');
        return fetchGood(url);
      } });
    expect(report.ready).toBe(true); expect(healthCalls).toBe(2); expect(instructionCalls).toBe(2);
    expect(report.actions).toEqual([]);
  });
  it('does not retry an authorization denial or conceal persistent transport failures', async () => {
    let calls = 0;
    const denied = await startupHealth({ brainDir: '/missing', brainUrl: 'https://example.invalid', run,
      fetchImpl: async url => { calls++; return url.pathname === '/health' ? new Response(JSON.stringify(health)) : new Response('', {status:403}); } });
    expect(calls).toBe(2); expect(denied.brain.reason).toBe('instructions-http-403'); expect(denied.ready).toBe(false);
    calls = 0;
    const offline = await startupHealth({ brainDir: '/missing', brainUrl: 'https://example.invalid', run,
      fetchImpl: async () => { calls++; throw new Error('offline'); } });
    expect(calls).toBe(4); expect(offline.ready).toBe(false); expect(offline.server.status).toBe('offline');
  });
  it('rejects unrelated HTTP 200 and app malformed or soft failure', () => {
    expect(healthVerdict({ status: 'healthy' }).status).toBe('unknown');
    expect(appVerdict({ code: 0, output: '{"ok":false,"status":"ready"}' }).status).toBe('failed');
    expect(appVerdict({ code: 0, output: 'garbage' }).status).toBe('unknown');
  });
  it('checks auth separately and never starts during read-only check', async () => {
    let calls = 0;
    const report = await startupHealth({ listener: async () => true, brainDir: '/missing', brainUrl: 'http://localhost:3000', identity: () => ({ status: 'running' }), run: async (...args) => { calls++; return run(...args); }, fetchImpl: async url => url.pathname === '/health' ? new Response(JSON.stringify(health)) : new Response('', { status: 403 }) });
    expect(report.server.status).toBe('ready'); expect(report.brain.reason).toBe('instructions-http-403'); expect(report.ready).toBe(false); expect(calls).toBe(1); expect(report.actions).toEqual([]);
  });
  it('cannot green recycled PID or unavailable tooling', async () => {
    const report = await startupHealth({ listener: async () => true, brainDir: '/missing', brainUrl: 'http://localhost:3000', identity: () => ({ status: 'conflict' }), run: async () => ({ code: null, reason: 'spawn-failed', output: '' }), fetchImpl: fetchGood, ensure: true });
    expect(report.server.status).toBe('conflict'); expect(report.ready).toBe(false); expect(report.actions).toEqual([]);
  });
  it('does not run undeclared app or mutate remote services', async () => {
    const calls = [];
    const report = await startupHealth({ listener: async () => true, brainDir: '/missing', cwd: '/missing', brainUrl: 'https://example.invalid', ensure: true, appCheck: '../escape', appStart: 'start', identity: () => ({ status: 'stopped' }), fetchImpl: fetchGood, run: async (...args) => { calls.push(args); return run(); } });
    expect(report.app.status).toBe('not-configured'); expect(calls.length).toBe(1); expect(report.actions).toEqual([]);
  });
  it('reports undeclared app separately from observed shared readiness', async () => {
    const report = await startupHealth({ listener: async () => true, brainDir: '/missing', brainUrl: 'https://example.invalid', identity: () => ({ status: 'running' }), fetchImpl: fetchGood, run });
    expect(report.ready).toBe(true); expect(report.ready_scope).toBe('shared-runtime-only'); expect(report.app.status).toBe('not-declared');
  });
  it('managed start acceptance must be followed by observed readiness', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'startup-manager-'));
    try {
      fs.mkdirSync(path.join(home, 'Library', 'LaunchAgents'), { recursive: true });
      fs.writeFileSync(path.join(home, 'Library', 'LaunchAgents', 'com.totalrecall.server.plist'), 'existing registered unit fixture');
      let started = false;
      const report = await startupHealth({ listener: async () => true, home, platform: 'darwin', brainDir: '/missing', brainUrl: 'http://localhost:3000', ensure: true, identity: () => ({ status: started ? 'running' : 'not-started', pid: 123 }),
        fetchImpl: async url => { if (!started) throw new Error('offline'); return fetchGood(url); },
        run: async binary => { if (binary === 'launchctl') started = true; return run(); } });
      expect(report.actions[0].accepted).toBe(true); expect(report.server.status).toBe('ready'); expect(report.brain.status).toBe('ready'); expect(report.ready).toBe(true);
    } finally { fs.rmSync(home, { recursive: true }); }
  });
  it('offline health with live or unknown server PID never starts manager', async () => {
    for (const status of ['running','unknown','conflict']) {
      const report = await startupHealth({ brainDir:'/missing',brainUrl:'http://localhost:3000',ensure:true,identity:()=>({status}),fetchImpl:async()=>{throw new Error('offline');},run });
      expect(report.actions).toEqual([]); expect(report.ready).toBe(false);
    }
  });
  it('remote daemon comes from remote health, never local PID', async () => {
    const report = await startupHealth({brainDir:'/missing',brainUrl:'https://example.invalid',identity:()=>({status:'running'}),fetchImpl:async url=>url.pathname==='/health'?new Response(JSON.stringify({...health,daemon:'dead'})):new Response('# Instructions'),run});
    expect(report.daemon).toMatchObject({status:'stopped',source:'remote-health'}); expect(report.ready).toBe(false);
  });
  it('essential VFS and actual listening PID must be verified', async () => {
    expect(healthVerdict({...health,vfs:{exists:false,skill_exists:true}}).status).toBe('degraded');
    expect(await verifyListener(123,new URL('http://localhost:3000'),{run:async()=>({code:0,output:'p456',reason:null})})).toBe(false);
    expect(await verifyListener(123,new URL('http://localhost:3000'),{run:async()=>({code:0,output:'p123\n',reason:null})})).toBe(true);
  });
  it('builtin-colliding declared command is rejected without dispatch', async () => {
    const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'startup-app-'));
    try { fs.mkdirSync(path.join(cwd,'.agent','commands'),{recursive:true});fs.writeFileSync(path.join(cwd,'.agent','commands','start.mjs'),'export default()=>{}');
      const report=await startupHealth({cwd,brainDir:'/missing',brainUrl:'https://example.invalid',fetchImpl:fetchGood,run,appCheck:'start',appStart:'start',ensure:true});
      expect(report.app.status).toBe('not-configured');expect(report.actions).toEqual([]);
    } finally {fs.rmSync(cwd,{recursive:true});}
  });
  it('uses explicitly present repo SSSS launcher without download', async () => {
    const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'startup-ssss-'));
    const calls=[];
    try {fs.writeFileSync(path.join(cwd,'ssss'),'#!/bin/sh\n', {mode:0o755});
      await startupHealth({cwd,brainDir:'/missing',run:async(binary,args)=>{calls.push([binary,args]);return run();}});
      expect(calls[0]).toEqual([path.join(cwd,'ssss'),['--help']]);
    } finally {fs.rmSync(cwd,{recursive:true});}
  });
  it('PID identity never mistakes live foreign process for daemon', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'startup-test-'));
    try { const file = path.join(dir, 'pid'); fs.writeFileSync(file, '123'); expect(processIdentity(file, 'daemon-loop.mjs', { alive: () => true, command: () => 'unrelated' }).status).toBe('conflict'); expect(processIdentity(file, 'daemon-loop.mjs', { alive: () => true, command: () => null }).status).toBe('unknown'); } finally { fs.rmSync(dir, { recursive: true }); }
  });
  it('handles spawn failure and bounds real synthetic child lifetime', async () => {
    expect((await runBounded('definitely-missing-startup-binary', [])).reason).toBe('spawn-failed');
    expect((await runBounded(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 20 })).reason).toBe('timeout');
  });
});
