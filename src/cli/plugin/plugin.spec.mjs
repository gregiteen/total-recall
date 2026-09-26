import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { listPlugins } from './list.mjs';
import { run } from './index.mjs';

// Never touch the real mesh from a unit test.
vi.mock('../../core/plugin-peers.mjs', () => ({
  listPeerPlugins: vi.fn(async () => ({
    mesh: { available: true, configured: true },
    peers: [{ hostname: 'mac-mini', ip: '100.64.0.2', status: 'ok', plugins: [
      { id: 'reading-list', name: 'Reading List', version: '1.0.0', description: 'Track what to read', use_cases: ['research'], sha256: 'a'.repeat(64), file_count: 2, size_bytes: 100 }
    ] }]
  })),
}));

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
    expect(output).toContain('install <source>');
    expect(output).toContain('peer:<host>/<id>');
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

  it('lists bundled plugins without any ratings or counts', async () => {
    await run(['plugin', 'available']);
    const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Bundled Plugins');
    expect(output).toContain('System Monitor');
    expect(output).not.toMatch(/★|rating|reviews|installs|verified/i);
  });

  it('filters bundled plugins by use case', async () => {
    await run(['plugin', 'available', '--use-case', 'operations', '--json']);
    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0]);
    expect(parsed.map(p => p.id)).toEqual(['system-monitor']);
  });

  it('lists plugins shared by mesh peers with install sources', async () => {
    await run(['plugin', 'peers']);
    const output = consoleLogSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('mac-mini');
    expect(output).toContain('peer:mac-mini/reading-list');
  });

  it('searches bundled plugins and mesh peers together', async () => {
    await run(['plugin', 'search', '--use-case', 'research', '--json']);
    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0]);
    expect(parsed.bundled).toEqual([]);
    expect(parsed.peers[0].source).toBe('peer:mac-mini/reading-list');
  });

  it('scaffolds a new plugin using createPlugin', async () => {
    const tmpDir = path.join(os.tmpdir(), `tr-test-plugin-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

    try {
      await run(['plugin', 'create', 'test-widget', '--name', 'Test Widget', '--use-case', 'research', '--with-cli', '--with-generator']);
      const pluginDir = path.join(tmpDir, '.agent', 'skills', 'total-recall', 'plugins', 'test-widget');
      const manifestPath = path.join(pluginDir, 'plugin.json');
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.id).toBe('test-widget');
      expect(manifest.name).toBe('Test Widget');
      expect(manifest.cli.command).toBe('test-widget');
      expect(manifest.use_cases).toEqual(['research']);
      expect(manifest.tasks).toBeUndefined();
      expect(fs.existsSync(path.join(pluginDir, 'cli.mjs'))).toBe(true);
      expect(fs.existsSync(path.join(pluginDir, 'generator.mjs'))).toBe(true);
    } finally {
      cwdSpy.mockRestore();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

