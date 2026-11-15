// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { importPluginSource } from './plugin-import.mjs';
import { invokeImportedPlugin, invokeFromArgv, parseInvokeArgv, composeImportedPlugin } from './plugin-import-runtime.mjs';

const BIN = path.resolve(import.meta.dirname, '../../bin/total-recall.mjs');
const cleanups = [];
const temp = () => { const p = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-import-rt-')); cleanups.push(() => fs.rmSync(p, { recursive: true, force: true })); return p; };
afterEach(async () => { for (const fn of cleanups.splice(0)) await fn(); });
function write(root, files) { for (const [n, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, n)), { recursive: true }); fs.writeFileSync(path.join(root, n), c); } return root; }
async function vaultOf(files, options = {}) { const src = write(temp(), files); const output = path.join(temp(), 'vault'); await importPluginSource(src, { ...options, output }); return output; }
const listen = handler => new Promise(resolve => { const server = http.createServer(handler); server.listen(0, '127.0.0.1', () => { cleanups.push(() => new Promise(r => { server.closeAllConnections?.(); server.close(r); })); resolve(`http://127.0.0.1:${server.address().port}`); }); });
const body = req => new Promise(r => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => r(b)); });

const STDIO_SERVER = `import readline from 'node:readline';
import fs from 'node:fs';
const rl = readline.createInterface({ input: process.stdin });
const send = m => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\\n');
rl.on('line', line => { const m = JSON.parse(line);
  if (m.method === 'initialize') send({ id: m.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 's', version: '1' } } });
  else if (m.method === 'tools/list') send({ id: m.id, result: { tools: [{ name: 'echo', inputSchema: { type: 'object' } }, { name: 'boom', inputSchema: { type: 'object' } }] } });
  else if (m.method === 'tools/call') { fs.writeFileSync(process.env.PLUGIN_DATA_PROBE || '/dev/null', ''); send({ id: m.id, result: { isError: m.params.name === 'boom', content: [{ type: 'text', text: 'said:' + JSON.stringify(m.params.arguments) }] } }); } });`;
const stdioFiles = { 'mcp.json': JSON.stringify({ mcpServers: { demo: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/server.mjs'] } } }), 'server.mjs': STDIO_SERVER };

describe('imported plugin runtime', () => {
  it('invokes real native run/default handlers with literal argv and propagates return or process exit codes', async () => {
    const manifest = { id: 'demo', name: 'Demo', version: '1.0.0', description: 'Native commands fixture',
      commands: ['run', 'default', 'exit'].map(name => ({ name, handler: `${name}.mjs` })),
      ui: { home: 'home', design_tokens: 'DESIGN.md', elements: [{ id: 'home', kind: 'panel', tag: 'demo-home', module: 'ui/home.js' }] } };
    const vault = await vaultOf({ 'plugin.json': JSON.stringify(manifest),
      'run.mjs': 'export async function run(argv) { return { argv, exitCode: argv.includes("fail") ? 7 : 0 }; } export default function () { throw Error("run takes precedence"); }',
      'default.mjs': 'export const run = "metadata"; export default async function (args) { return { args, exitCode: args.includes("fail") ? 4 : 0 }; }',
      'exit.mjs': 'export default function () { console.error("native failed"); process.exit(6); }',
    });
    const args = ['space value', '--literal', '$(printf unsafe)', 'quote"value'];
    await expect(invokeImportedPlugin(vault, 'run', { args })).rejects.toThrow(/trust-source/);
    const run = await invokeImportedPlugin(vault, 'run', { trust: true, args });
    expect(run).toMatchObject({ ok: true, exitCode: 0 });
    expect(JSON.parse(run.stdout).argv).toEqual([process.execPath, 'total-recall', 'run', ...args]);
    const def = await invokeImportedPlugin(vault, 'default', { trust: true, args });
    expect(def).toMatchObject({ ok: true, exitCode: 0 }); expect(JSON.parse(def.stdout).args).toEqual(args);
    expect(await invokeImportedPlugin(vault, 'run', { trust: true, args: ['fail'] })).toMatchObject({ ok: false, exitCode: 7 });
    expect(await invokeImportedPlugin(vault, 'default', { trust: true, args: ['fail'] })).toMatchObject({ ok: false, exitCode: 4 });
    expect(await invokeImportedPlugin(vault, 'exit', { trust: true })).toMatchObject({ ok: false, exitCode: 6, stderr: 'native failed\n' });
  });
  it('lists and calls real stdio MCP tools, expanding the plugin root, and reports tool errors as failures', async () => {
    const vault = await vaultOf(stdioFiles, { format: 'mcp' });
    const listed = await invokeImportedPlugin(vault, 'mcp:demo', { trust: true });
    expect(listed.tools.map(t => t.name)).toEqual(['echo', 'boom']);
    const called = await invokeImportedPlugin(vault, 'mcp:demo', { trust: true, tool: 'echo', arguments: { a: 1 } });
    expect(called).toMatchObject({ ok: true, result: { content: [{ text: 'said:{"a":1}' }] } });
    expect((await invokeImportedPlugin(vault, 'mcp:demo', { trust: true, tool: 'boom' })).ok).toBe(false);
    await expect(invokeImportedPlugin(vault, 'mcp:demo', { trust: true, tool: 'absent' })).rejects.toThrow(/not advertised/);
  });

  it('requires explicit trust and refuses unknown or unsupported capabilities', async () => {
    const vault = await vaultOf({ 'package.json': JSON.stringify({ name: 'demo', version: '1.0.0', bin: { run: 'bin.mjs', py: 'x.py' } }), 'bin.mjs': 'console.log("hi")', 'x.py': 'print(1)' });
    await expect(invokeImportedPlugin(vault, 'run', {})).rejects.toThrow(/trust-source/);
    await expect(invokeFromArgv(vault, ['run', '--input', '{"trust":true}'])).rejects.toThrow(/trust-source/);
    await expect(invokeImportedPlugin(vault, 'py', { trust: true })).rejects.toThrow(/JavaScript|unsupported/i);
    await expect(invokeImportedPlugin(vault, 'missing', { trust: true })).rejects.toThrow();
  });

  it('runs npm JavaScript bins with arguments and bounded environment', async () => {
    const vault = await vaultOf({ 'package.json': JSON.stringify({ name: 'demo', version: '1.0.0', bin: { run: 'bin.mjs' } }), 'bin.mjs': 'console.log(JSON.stringify([process.argv.slice(2), Object.keys(process.env).sort()]))' });
    process.env.TR_IMPORT_LEAK_PROBE = 'secret-value';
    const result = await invokeImportedPlugin(vault, 'run', { trust: true, args: ['x', 'y'] });
    delete process.env.TR_IMPORT_LEAK_PROBE;
    const [argv, env] = JSON.parse(result.stdout);
    expect(argv).toEqual(['x', 'y']);
    expect(env).not.toContain('TR_IMPORT_LEAK_PROBE');
  });

  it('calls Streamable HTTP MCP including SSE responses, and sends no redirects or credentials', async () => {
    const seen = [];
    const url = await listen(async (req, res) => {
      const message = JSON.parse(await body(req) || '{}'); seen.push([req.method, message.method, req.headers['mcp-protocol-version']]);
      if (req.method === 'DELETE') { res.writeHead(204).end(); return; }
      if (message.method === 'notifications/initialized') { res.writeHead(202).end(); return; }
      const result = message.method === 'initialize' ? { protocolVersion: '2025-06-18', capabilities: { tools: {} } }
        : message.method === 'tools/list' ? { tools: [{ name: 'add', inputSchema: {} }] }
          : { content: [{ type: 'text', text: String(message.params.arguments.a + message.params.arguments.b) }] };
      const payload = JSON.stringify({ jsonrpc: '2.0', id: message.id, result });
      if (message.method === 'tools/call') res.writeHead(200, { 'content-type': 'text/event-stream' }).end(`event: message\ndata: ${payload}\n\n`);
      else res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 's1' }).end(payload);
    });
    const vault = await vaultOf({ 'mcp.json': JSON.stringify({ mcpServers: { web: { type: 'http', url, headers: { Accept: 'application/json' } } } }) });
    expect((await invokeImportedPlugin(vault, 'mcp:web', { trust: true })).tools[0].name).toBe('add');
    expect((await invokeImportedPlugin(vault, 'mcp:web', { trust: true, tool: 'add', arguments: { a: 2, b: 3 } })).result.content[0].text).toBe('5');
    expect(seen.some(s => s[0] === 'DELETE')).toBe(true);
  });

  it('marks credential-bound MCP servers unavailable instead of executable', async () => {
    const vault = await vaultOf({ 'mcp.json': JSON.stringify({ mcpServers: { web: { url: 'https://example.invalid/mcp', headers: { Authorization: 'Bearer ${TOKEN}' } } } }) });
    await expect(invokeImportedPlugin(vault, 'mcp:web', { trust: true })).rejects.toThrow(/binding/);
  });

  it.each(['PLUGIN_DATA', 'CLAUDE_PLUGIN_DATA'])('requires persistent binding for %s rather than a temporary data directory', async variable => {
    const vault = await vaultOf({ 'mcp.json': JSON.stringify({ mcpServers: { data: { command: 'node', args: ['${' + variable + '}/server.mjs'] } } }) });
    await expect(invokeImportedPlugin(vault, 'mcp:data', { trust: true })).rejects.toThrow(/persistent binding/);
  });

  it('does not leak timers or processes when MCP configuration is invalid', async () => {
    const vault = await vaultOf({ 'mcp.json': JSON.stringify({ mcpServers: { bad: { type: 'http', url: 'ftp://example.invalid/x' } } }) });
    await expect(invokeImportedPlugin(vault, 'mcp:bad', { trust: true })).rejects.toThrow(/Unsupported MCP URL/);
    const launcher = await vaultOf({ 'mcp.json': JSON.stringify({ mcpServers: { bad: { command: 'npx', args: ['x'] } } }) });
    await expect(invokeImportedPlugin(launcher, 'mcp:bad', { trust: true })).rejects.toThrow(/Auto-installing/);
  });

  it('invokes OpenAPI operations with path, query and header parameters and a JSON body', async () => {
    const requests = [];
    const url = await listen(async (req, res) => { requests.push({ method: req.method, url: req.url, type: req.headers['content-type'], body: await body(req), trace: req.headers['x-trace'] }); res.writeHead(200).end('{"ok":true}'); });
    const spec = { openapi: '3.2.1', info: { title: 'T', version: '1' }, servers: [{ url }], paths: {
      '/items/{id}': { post: { operationId: 'setItem', parameters: [{ name: 'id', in: 'path', required: true }, { name: 'q', in: 'query' }, { name: 'X-Trace', in: 'header' }], requestBody: { content: { 'application/json': {} } }, responses: { 200: { description: 'ok' } } } } } };
    const vault = await vaultOf({ 'openapi.json': JSON.stringify(spec) });
    const result = await invokeImportedPlugin(vault, 'setItem', { trust: true, parameters: { id: 'a b', q: '1', 'X-Trace': 't' }, body: { n: 1 } });
    expect(result).toMatchObject({ ok: true, status: 200 });
    expect(requests[0]).toMatchObject({ method: 'POST', url: '/items/a%20b?q=1', type: 'application/json', body: '{"n":1}', trace: 't' });
    await expect(invokeImportedPlugin(vault, 'setItem', { trust: true, parameters: {} })).rejects.toThrow(/Required/);
  });

  it('parses shared invoke arguments identically for the CLI and composed commands', () => {
    expect(parseInvokeArgv(['cap', '--trust-source', '--input', '{"tool":"t","arguments":{"a":1}}', '--', '--flag', 'v'])).toEqual({ id: 'cap', options: { tool: 't', arguments: { a: 1 }, trust: true, args: ['--flag', 'v'] } });
    expect(() => parseInvokeArgv(['--trust-source'])).toThrow(/Capability/);
    expect(() => parseInvokeArgv(['c', '--input', '[1]'])).toThrow(/object/);
    expect(() => parseInvokeArgv(['c', '--input', '{bad'])).toThrow(/JSON/);
    expect(() => parseInvokeArgv(['c', '--nope'])).toThrow(/Unknown/);
  });

  it('composes through the installed owner and the generated command forwards MCP tool input', async () => {
    const vault = await vaultOf(stdioFiles, { format: 'mcp' });
    const project = fs.realpathSync(temp());
    fs.mkdirSync(path.join(project, '.agent/skills/total-recall'), { recursive: true }); // project brain marker the CLI needs to resolve composed commands
    expect(await composeImportedPlugin(vault, 'imp', { projectRoot: project })).toEqual({ ok: true, name: 'imp' });
    expect(fs.existsSync(path.join(project, '.agent/commands/imp.mjs'))).toBe(true);
    await expect(composeImportedPlugin(vault, 'imp', { projectRoot: project })).rejects.toThrow(/already exists/);
    await expect(composeImportedPlugin(vault, 'Bad Name', { projectRoot: project })).rejects.toThrow(/Invalid composed/);
    const out = execFileSync(process.execPath, [BIN, 'imp', 'mcp:demo', '--trust-source', '--input', '{"tool":"echo","arguments":{"b":2}}'], { cwd: project, encoding: 'utf8', timeout: 60000, env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !['_TR_TEST_AGENT_DIR', 'AGENT_DIR'].includes(k))) });
    expect(JSON.parse(out.trim().split('\n').pop())).toMatchObject({ ok: true, result: { content: [{ text: 'said:{"b":2}' }] } });
    expect(await invokeFromArgv(vault, ['mcp:demo', '--trust-source'])).toMatchObject({ ok: true });
  }, 90000);
});
