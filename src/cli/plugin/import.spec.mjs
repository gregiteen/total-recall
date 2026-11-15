// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPluginImport } from './import.mjs';
import { run as runPlugin } from './index.mjs';

const roots = [];
const temp = () => { const p = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-import-cli-')); roots.push(p); return p; };
afterEach(() => { vi.restoreAllMocks(); process.exitCode = undefined; for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true }); });
function capture() { const lines = []; vi.spyOn(console, 'log').mockImplementation((...a) => { lines.push(a.join(' ')); }); return lines; }
function source(files) { const root = temp(); for (const [n, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, n)), { recursive: true }); fs.writeFileSync(path.join(root, n), c); } return root; }

describe('plugin import CLI', () => {
  it('prints help and the supported formats', async () => {
    const lines = capture();
    await runPluginImport([]);
    expect(lines.join('\n')).toMatch(/passive and never installs/);
    lines.length = 0;
    await runPluginImport(['formats']);
    const formats = JSON.parse(lines[0]);
    for (const f of ['native', 'ssss', 'agent-plugin', 'codex-plugin', 'claude-plugin', 'mcp', 'openapi', 'npm', 'vscode', 'python', 'mcpb', 'openclaw', 'generic']) expect(formats).toContain(f);
  });

  it('inspects, imports, reads and exports through the plugin router', async () => {
    const src = source({ 'plugin.json': '{"name":"demo","version":"1.0.0"}' });
    const output = path.join(temp(), 'vault');
    const lines = capture();
    await runPlugin(['import', 'inspect', src]);
    expect(JSON.parse(lines.pop()).format).toBe('agent-plugin');
    await runPlugin(['import', src, '--output', output, '--dry-run']);
    expect(fs.existsSync(output)).toBe(false);
    await runPlugin(['import', src, '--output', output]);
    expect(JSON.parse(lines.pop()).ok).toBe(true);
    await runPlugin(['import', 'read', output]);
    expect(JSON.parse(lines.pop()).format).toBe('agent-plugin');
    await runPlugin(['import', 'export', output]);
    expect(JSON.parse(lines.pop()).manifest.primitive_inventory.asset).toBe(1);
  });

  it('invokes a capability with the shared parser and fails closed without trust', async () => {
    const src = source({ 'package.json': '{"name":"demo","version":"1.0.0","bin":{"run":"bin.mjs"}}', 'bin.mjs': 'console.log(process.argv.slice(2).join(","))' });
    const output = path.join(temp(), 'vault');
    const lines = capture();
    await runPluginImport([src, '--output', output]);
    await expect(runPluginImport(['invoke', output, 'run'])).rejects.toThrow(/trust-source/);
    await runPluginImport(['invoke', output, 'run', '--trust-source', '--', 'a', 'b']);
    expect(JSON.parse(lines.pop())).toMatchObject({ ok: true, stdout: 'a,b\n' });
    expect(process.exitCode).toBeUndefined();
  });

  it('sets a failing exit code when the capability fails', async () => {
    const src = source({ 'package.json': '{"name":"demo","version":"1.0.0","bin":{"run":"bin.mjs"}}', 'bin.mjs': 'process.exit(3)' });
    const output = path.join(temp(), 'vault');
    const lines = capture();
    await runPluginImport([src, '--output', output]);
    await runPluginImport(['invoke', output, 'run', '--trust-source']);
    expect(JSON.parse(lines.pop())).toMatchObject({ ok: false, exitCode: 3 });
    expect(process.exitCode).toBe(1);
  });

  it('rejects unknown options, missing values and missing sources', async () => {
    await expect(runPluginImport(['x'])).rejects.toThrow();
    await expect(runPluginImport(['inspect'])).rejects.toThrow(/required/);
    await expect(runPluginImport(['inspect', temp(), '--bogus'])).rejects.toThrow(/Unknown/);
    await expect(runPluginImport(['inspect', temp(), '--format'])).rejects.toThrow(/value/);
  });
});
