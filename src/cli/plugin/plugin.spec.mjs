import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listPlugins } from './list.mjs';
import { run } from './index.mjs';

describe('CLI Plugin Manager', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('prints help message on --help', async () => {
    await run(['plugin', '--help']);
    const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Total Recall — Plugin Management System');
    expect(output).toContain('install <path|git-url>');
    expect(output).toContain('list');
  });

  it('lists plugins in JSON format with --json', async () => {
    await listPlugins(['--json']);
    const output = consoleLogSpy.mock.calls[0]?.[0];
    expect(output).toBeDefined();
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('lists plugins in table format', async () => {
    await listPlugins([]);
    const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Total Recall — Installed Plugins');
  });
});
