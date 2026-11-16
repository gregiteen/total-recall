/**
 * Unit tests for Total Recall doctor CLI
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import child_process from 'node:child_process';
import * as startupHealth from '../core/startup-health.mjs';
import doctor, { isOwnedServerPort } from './doctor.mjs';
import { inspectRequiredPlugins } from '../core/required-plugins.mjs';
vi.mock('../core/required-plugins.mjs', () => ({ inspectRequiredPlugins: vi.fn(() => ({ status: 'ready', errors: [] })) }));
vi.mock('../core/plugin-runtime.mjs', () => ({ loadPluginModule: vi.fn(async (_owner, module) => module === 'reasoning-runtime' ? { loadRuntimeConfig: () => ({ agents: [{ name: 'claude', binary: 'claude' }] }) } : module === 'configuration' ? { runtimeConfiguration: () => ({}) } : module === 'runtime-credentials' ? { runtimeCredentials: () => ({ google_api_key: 'auth-fixture' }) } : { defaultBrainDir: () => '/fixture/auth' }) }));

describe('doctor command', () => {
  let logSpy, errorSpy;
  let totalMemSpy, cpusSpy;
  let execSyncSpy, execFileSyncSpy;
  let origEnv;

  beforeEach(() => {
    origEnv = { ...process.env };
    process.env.GOOGLE_API_KEY = 'mock-key';
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    totalMemSpy = vi.spyOn(os, 'totalmem').mockReturnValue(16 * 1024 * 1024 * 1024); // 16GB default
    cpusSpy = vi.spyOn(os, 'cpus').mockReturnValue(new Array(8).fill({}));
    execFileSyncSpy = vi.spyOn(child_process, 'execFileSync').mockImplementation((cmd, args) => {
      return '';
    });
    execSyncSpy = vi.spyOn(child_process, 'execSync').mockImplementation((cmd) => {
      if (cmd.includes('command -v')) {
        return '/usr/bin/' + cmd.split(' ').pop();
      }
      if (cmd.includes('curl') && cmd.includes('11434')) {
        return JSON.stringify({ models: [{ name: 'gemma4:26b' }, { name: 'nomic-embed-text' }] });
      }
      return '';
    });
  });

  afterEach(() => {
    process.env = origEnv;
    vi.restoreAllMocks();
  });

  it('runs successfully when all checks pass', async () => {
    // Mock net.createServer to succeed on port checking
    const mockServer = {
      once: vi.fn().mockImplementation((event, callback) => {
        if (event === 'listening') {
          // Trigger listening to simulate free port
          setTimeout(() => callback(), 0);
        }
      }),
      listen: vi.fn(),
      close: vi.fn().mockImplementation((callback) => callback && callback()),
    };
    vi.spyOn(net, 'createServer').mockReturnValue(mockServer);

    await doctor();

    // Verify exit code is not set to 1
    expect(process.exitCode).toBeUndefined();

    // Check that we logged hardware, software, and summary info
    const logs = logSpy.mock.calls.map(args => args[0]).join('\n');
    expect(logs).toContain('HARDWARE COMPATIBILITY DIAGNOSTICS');
    expect(logs).toContain('SOFTWARE DEPENDENCY CHECK');
    expect(logs).toContain('NETWORKING PORT AVAILABILITY');
    expect(logs).toContain('Embedding credentials configured in auth: google_api_key');
    expect(logs).not.toContain('environment variable is configured');
    expect(logs).toContain('🎉 Diagnostics Passed! System is perfectly healthy.');
  });

  it('sets process.exitCode = 1 and reports failures when critical components are missing', async () => {
    // Force a RAM failure (under 2GB)
    totalMemSpy.mockReturnValue(1 * 1024 * 1024 * 1024);
 
    // Mock command missing
    execSyncSpy.mockImplementation((cmd) => {
      throw new Error('Command not found');
    });
    execFileSyncSpy.mockImplementation(() => {
      throw new Error('Command not found');
    });
 
    // Mock port taken
    vi.spyOn(startupHealth, 'processIdentity').mockReturnValue({ status: 'stopped' });
    const mockServer = {
      once: vi.fn().mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback({ code: 'EADDRINUSE' }), 0);
        }
      }),
      listen: vi.fn(),
      close: vi.fn(),
    };
    vi.spyOn(net, 'createServer').mockReturnValue(mockServer);
 
    // Clean exitCode state before run
    process.exitCode = undefined;
 
    // Nothing answers as Total Recall on the taken port, so it is another service's.
    await doctor([], { observe: async () => ({ status: 'none' }) });
 
    expect(process.exitCode).toBe(1);
 
    const logs = logSpy.mock.calls.map(args => args[0]).join('\n');
    expect(logs).toContain('System RAM (1 GB) is critically low');
    expect(logs).toContain('git     : MISSING');
    expect(logs).toContain('python3 : MISSING');
    expect(logs).toContain('CONFLICT — Already bound by another service');
    expect(logs).toContain('Diagnostics failed with');
    
    // Cleanup exitCode
    process.exitCode = undefined;
  });

  it('reports missing auth as a critical failure', async () => {
    inspectRequiredPlugins.mockReturnValueOnce({ status: 'failed', errors: ['Required auth plugin is missing'] });
    await doctor();
    expect(process.exitCode).toBe(1);
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Required auth plugin is missing');
    process.exitCode = undefined;
  });
});

describe('doctor checks the port this host\'s server is configured on', () => {
  let logSpy, origEnv, agentDir;
  const taken = () => vi.spyOn(net, 'createServer').mockImplementation(() => {
    const server = { close: vi.fn(), once: vi.fn((event, callback) => { server[event] = callback; }),
      listen: vi.fn(() => setTimeout(() => server.error({ code: 'EADDRINUSE' }), 0)) };
    return server;
  });
  beforeEach(() => {
    origEnv = { ...process.env };
    agentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-doctor-port-'));
    fs.mkdirSync(path.join(agentDir, 'skills', 'total-recall', 'config'), { recursive: true });
    process.env.AGENT_DIR = agentDir;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(child_process, 'execFileSync').mockReturnValue('');
    vi.spyOn(child_process, 'execSync').mockReturnValue('');
    vi.spyOn(startupHealth, 'processIdentity').mockReturnValue({ status: 'conflict', reason: 'foreign-pid' });
  });
  afterEach(() => {
    process.env = origEnv;
    process.exitCode = undefined;
    vi.restoreAllMocks();
    fs.rmSync(agentDir, { recursive: true, force: true });
  });
  const brain = (url) => fs.writeFileSync(path.join(agentDir, 'skills', 'total-recall', 'config', 'brain.json'), JSON.stringify({ url }));
  const logged = () => logSpy.mock.calls.map((c) => String(c[0])).join('\n');

  it('accepts a server from another install that answers /health on the configured port, and never fails port 3000', async () => {
    brain('http://127.0.0.1:3900');
    taken();
    const observe = vi.fn(async () => ({ status: 'running', url: 'http://127.0.0.1:3900', version: '9.9.9' }));
    await doctor([], { observe });
    expect(observe).toHaveBeenCalledWith({ url: 'http://127.0.0.1:3900', timeoutMs: 5000 });
    const out = logged();
    expect(out).toContain('Port 3900 : In use by the Total Recall server answering /health there (version 9.9.9)');
    expect(out).not.toContain('Port 3000');
    expect(out).not.toContain('CONFLICT');
  });

  it('still fails when something else holds the configured port', async () => {
    brain('http://127.0.0.1:3900');
    taken();
    await doctor([], { observe: async () => ({ status: 'unknown', reason: '/health answered HTTP 404' }) });
    expect(logged()).toContain('Port 3900 : CONFLICT — Already bound by another service');
    expect(process.exitCode).toBe(1);
  });

  it('needs no local port when the brain is served from another host', async () => {
    brain('https://brain.example');
    taken();
    const observe = vi.fn();
    await doctor([], { observe });
    expect(observe).not.toHaveBeenCalled();
    expect(logged()).toContain('this brain is served from another host');
    expect(logged()).not.toContain('CONFLICT');
  });
});

describe('doctor help', () => {
  it('prints help without running a diagnosis', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await doctor(['--help']);
      const printed = log.mock.calls.flat().join('\n');
      expect(printed).toContain('total-recall doctor');
      expect(printed).not.toContain('HARDWARE');
    } finally { log.mockRestore(); }
  });
});

describe('doctor listener ownership', () => {
  it('accepts only the canonical server PID actually listening on the occupied port', async () => {
    expect(await isOwnedServerPort(3000, { identity: () => ({status:'running',pid:123}), listener: async () => true })).toBe(true);
    expect(await isOwnedServerPort(3000, { identity: () => ({status:'running',pid:123}), listener: async () => false })).toBe(false);
    for (const status of ['unknown','conflict','stopped']) {
      const listener = vi.fn();
      expect(await isOwnedServerPort(3000, {identity:()=>({status}),listener})).toBe(false);
      expect(listener).not.toHaveBeenCalled();
    }
  });
});

describe('doctor reports instruction-surface freshness', () => {
  // Regression: a compiled surface that stopped being rewritten was invisible --
  // `compile` printed "Post-build verification passed: 0 drift" for months while
  // the file harnesses read stayed frozen, because drift detection compares the
  // vault against the jsonl indexes and never inspects the surface itself.
  let logSpy, origEnv;

  beforeEach(() => {
    origEnv = { ...process.env };
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(os, 'totalmem').mockReturnValue(16 * 1024 * 1024 * 1024);
    vi.spyOn(os, 'cpus').mockReturnValue(new Array(8).fill({}));
  });

  afterEach(() => {
    process.env = origEnv;
    vi.restoreAllMocks();
  });

  const logged = () => logSpy.mock.calls.map((c) => String(c[0])).join('\n');

  it('always reports a surface verdict, never silently omitting the section', async () => {
    // The test environment has no real brain, so the check may legitimately
    // report that freshness could not be established. What must never happen is
    // the section being absent, because that is exactly how a frozen surface
    // stayed invisible for months.
    await doctor();
    const out = logged();
    expect(out).toContain('INSTRUCTION SURFACE FRESHNESS');
    expect(out).toMatch(/Surface present:|No instruction surface at|No brain at|freshness could not be determined|freshness not verified/);
  });

  it('warns when no surface exists at the path harnesses read', async () => {
    const { instructionsFilePath } = await import('../core/config.mjs');
    const target = instructionsFilePath();
    const backup = fs.existsSync(target) ? fs.readFileSync(target) : null;
    try {
      if (backup) fs.rmSync(target);
      await doctor();
      // With no brain present a missing surface is expected and reported as
      // such; with a brain present the same condition is a real failure. Either
      // way the verdict must be stated rather than omitted.
      expect(logged()).toMatch(/No instruction surface at|No brain at|freshness not verified/);
    } finally {
      if (backup) fs.writeFileSync(target, backup);
    }
  });
});
