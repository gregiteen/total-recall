import { describe, it, expect, vi, afterAll } from 'vitest';
vi.mock('./required-plugins.mjs', () => ({ inspectRequiredPlugins: vi.fn(() => ({ status: 'ready', errors: [] })) }));
import { inspectRequiredPlugins } from './required-plugins.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { startupHealth, processIdentity, observeDaemon, healthVerdict, appVerdict, runBounded, verifyListener } from './startup-health.mjs';
const health = { status: 'healthy', version: '1', uptime_seconds: 1, embedding_coverage: 1, daemon: 'running', vfs: { exists: true, skill_exists: true } };
const run = async () => ({ code: 0, output: 'SSSS tooling', reason: null });
const fetchGood = async url => url.pathname === '/health' ? new Response(JSON.stringify(health)) : new Response('# Instructions');
describe('startup health truth and boundaries', () => {
  it('identifies a real child as its own entry and a foreign installation for this daemon', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-real-'));
    let child;
    try {
      const entry = path.join(dir, 'src/core/daemon-loop.mjs');
      fs.mkdirSync(path.dirname(entry), { recursive: true });
      fs.writeFileSync(entry, "console.log('ready'); setInterval(() => {}, 1000);");
      child = spawn(process.execPath, ['src/core/daemon-loop.mjs'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
      await once(child.stdout, 'data');
      const pidFile = path.join(dir, 'daemon.pid');
      fs.writeFileSync(pidFile, String(child.pid));
      expect(processIdentity(pidFile, entry)).toMatchObject({ status: 'running', pid: child.pid, entry: fs.realpathSync(entry) });
      expect(observeDaemon(dir)).toMatchObject({ status: 'conflict', reason: 'foreign-pid', entry: fs.realpathSync(entry) });
    } finally {
      if (child && child.exitCode === null) { const closed = once(child, 'close'); child.kill(); await closed; }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('fails readiness when required auth is missing despite healthy services', async () => {
    inspectRequiredPlugins.mockReturnValueOnce({ status: 'failed', errors: ['auth missing'] });
    const report = await startupHealth({ brainDir: '/missing', brainUrl: 'https://example.invalid', identity: () => ({ status: 'running' }), fetchImpl: fetchGood, run });
    expect(report.ready).toBe(false);
    expect(report.required_plugins.errors).toEqual(['auth missing']);
  });
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
  describe('process identity resolves relative launch-agent paths', () => {
    // A launch agent starts `node src/server/index.mjs` with WorkingDirectory
    // set. The recorded command carries no absolute path, and resolving it
    // against the caller's cwd made readiness depend on where the operator
    // stood: the same healthy server read as `server-process-unverified` from
    // any directory other than the install root.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'startup-identity-'));
    const pidFile = path.join(root, 'server.pid');
    const script = path.join(root, 'src', 'server', 'index.mjs');
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(script, '// entry');
    fs.writeFileSync(pidFile, '4321');
    const base = { alive: () => true };
    afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

    it('recognizes its own entry when the command path is relative', () => {
      const id = processIdentity(pidFile, script, { ...base, command: () => 'node src/server/index.mjs', cwd: () => root });
      expect(id).toMatchObject({ status: 'running', pid: 4321 });
    });
    it('refuses a second installation reached by the same relative form', () => {
      // A real second install has the same entry layout, so the relative path
      // resolves — to the wrong root. That is a foreign install, not an
      // unresolvable path, and must not be excused by the entry-tail fallback.
      const other = fs.mkdtempSync(path.join(os.tmpdir(), 'startup-other-'));
      try {
        const otherScript = path.join(other, 'src', 'server', 'index.mjs');
        fs.mkdirSync(path.dirname(otherScript), { recursive: true });
        fs.writeFileSync(otherScript, '// other install');
        const id = processIdentity(pidFile, script, { ...base, command: () => 'node src/server/index.mjs', cwd: () => other });
        expect(id.status).toBe('conflict');
        expect(id.reason).toBe('foreign-pid');
      } finally { fs.rmSync(other, { recursive: true, force: true }); }
    });
    it('matches an absolute entry path without consulting cwd', () => {
      const id = processIdentity(pidFile, script, { ...base, command: () => `node ${script}`, cwd: () => '/nonexistent' });
      expect(id.status).toBe('running');
    });
    it('refuses a suffix match when no root resolves', () => {
      const id = processIdentity(pidFile, script, { ...base, command: () => 'node /opt/other/install/src/server/index.mjs', cwd: () => null });
      expect(id).toMatchObject({ status: 'unknown', reason: 'process-entry-unavailable' });
    });
    it('does not resolve a relative entry against the caller cwd when process cwd is unavailable', () => {
      expect(processIdentity(pidFile, script, { ...base, command: () => 'node src/server/index.mjs', cwd: () => null }))
        .toMatchObject({ status: 'unknown', reason: 'process-entry-unavailable' });
    });
    it('retains uncertain liveness rather than treating permission denial as stopped', () => {
      expect(processIdentity(pidFile, script, { alive: () => { throw new Error('EPERM'); } }))
        .toMatchObject({ status: 'unknown', reason: 'process-liveness-unavailable' });
    });
    it('never reports running when the process is gone', () => {
      expect(processIdentity(pidFile, script, { alive: () => false, command: () => 'node src/server/index.mjs' })).toEqual({ status: 'stopped' });
    });
  });
  it('startup consumes the same daemon observation as lifecycle and preserves identity details', async () => {
    const identity = (file, expected) => file.endsWith('daemon.pid')
      ? { status: 'conflict', reason: 'foreign-pid', pid: 123, entry: '/other/src/core/daemon-loop.mjs' }
      : { status: 'running', pid: 456 };
    const expected = observeDaemon('/missing', { identity });
    const report = await startupHealth({ brainDir: '/missing', brainUrl: 'http://localhost:3000',
      identity, fetchImpl: fetchGood, listener: async () => true, run, ensure: true });
    expect(report.daemon).toEqual(expected);
    expect(report.ready).toBe(false);
    expect(report.actions).toEqual([]);
    expect(expected.expected_entry).toMatch(/src\/core\/daemon-loop\.mjs$/);
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
