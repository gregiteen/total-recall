// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectPluginSource, importPluginSource, exportImportedPlugin, readImportedPlugin } from './plugin-import.mjs';

const roots = [];
function temp() { const p = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-import-')); roots.push(p); return p; }
function fixture(file, value, extra = {}) {
  const root = temp();
  for (const [name, content] of Object.entries({ [file]: typeof value === 'string' ? value : JSON.stringify(value), ...extra })) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  }
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const formats = [
  ['native', 'plugin.json', { id: 'demo', name: 'Demo', version: '1.0.0', description: 'Test', commands: [] }],
  ['agent-plugin', 'plugin.json', { name: 'demo', version: '1.0.0', extensions: { 'com.openai': { apps: './.app.json' } }, unknown: { a: [1, 2] } }],
  ['claude-plugin', '.claude-plugin/plugin.json', { name: 'demo', version: '1.0.0' }],
  ['codex-plugin', '.codex-plugin/plugin.json', { name: 'demo', skills: './skills/' }],
  ['mcp', 'mcp.json', { mcpServers: { demo: { type: 'stdio', command: 'node', args: ['server.mjs'] } } }],
  ['openapi', 'openapi.yaml', 'openapi: 3.1.0\ninfo:\n  title: Demo\n  version: 1.0.0\npaths: {}\n'],
  ['vscode', 'package.json', { name: 'demo', version: '1.0.0', engines: { vscode: '^1.0.0' }, contributes: { commands: [{ command: 'demo.run', title: 'Run' }] } }],
  ['npm', 'package.json', { name: 'demo', version: '1.0.0', bin: { demo: 'bin.mjs' }, unknown: [1] }],
  ['python', 'pyproject.toml', '[project]\nname = "demo"\nversion = "1.0.0"\n[project.scripts]\ndemo = "demo:main"\n'],
  ['generic', 'extension.json', { name: 'demo', customHost: { unknown: [true, 'x'] } }],
];

describe('portable plugin imports', () => {
  it.each(formats)('%s preserves all source bytes through SSSS and export', async (format, file, value) => {
    const source = fixture(file, value, { 'assets/data.bin': Buffer.from([0, 255, 2]), '.mcp.json': '{"mcpServers":{}}' });
    const options = format === 'generic' ? { format } : {};
    const inspected = inspectPluginSource(source, options);
    expect(inspected.format).toBe(format);
    expect(inspected.assets.some(f => f.path === '.mcp.json')).toBe(true);
    const output = path.join(temp(), 'vault');
    expect((await importPluginSource(source, { ...options, output, dryRun: true })).committed).toBe(0);
    expect(fs.existsSync(output)).toBe(false);
    const result = await importPluginSource(source, { ...options, output });
    expect(result.ok).toBe(true);
    expect(readImportedPlugin(output).format).toBe(format);
    const exported = exportImportedPlugin(output);
    expect(exported.manifest.primitive_inventory.asset).toBe(1);
    const second = path.join(temp(), 'roundtrip');
    const bundleFile = path.join(temp(), 'source.ucw.json');
    fs.writeFileSync(bundleFile, JSON.stringify(exported));
    await importPluginSource(bundleFile, { output: second });
    expect(readImportedPlugin(second).assets).toEqual(inspected.assets);
    expect(readImportedPlugin(second).metadata).toEqual(inspected.metadata);
  });

  it.each(formats)('%s rejects a malformed or mismatched declaration', (format, file) => {
    const source = fixture(file, file.endsWith('.toml') ? '[project\n' : '{bad json');
    expect(() => inspectPluginSource(source, { format })).toThrow();
  });

  it('requires marketplace selection and confines selected local sources', async () => {
    const source = fixture('.claude-plugin/marketplace.json', { name: 'market', owner: { name: 'Owner' }, plugins: [{ name: 'demo', source: './plugins/demo' }] }, {
      'plugins/demo/.claude-plugin/plugin.json': '{"name":"demo"}',
    });
    expect(() => inspectPluginSource(source)).toThrow(/select/i);
    const inspected = inspectPluginSource(source, { select: 'demo' });
    expect(inspected.format).toBe('claude-plugin');
    expect(inspected.provenance.marketplace.entry.name).toBe('demo');
    const output = path.join(temp(), 'market');
    await importPluginSource(source, { select: 'demo', output });
    expect(readImportedPlugin(output).provenance.marketplace.entry.name).toBe('demo');
    fs.writeFileSync(path.join(source, '.claude-plugin/marketplace.json'), JSON.stringify({ name: 'market', plugins: [{ name: 'escape', source: '../escape' }] }));
    expect(() => inspectPluginSource(source, { select: 'escape' })).toThrow(/path|escape/i);
  });

  it('rejects literals without leaking credentials in errors and leaves output absent', async () => {
    const source = fixture('mcp.json', { mcpServers: { demo: { url: 'https://example.com', headers: { Authorization: 'Bearer private-test-token' } } } });
    const output = path.join(temp(), 'vault');
    await expect(importPluginSource(source, { output })).rejects.toThrow(/credential/i);
    expect(fs.existsSync(output)).toBe(false);
    try { inspectPluginSource(source); } catch (error) { expect(error.message).not.toContain('private-test-token'); }
  });

  it('rejects links, ambiguous manifests and output collisions', async () => {
    const source = fixture('plugin.json', { name: 'demo' });
    fs.symlinkSync('/etc/hosts', path.join(source, 'escape'));
    expect(() => inspectPluginSource(source)).toThrow(/link/i);
    fs.unlinkSync(path.join(source, 'escape'));
    fs.mkdirSync(path.join(source, '.claude-plugin'));
    fs.writeFileSync(path.join(source, '.claude-plugin/plugin.json'), '{"name":"other"}');
    expect(() => inspectPluginSource(source)).toThrow(/ambiguous/i);
    const output = temp();
    await expect(importPluginSource(source, { format: 'agent-plugin', output })).rejects.toThrow();
  });
});
