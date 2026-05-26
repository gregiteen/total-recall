/**
 * Unit tests for Total Recall status CLI
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import statusCmd from './status.mjs';

describe('status command', () => {
  let logSpy;
  let existsSyncSpy;
  let readFileSyncSpy;
  let fetchSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // Default mock behavior for file existence
    existsSyncSpy = vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (p.includes('brain.json') || p.includes('wizard-config.json') || p.includes('cloudflared.pid') || p.includes('INSTRUCTIONS.md')) {
        return true;
      }
      return false;
    });

    // Default mock behavior for file reading
    readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (p.includes('brain.json')) {
        return JSON.stringify({ url: 'http://localhost:3000', token: 'test-token' });
      }
      if (p.includes('wizard-config.json')) {
        return JSON.stringify({
          'deploy-mode': 'quick-tunnel',
          'cfg-dash-url': 'https://my-tunnel.trycloudflare.com/dashboard'
        });
      }
      if (p.includes('cloudflared.pid')) {
        return '45678';
      }
      if (p.includes('INSTRUCTIONS.md')) {
        return 'Mock instructions content';
      }
      return '';
    });

    // Mock live processes and health check fetch requests
    vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid === 45678) return true;
      throw new Error('Process not found');
    });

    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (url.includes('/health')) {
        return {
          ok: true,
          json: async () => ({ status: 'healthy', uptime_seconds: 120 })
        };
      }
      if (url.includes('/api/instructions')) {
        return {
          ok: true,
          json: async () => ({ sha256: 'mock-sha', bytes: 100, modified: '2026-05-25T00:00:00Z' })
        };
      }
      return { ok: false };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly reports status details including server health, deploy mode, tunnel PID, and daemon state', async () => {
    // Override fs.statSync to return mock metadata
    vi.spyOn(fs, 'statSync').mockReturnValue({
      size: 100,
      mtime: new Date('2026-05-25T00:00:00Z'),
      mtimeMs: 12345678
    });

    await statusCmd([]);

    const logs = logSpy.mock.calls.map(args => args[0]).join('\n');
    
    expect(logs).toContain('Total Recall — Status');
    expect(logs).toContain('Brain Server:     🟢 Online');
    expect(logs).toContain('Deploy Mode:      quick-tunnel');
    expect(logs).toContain('Dashboard UI:     https://my-tunnel.trycloudflare.com/dashboard');
    expect(logs).toContain('Tunnel Process:   🟢 Active (PID 45678)');
  });

  it('supports JSON output formatting', async () => {
    vi.spyOn(fs, 'statSync').mockReturnValue({
      size: 100,
      mtime: new Date('2026-05-25T00:00:00Z'),
      mtimeMs: 12345678
    });

    await statusCmd(['--json']);

    expect(logSpy).toHaveBeenCalled();
    const jsonOutput = JSON.parse(logSpy.mock.calls[0][0]);
    
    expect(jsonOutput.server).toEqual({
      status: 'healthy',
      uptime_seconds: 120
    });
    expect(jsonOutput.deploy).toEqual({
      mode: 'quick-tunnel',
      dashboard_url: 'https://my-tunnel.trycloudflare.com/dashboard',
      tunnel_pid: 45678,
      tunnel_alive: true
    });
  });
});
