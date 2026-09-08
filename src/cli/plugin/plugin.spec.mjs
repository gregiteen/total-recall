import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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

  it('displays the plugin catalog', async () => {
    await run(['plugin', 'catalog']);
    const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Plugin Catalog & Discovery');
    expect(output).toContain('Scientific Frontiers Engine');
  });

  it('searches the plugin catalog with a query', async () => {
    await run(['plugin', 'search', 'curiosity']);
    const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Scientific Frontiers Engine');
  });

  it('returns JSON catalog results when requested', async () => {
    await run(['plugin', 'search', '--json']);
    const output = consoleLogSpy.mock.calls[0]?.[0];
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.some(p => p.id === 'scientific-frontiers')).toBe(true);
  });

  it('scaffolds a new plugin using createPlugin', async () => {
    const tmpDir = path.join(os.tmpdir(), `tr-test-plugin-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

    try {
      await run(['plugin', 'create', 'test-widget', '--name', 'Test Widget', '--with-cli', '--with-generator']);
      const manifestPath = path.join(tmpDir, '.agent', 'plugins', 'test-widget', 'plugin.json');
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.id).toBe('test-widget');
      expect(manifest.name).toBe('Test Widget');
      expect(manifest.cli.command).toBe('test-widget');
      expect(fs.existsSync(path.join(tmpDir, '.agent', 'plugins', 'test-widget', 'cli.mjs'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.agent', 'plugins', 'test-widget', 'generator.mjs'))).toBe(true);
    } finally {
      cwdSpy.mockRestore();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

