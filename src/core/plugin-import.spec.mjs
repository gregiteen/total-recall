// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createEngine } from '@ssss/cli';
import { packPlugin } from './plugin-bundle.mjs';
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
  ['native', 'plugin.json', { id: 'demo', name: 'Demo', version: '1.0.0', description: 'Test plugin', cli: { command: 'demo', handler: './cli.mjs' }, ui: { home: 'home', design_tokens: 'DESIGN.md', elements: [{ id: 'home', kind: 'panel', tag: 'demo-home', module: 'ui/home.js' }] } }],
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
  it('imports a real native bundle and verifies its declared handler bytes on read', async () => {
    const metadata = formats[0][2]; const source = fixture('plugin.json', metadata, { 'cli.mjs': 'export default () => 1' });
    const bundle = fixture('native.json', packPlugin(source, metadata));
    const output = path.join(temp(), 'vault');
    await importPluginSource(path.join(bundle, 'native.json'), { format: 'native', output });
    const restored = readImportedPlugin(output);
    expect(restored.metadata).toEqual(metadata);
    expect(Buffer.from(restored.assets.find(a => a.path === 'cli.mjs').data_b64, 'base64').toString()).toBe('export default () => 1');
  });
  it.each(formats)('%s preserves all source bytes through SSSS and export', async (format, file, value) => {
    const source = fixture(file, value, { 'assets/data.bin': Buffer.from([0, 255, 2]), '.mcp.json': '{"mcpServers":{}}', 'cli.mjs': 'export default 1', 'bin.mjs': 'console.log(1)' });
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

  it('replaces the entire Codex overlay with inline settings, preserving portable components and bytes through roundtrip', async () => {
    const source = fixture('plugin.json', { name: 'demo', version: '1.0.0', extensions: { 'com.openai': { interface: { displayName: 'Root' } } } }, {
      '.codex-plugin/plugin.json': JSON.stringify({ name: 'demo', interface: { displayName: 'Companion' }, skills: './extra/', mcpServers: './.mcp.json' }),
      'extra/hidden/SKILL.md': '---\nname: hidden\ndescription: Hidden overlay\n---\nBody',
      '.mcp.json': '{"mcpServers":{"hidden":{"command":"node"}}}',
      'mcp.json': '{"mcpServers":{"portable":{"command":"node"}}}',
      'skills/root/SKILL.md': '---\nname: root\ndescription: Portable skill\n---\nBody',
    });
    const inspected = inspectPluginSource(source);
    expect(inspected.format).toBe('agent-plugin');
    expect(inspected.provenance.companion.effective.interface.displayName).toBe('Root');
    expect(inspected.provenance.companion.effective.skills).toBeUndefined();
    expect(inspected.capabilities.map(c => c.id)).toContain('extension:com.openai');
    expect(inspected.capabilities.map(c => c.id)).toEqual(expect.arrayContaining(['mcp:portable', 'skill:root']));
    expect(inspected.capabilities.map(c => c.id)).not.toEqual(expect.arrayContaining(['mcp:hidden', 'skill:hidden']));
    const output = path.join(temp(), 'vault'); await importPluginSource(source, { output });
    expect(readImportedPlugin(output)).toEqual(inspected);
  });

  it('discovers fallback companion custom skills and MCP exactly once and rebuilds them after export/import', async () => {
    const source = fixture('plugin.json', { name: 'demo' }, {
      '.codex-plugin/plugin.json': JSON.stringify({ name: 'demo', skills: './extra/', mcpServers: ['./.mcp.json', './custom.json'] }),
      'extra/one/SKILL.md': '---\nname: one\ndescription: Custom skill\n---\nBody',
      '.mcp.json': '{"mcpServers":{"stdio":{"command":"node","args":["${PLUGIN_ROOT}/server.mjs"],"env":{"NODE_ENV":"test"}}}}',
      'custom.json': '{"mcpServers":{"remote":{"type":"streamable-http","url":"https://example.invalid/mcp","extensions":{"com.openai":{"auth":{"type":"oauth"}}}}}}',
      'server.mjs': '',
    });
    const inspected = inspectPluginSource(source);
    expect(inspected.capabilities.map(c => c.id).sort()).toEqual(['mcp:remote', 'mcp:stdio', 'skill:one', 'skills']);
    expect(inspected.capabilities.find(c => c.id === 'mcp:remote')).toMatchObject({ executable: false, unsupported: expect.stringMatching(/auth adapter/) });
    expect(inspected.capabilities.find(c => c.id === 'mcp:stdio').schema.env).toEqual({ NODE_ENV: 'test' });
    const first = path.join(temp(), 'vault'); await importPluginSource(source, { output: first });
    expect(readImportedPlugin(first)).toEqual(inspected);
    const bundle = fixture('bundle.json', exportImportedPlugin(first));
    const second = path.join(temp(), 'vault'); await importPluginSource(path.join(bundle, 'bundle.json'), { output: second });
    expect(readImportedPlugin(second)).toEqual(inspected);
  });

  it('imports the latest OpenAPI 3.2.x and rejects structurally invalid documents', () => {
    const doc = { openapi: '3.2.1', info: { title: 'T', version: '1' }, paths: { '/a': { get: { operationId: 'a', responses: { 200: { description: 'ok' } } } } } };
    const inspected = inspectPluginSource(fixture('openapi.json', doc));
    expect(inspected.capabilities.map(c => c.id)).toEqual(['a']);
    for (const bad of [{ ...doc, openapi: '4.0.0' }, { ...doc, info: {} }, { ...doc, paths: { a: {} } }, { ...doc, paths: { '/a': { get: { operationId: 'a' } } } }]) {
      expect(() => inspectPluginSource(fixture('openapi.json', bad), { format: 'openapi' })).toThrow();
    }
  });

  it('rejects schema-invalid declarations that are well-formed JSON', () => {
    expect(() => inspectPluginSource(fixture('package.json', { name: 'demo' }), { format: 'npm' })).toThrow(/version/);
    expect(() => inspectPluginSource(fixture('.claude-plugin/plugin.json', { version: '1' }), { format: 'claude-plugin' })).toThrow(/name/);
    expect(() => inspectPluginSource(fixture('mcp.json', { mcpServers: { a: {} } }), { format: 'mcp' })).toThrow(/command or URL/);
    expect(() => inspectPluginSource(fixture('openclaw.plugin.json', { id: 'x' }), { format: 'openclaw' })).toThrow(/configSchema/);
    expect(() => inspectPluginSource(fixture('manifest.json', { name: 'x', server: {} }), { format: 'mcpb' })).toThrow(/Invalid MCPB/);
    expect(() => inspectPluginSource(fixture('pyproject.toml', '[tool.x]\na = 1\n'), { format: 'python' })).toThrow(/Python/);
  });

  it('discovers Agent Plugins skills, custom skill paths and inline, file or array Claude mcpServers', () => {
    const skill = name => `---\nname: ${name}\ndescription: Does ${name}\n---\nBody`;
    const source = fixture('.claude-plugin/plugin.json', { name: 'demo', skills: ['./extra-skills'], mcpServers: [{ a: { command: 'node', args: ['a.mjs'] } }, './servers.json'] }, {
      'skills/one/SKILL.md': skill('one'), 'extra-skills/two/SKILL.md': skill('two'), 'a.mjs': '', 'servers.json': JSON.stringify({ mcpServers: { b: { type: 'http', url: 'https://example.com/mcp' } } }),
    });
    const ids = inspectPluginSource(source).capabilities.map(c => c.id).sort();
    expect(ids).toEqual(['mcp:a', 'mcp:b', 'skill:one', 'skill:two', 'skills']);
    expect(() => inspectPluginSource(fixture('.claude-plugin/plugin.json', { name: 'demo', mcpServers: './missing.json' }))).toThrow(/absent/);
  });

  it('marks native-host-only and unbound capabilities unsupported rather than executable', () => {
    const source = fixture('plugin.json', { name: 'demo', hooks: './hooks.json', mcpServers: { s: { url: 'https://example.com', headers: { Authorization: 'Bearer ${T}' } } } }, { 'hooks.json': '{}' });
    const caps = Object.fromEntries(inspectPluginSource(source).capabilities.map(c => [c.id, c]));
    expect(caps.hooks).toMatchObject({ executable: false });
    expect(caps['mcp:s']).toMatchObject({ executable: false });
    expect(caps['mcp:s'].unsupported).toMatch(/binding/);
  });

  it('keeps benign environment and header declarations', () => {
    const source = fixture('mcp.json', { mcpServers: { s: { command: 'node', env: { NODE_ENV: 'production' } }, h: { url: 'https://example.com/mcp', headers: { Accept: 'application/json' } } } });
    expect(inspectPluginSource(source).capabilities.every(c => c.executable)).toBe(true);
  });

  it('stores source bytes once and imports near the size limit', async () => {
    const source = fixture('extension.json', { name: 'big' }, { 'blob.bin': Buffer.alloc(4_800_000, 7) });
    const output = path.join(temp(), 'vault');
    await importPluginSource(source, { format: 'generic', output });
    const stored = fs.statSync(path.join(output, 'imports/plugin-source.md')).size;
    expect(stored).toBeLessThan(4_800_000 * 1.4);
    expect(readImportedPlugin(output).assets.find(a => a.path === 'blob.bin').sha256).toBeTruthy();
  });

  it('detects tampering with preserved bytes or hashes on read', async () => {
    const source = fixture('plugin.json', { name: 'demo' });
    const output = path.join(temp(), 'vault');
    await importPluginSource(source, { format: 'agent-plugin', output });
    const file = path.join(output, 'imports/plugin-source.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"format":"agent-plugin"', '"format":"npm"      '));
    expect(() => readImportedPlugin(output)).toThrow();
  });

  it('leaves no namespace or staging directory when composition fails', async () => {
    const source = fixture('plugin.json', { name: 'demo' });
    const parent = temp(); const output = path.join(parent, 'vault');
    await expect(importPluginSource(source, { format: 'agent-plugin', output, compose: 'Bad Name', projectRoot: temp() })).rejects.toThrow();
    expect(fs.readdirSync(parent)).toEqual([]);
  });

  it('cleans a real committed staging vault after a reported engine failure', async () => {
    const source = fixture('plugin.json', { name: 'demo' }); const parent = temp(); const output = path.join(parent, 'vault');
    const kernel = createEngine(); let committed = false;
    const engine = { processOperation: async (envelope, vault, options) => {
      const result = await kernel.processOperation(envelope, vault, options);
      if (!envelope.dry_run) { expect(result.success).toBe(true); expect(fs.existsSync(path.join(vault, 'imports/plugin-source.md'))).toBe(true); committed = true; return { success: false }; }
      return result;
    } };
    await expect(importPluginSource(source, { output, engine })).rejects.toThrow(/commit failed/);
    expect(committed).toBe(true); expect(fs.readdirSync(parent)).toEqual([]);
  });

  it('preserves an output collision introduced during staging and removes only its own stage', async () => {
    const source = fixture('plugin.json', { name: 'demo' }); const parent = temp(); const output = path.join(parent, 'vault');
    const kernel = createEngine();
    const engine = { processOperation: async (envelope, vault, options) => {
      const result = await kernel.processOperation(envelope, vault, options);
      if (!envelope.dry_run) { fs.mkdirSync(output); fs.writeFileSync(path.join(output, 'authored.txt'), 'preserve'); }
      return result;
    } };
    await expect(importPluginSource(source, { output, engine })).rejects.toThrow(/collision/);
    expect(fs.readdirSync(parent)).toEqual(['vault']); expect(fs.readFileSync(path.join(output, 'authored.txt'), 'utf8')).toBe('preserve');
  });

  it('refuses a missing or pre-existing output', async () => {
    const source = fixture('plugin.json', { name: 'demo' });
    await expect(importPluginSource(source, { format: 'agent-plugin' })).rejects.toThrow(/output/i);
    await expect(importPluginSource(source, { format: 'agent-plugin', output: temp() })).rejects.toThrow(/exists/);
  });

  it('imports MCPB archives with bounded members and rejects unsafe archives', () => {
    const dir = temp(); const zip = path.join(dir, 'demo.mcpb');
    execFileSync('python3', ['-c', `import zipfile,sys,json
z=zipfile.ZipFile(sys.argv[1],'w'); z.writestr('manifest.json', json.dumps({'manifest_version':'0.3','name':'demo','version':'1.0.0','server':{'type':'node','entry_point':'server.js'}})); z.writestr('server.js','1'); z.close()
y=zipfile.ZipFile(sys.argv[2],'w'); y.writestr('../evil.json','{}'); y.close()`, zip, path.join(dir, 'bad.mcpb')]);
    const inspected = inspectPluginSource(zip);
    expect(inspected.format).toBe('mcpb');
    expect(inspected.provenance.archive.sha256).toHaveLength(64);
    expect(() => inspectPluginSource(path.join(dir, 'bad.mcpb'))).toThrow();
    fs.writeFileSync(path.join(dir, 'corrupt.mcpb'), 'not a zip');
    expect(() => inspectPluginSource(path.join(dir, 'corrupt.mcpb'))).toThrow(/archive/i);
  });

  it('rejects an MCPB manifest whose entry point is not shipped', () => {
    expect(() => inspectPluginSource(fixture('manifest.json', { manifest_version: '0.3', name: 'demo', version: '1.0.0', server: { type: 'node', entry_point: 'server.js' } }))).toThrow(/absent|directory/i);
  });

  it('rejects invalid SSSS bundles', () => {
    const source = fixture('bundle.json', { manifest: { name: 'x' }, files: [{ path: 'a.md', content: 'x' }] });
    expect(() => inspectPluginSource(source, { format: 'ssss' })).toThrow(/Invalid SSSS/);
  });
});
