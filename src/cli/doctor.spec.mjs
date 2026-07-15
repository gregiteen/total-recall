/**
 * Unit tests for Total Recall doctor CLI
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import child_process from 'node:child_process';
import doctor from './doctor.mjs';

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
 
    await doctor();
 
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
});
