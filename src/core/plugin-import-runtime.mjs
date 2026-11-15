/** Explicit trusted execution of preserved portable capabilities. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readImportedPlugin } from './plugin-import.mjs';
import { safePath, noLinks, expandPluginVars, MAX_BYTES } from './plugin-import-source.mjs';
import { getPlugin, resolvePluginFile } from './plugin-loader.mjs';
import { runPluginCommand } from './plugin-runner.mjs';

const TIMEOUT = 15000;
function ensure(value, message) { if (!value) throw new Error(message); }
function literal(value) { ensure(!JSON.stringify(value).includes('${') && !JSON.stringify(value).includes('{{'), 'Unresolved configuration placeholder; bind credentials through auth before invoking'); return value; }
function stop(child) { try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch {} }
async function runProcess(file, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, detached: process.platform !== 'win32', env: { PATH: process.env.PATH || '', NODE_NO_WARNINGS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let bytes = 0, stdout = '', stderr = '';
    const timer = setTimeout(() => { stop(child); reject(new Error('Capability timed out')); }, TIMEOUT);
    const collect = (chunk, error) => { bytes += chunk.length; if (bytes > MAX_BYTES) { stop(child); reject(new Error('Capability output exceeds limit')); } else if (error) stderr += chunk; else stdout += chunk; };
    child.stdout.on('data', c => collect(c, false)); child.stderr.on('data', c => collect(c, true));
    child.on('error', () => { clearTimeout(timer); reject(new Error('Capability process could not start; dependency or runtime missing')); });
    child.on('close', (exitCode, signal) => { clearTimeout(timer); resolve({ ok: exitCode === 0, exitCode, signal, stdout, stderr }); });
  });
}

async function responseJson(response, id) {
  ensure(response.ok, `MCP HTTP request failed (${response.status})`);
  if (response.status === 202 || response.status === 204) return null;
  let buffer = '', count = 0;
  const sse = response.headers.get('content-type')?.includes('text/event-stream');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      count += value.length; ensure(count <= MAX_BYTES, 'MCP response exceeds limit');
      buffer += decoder.decode(value, { stream: true });
      if (sse) {
        buffer = buffer.replace(/\r\n/g, '\n');
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const data = event.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
          if (!data) continue;
          const message = JSON.parse(data);
          if (message.id === id) return message;
        }
      }
    }
    if (!sse && buffer) return JSON.parse(buffer);
    throw new Error('MCP response missing request ID');
  } finally { await reader.cancel().catch(() => {}); }
}

async function mcpClient(spec, cwd, operation, input) {
  let serial = 0, session, protocol = '2025-06-18', child;
  const pending = new Map();
  let send, cleanup = async () => {};
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); if (child) stop(child); for (const task of pending.values()) task.reject(new Error('MCP timed out')); }, TIMEOUT);
  // The whole lifecycle (validation, spawn, requests, teardown) sits in one try so no path leaks the timer or process.
  try {
  literal(spec);
  if (spec.command) {
    ensure(!['npx', 'npm', 'pip', 'uvx', 'bunx'].includes(path.basename(spec.command)), 'Auto-installing MCP launchers are unsupported; install dependencies explicitly');
    ensure(!spec.env || Object.values(spec.env).every(v => typeof v === 'string'), 'Invalid MCP environment');
    child = spawn(spec.command === 'node' ? process.execPath : spec.command, spec.args || [], { cwd, detached: process.platform !== 'win32', env: { PATH: process.env.PATH || '', ...(spec.env || {}) }, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '', size = 0;
    const fail = () => { for (const task of pending.values()) task.reject(new Error('MCP process closed or failed')); pending.clear(); };
    child.on('error', fail); child.on('close', fail); child.stdin.on('error', fail);
    child.stderr.on('data', chunk => { size += chunk.length; if (size > MAX_BYTES) { stop(child); fail(); } });
    child.stdout.on('data', chunk => {
      try {
        size += chunk.length; ensure(size <= MAX_BYTES, 'MCP response exceeds limit'); buffer += chunk.toString('utf8');
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); if (!line.trim()) continue;
          const message = JSON.parse(line);
          if (pending.has(message.id)) { const task = pending.get(message.id); pending.delete(message.id); task.resolve(message); }
          else if (message.method && message.id !== undefined) child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Client method unsupported' } }) + '\n');
        }
      } catch { stop(child); fail(); }
    });
    send = message => message.id === undefined ? (child.stdin.write(JSON.stringify(message) + '\n'), Promise.resolve(null)) : new Promise((resolve, reject) => { pending.set(message.id, { resolve, reject }); child.stdin.write(JSON.stringify(message) + '\n'); });
    cleanup = async () => { stop(child); await new Promise(resolve => { if (child.exitCode !== null || child.signalCode) resolve(); else child.once('close', resolve); }); };
  } else {
    const url = new URL(spec.url); ensure(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, 'Unsupported MCP URL');
    send = async message => {
      const response = await fetch(url, { method: 'POST', redirect: 'error', signal: controller.signal, headers: { ...(spec.headers || {}), 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': protocol, ...(session ? { 'Mcp-Session-Id': session } : {}) }, body: JSON.stringify(message) });
      if (response.headers.has('mcp-session-id')) session = response.headers.get('mcp-session-id');
      return responseJson(response, message.id);
    };
    cleanup = async () => { if (session && !controller.signal.aborted) await fetch(url, { method: 'DELETE', redirect: 'error', signal: controller.signal, headers: { ...(spec.headers || {}), 'Mcp-Session-Id': session, 'MCP-Protocol-Version': protocol } }).then(r => r.body?.cancel()).catch(() => {}); };
  }
  const request = async (method, params) => {
    const id = ++serial;
    const message = await send({ jsonrpc: '2.0', id, method, params });
    ensure(message?.id === id && !message.error && message.result !== undefined, 'MCP request failed or invalid response');
    return message.result;
  };
  {
    const initialized = await request('initialize', { protocolVersion: protocol, capabilities: {}, clientInfo: { name: 'total-recall-plugin-import', version: '1.0.0' } });
    ensure(['2024-11-05', '2025-03-26', '2025-06-18'].includes(initialized.protocolVersion), 'Unsupported negotiated MCP protocol version');
    protocol = initialized.protocolVersion;
    await send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    ensure(initialized.capabilities?.tools, 'MCP server does not declare tools');
    const tools = []; let cursor;
    for (let page = 0; page < 100; page++) {
      const result = await request('tools/list', cursor ? { cursor } : {});
      ensure(Array.isArray(result.tools), 'Invalid MCP tools/list result'); tools.push(...result.tools);
      ensure(tools.length <= 1000, 'MCP tool inventory exceeds limit');
      cursor = result.nextCursor; if (!cursor) break;
      ensure(page < 99, 'MCP pagination limit');
    }
    if (operation === 'list') return { ok: true, tools };
    ensure(typeof input.tool === 'string' && tools.some(t => t.name === input.tool), 'Selected MCP tool is not advertised');
    const result = await request('tools/call', { name: input.tool, arguments: input.arguments || {} });
    // A tool-level failure is reported by the server as isError; it is never a successful call.
    return { ok: result.isError !== true, result };
  }
  } finally { await cleanup(); clearTimeout(timer); controller.abort(); }
}

/** One parser for `invoke` and composed commands: <capability> [--trust-source] [--input JSON] [-- args...]. */
export function parseInvokeArgv(argv) {
  const rest = [...argv]; const options = {}; let input = {}; const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--') { positional.push(...rest.slice(i + 1)); break; }
    if (arg === '--trust-source') options.trust = true;
    else if (arg === '--input') { ensure(rest[i + 1] !== undefined, 'Option requires a value'); try { input = JSON.parse(rest[++i]); } catch { throw new Error('--input must be valid JSON'); } ensure(input && typeof input === 'object' && !Array.isArray(input), '--input must be a JSON object'); }
    else if (arg === '--json') continue;
    else if (arg.startsWith('-')) throw new Error('Unknown invoke option');
    else positional.push(arg);
  }
  ensure(positional.length, 'Capability id required');
  return { id: positional[0], options: { ...input, ...options, args: positional.slice(1) } };
}
export function invokeFromArgv(vault, argv) { const { id, options } = parseInvokeArgv(argv); return invokeImportedPlugin(vault, id, options); }

export async function invokeImportedPlugin(vault, id, options = {}) {
  ensure(options.trust === true, 'Invocation requires explicit --trust-source');
  const imported = readImportedPlugin(vault);
  const capability = imported.capabilities.find(c => c.id === id);
  ensure(capability?.executable, capability?.unsupported || 'Capability is unknown or unsupported');
  const args = options.args || [];
  ensure(Array.isArray(args) && args.every(a => typeof a === 'string') && Buffer.byteLength(JSON.stringify(options)) <= 65536, 'Invalid or oversized invocation');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-plugin-invoke-'));
  try {
    for (const asset of imported.assets) {
      const target = path.join(root, safePath(asset.path));
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      fs.writeFileSync(target, Buffer.from(asset.data_b64, 'base64'), { mode: asset.mode, flag: 'wx' });
    }
    const dataDir = path.join(root, '.plugin-data');
    fs.mkdirSync(dataDir, { mode: 0o700 });
    const spec = expandPluginVars(capability.schema, root, dataDir);
    if (capability.kind === 'mcp-server') return await mcpClient(spec, root, options.tool ? 'call' : 'list', options);
    if (capability.kind === 'openapi-operation') {
      literal(spec);
      ensure(spec.servers?.[0]?.url && !spec.servers[0].variables, 'Explicit OpenAPI server without variables required');
      let route = spec.route;
      const parameters = options.parameters || {};
      for (const p of spec.parameters || []) {
        ensure(!p.$ref && (!p.style || ['simple', 'form'].includes(p.style)) && ['path', 'query', 'header'].includes(p.in), 'Unsupported OpenAPI parameter serialization');
        ensure(!p.required || parameters[p.name] !== undefined, 'Required OpenAPI parameter missing');
        if (p.in === 'path') route = route.replaceAll(`{${p.name}}`, encodeURIComponent(String(parameters[p.name])));
      }
      ensure(!/[{}]/.test(route), 'Unresolved OpenAPI path parameter');
      const base = new URL(spec.servers[0].url);
      ensure(['http:', 'https:'].includes(base.protocol) && !base.password && !base.username, 'Unsupported OpenAPI URL');
      const url = new URL(base.href.replace(/\/$/, '') + route);
      const headers = {};
      for (const p of spec.parameters || []) if (parameters[p.name] !== undefined) {
        ensure(['string', 'number', 'boolean'].includes(typeof parameters[p.name]), 'Only scalar OpenAPI parameters supported');
        if (p.in === 'query') url.searchParams.set(p.name, parameters[p.name]);
        if (p.in === 'header') { ensure(!/authorization|cookie|token|key/i.test(p.name), 'Credential headers require an auth adapter'); headers[p.name] = String(parameters[p.name]); }
      }
      if (options.body !== undefined) { ensure(spec.requestBody?.content?.['application/json'], 'OpenAPI JSON request body not declared'); headers['Content-Type'] = 'application/json'; }
      const response = await fetch(url, { method: spec.method.toUpperCase(), headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), redirect: 'error', signal: AbortSignal.timeout(TIMEOUT) });
      let body = ''; for await (const chunk of response.body) { body += Buffer.from(chunk).toString('utf8'); ensure(Buffer.byteLength(body) <= MAX_BYTES, 'OpenAPI response exceeds limit'); }
      return { ok: response.ok, status: response.status, body };
    }
    const handler = noLinks(path.join(root, safePath(spec.handler.replace(/^\.\//, ''))));
    if (capability.kind === 'npm-bin') return await runProcess(process.execPath, [handler, ...args], root);
    if (capability.kind === 'native-command') {
      const bootstrap = `const m=await import(${JSON.stringify(pathToFileURL(handler).href)}); const f=m.run||m.default;if(typeof f!=='function')throw Error('Handler missing');const a=JSON.parse(process.argv[1]); const r=await f(m.run?[process.execPath,'total-recall',${JSON.stringify(id)},...a]:a);if(r!==undefined)console.log(JSON.stringify(r));if(r?.exitCode)process.exitCode=r.exitCode;`;
      return await runProcess(process.execPath, ['--input-type=module', '-e', bootstrap, JSON.stringify(args)], root);
    }
    throw new Error('Unsupported capability runtime');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

export async function composeImportedPlugin(vault, name, options = {}) {
  ensure(/^[a-z][a-z0-9-]{0,63}$/.test(name), 'Invalid composed command name');
  const projectRoot = noLinks(options.projectRoot || process.cwd());
  const owner = getPlugin('composable-cli', projectRoot);
  ensure(owner?.valid, 'Installed composable-cli owner required');
  const commandFile = path.join(projectRoot, '.agent', 'commands', name + '.mjs');
  ensure(!fs.existsSync(commandFile), 'Composed command already exists');
  const runtime = pathToFileURL(new URL('./plugin-import-runtime.mjs', import.meta.url).pathname).href;
  const code = `const {invokeFromArgv}=await import(${JSON.stringify(runtime)});const result=await invokeFromArgv(${JSON.stringify(path.resolve(vault))},args);console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;return result;`;
  const result = await runPluginCommand(owner, { subcommand: 'create', args: [name, code, '--risk', 'write', '--description', 'Invoke an imported plugin capability with explicit source trust'], cwd: projectRoot, projectRoot });
  if (!result.ok) {
    if (fs.existsSync(commandFile)) await runPluginCommand(owner, { subcommand: 'remove', args: [name], cwd: projectRoot, projectRoot });
    throw new Error('Composable owner registration failed');
  }
  return { ok: true, name };
}
