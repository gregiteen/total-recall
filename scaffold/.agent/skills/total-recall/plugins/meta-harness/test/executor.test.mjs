import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ADAPTERS, agentEnvironment, parseAgentResult, dispatchAgent, runProcess } from '../src/worker.mjs';
import { commandPermissions, executeCommand, executeOnNode, workerProgram } from '../src/executor.mjs';

test('all nine requested adapters expose primary documentation and avoid permission bypass', () => {
  assert.deepEqual(ADAPTERS.map(adapter => adapter.id), ['claude','codex','agy','cursor','dsh','grok','muse','pi','hermes']);
  for (const adapter of ADAPTERS) { assert.match(adapter.docs, /^https:/); assert.ok(!adapter.args.some(arg => /bypass|yolo|dangerously|always-approve/.test(arg))); }
  assert.deepEqual(agentEnvironment({ PATH: '/bin', HOME: '/home/test', OPENAI_API_KEY: 'private', ANTHROPIC_API_KEY: 'private', TELNYX_API_KEY: 'private' }), { PATH: '/bin', HOME: '/home/test' });
});

test('native completed result contracts reject failed, empty and partial envelopes', () => {
  const examples = {
    claude: [{ type: 'result', subtype: 'success', result: 'done' }], cursor: [{ type: 'result', subtype: 'success', result: 'done' }], grok: [{ type: 'result', subtype: 'success', result: 'done' }],
    codex: [{ type: 'item.completed', item: { type: 'agent_message', text: 'done' } }, { type: 'turn.completed' }],
    agy: [{ status: 'SUCCESS', response: 'done' }], dsh: [{ type: 'final', text: 'done' }],
    hermes: [{ type: 'result', exit_code: 0, text: 'done' }],
    pi: [{ type: 'agent_end', messages: [{ role: 'assistant', content: [{ type: 'text', text: 'done' }], stopReason: 'stop' }] }],
    muse: [{ headless_event: 'actual captured event log' }],
  };
  for (const [id, frames] of Object.entries(examples)) {
    const result = parseAgentResult(id, { exitCode: 0, stdout: frames.map(frame => JSON.stringify(frame)).join('\n') });
    assert.equal(result.ok, true, id); assert.equal(result.commandExecutionVerified, false);
    assert.equal(parseAgentResult(id, { exitCode: 1, stdout: JSON.stringify(frames) }).ok, false);
    assert.equal(parseAgentResult(id, { exitCode: 0, stdout: '' }).ok, false);
    if (id !== 'muse') assert.equal(parseAgentResult(id, { exitCode: 0, stdout: '{"type":"system"}' }).ok, false);
  }
  assert.equal(parseAgentResult('agy', { exitCode: 0, stdout: '{"status":"WAITING","response":"done"}' }).ok, false);
});

test('boolean effect permissions gate the selected command before any agent process', async () => {
  assert.deepEqual(commandPermissions({ send: true }), { read: true, write: false, send: true, destructive: false });
  assert.throws(() => commandPermissions({ write: 'true' }), /Invalid permission/);
  assert.throws(() => commandPermissions({ root: true }), /Invalid permission/);
  assert.throws(() => commandPermissions({ toString: true }), /Invalid permission/);
  const plugin = { valid: true, manifest: { cli: { command: 'example', subcommands: [{ name: 'send', effect: 'send', args: [] }, { name: 'secret', effect: 'write', args: [{ secret: true }] }] } } };
  let observed;
  const worker = async request => { observed = request; return { ok: true, response: 'Agent reply', commandExecutionVerified: false }; };
  const request = { plugin, subcommand: 'send', args: ['quote\' $() `literal`'], execution: { agent: 'codex', node: 'local', cwd: process.cwd(), permissions: { send: false } } };
  await assert.rejects(executeCommand(request, { worker }), /permission is off/); assert.equal(observed, undefined);
  request.execution.permissions.send = true;
  const result = await executeCommand(request, { worker }); assert.equal(result.ok, true); assert.equal(result.commandExecutionVerified, false);
  assert.ok(observed.prompt.includes('quote')); assert.equal(observed.permissions.send, true);
  await assert.rejects(executeCommand({ ...request, subcommand: 'secret' }, { worker }), /never an agent prompt/);
});

test('mesh uses recorded access, fixed remote entrypoint and stdin payload; missing access fails', async () => {
  let call;
  const mesh = { findMeshNode: () => ({ hostname: 'build-box', online: true }) };
  const access = { resolveNodeAccess: () => ({ complete: true, target: 'builder@mesh.example' }), buildSshArgs: (resolved, options) => [resolved.target, options.command] };
  const result = await executeOnNode('build-box', { operation: 'inspect' }, { mesh, access, processRunner: async (binary, args, options) => { call = { binary, args, options }; return { exitCode: 0, stdout: '{"agents":[]}' }; } });
  assert.deepEqual(result, { agents: [] }); assert.equal(call.args[0], 'builder@mesh.example'); assert.match(call.args[1], /exec node --input-type=module$/); assert.match(call.options.input, /runWorker/);
  await assert.rejects(executeOnNode('build-box', { operation: 'inspect' }, { mesh, access: { ...access, buildSshArgs: () => null } }), /no verified SSH access/);
  assert.ok(!workerProgram({ operation: 'inspect' }).includes('private-fixture'));
});

test('process worker passes literal stdin and reports real timeout and spawn errors', async t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-process-')); t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const result = await runProcess(process.execPath, ['--input-type=module', '-e', 'let s="";for await(const c of process.stdin)s+=c;console.log(s);'], { cwd, input: '$(not executed) `literal`' });
  assert.equal(result.exitCode, 0); assert.equal(result.stdout.trim(), '$(not executed) `literal`');
  const timeout = await runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { cwd, timeoutMs: 30 }); assert.equal(timeout.reason, 'timeout');
  const missing = await runProcess(path.join(cwd, 'absent'), [], { cwd }); assert.equal(missing.reason, 'spawn-error');
});

test('dispatch checks installed account metadata and applies scoped write boolean', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-dispatch-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'codex'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  const calls = [];
  const probe = async (binary, args) => { calls.push(args); if (args[0] === '--version') return { exitCode: 0, stdout: 'codex 1.0.0', stderr: '' }; if (args[0] === 'login') return { exitCode: 0, stdout: 'Logged in using ChatGPT', stderr: '' }; return { exitCode: 0, stdout: '{"type":"item.completed","item":{"type":"agent_message","text":"done"}}\n{"type":"turn.completed"}' }; };
  const result = await dispatchAgent({ agent: 'codex', cwd: root, prompt: 'inspect', permissions: { write: false } }, { probe, env: { PATH: root }, bootstrap:async request=>request.prompt });
  assert.equal(result.ok, true); assert.ok(calls.at(-1).includes('read-only'));
});
test('credential-issuing commands cannot disclose raw tokens to an agent transcript', async () => {
  const plugin = { valid: true, manifest: { cli: { command: 'auth', subcommands: [{ name: 'key', effect: 'write', sensitive_output: true }] } } };
  await assert.rejects(() => executeCommand({ plugin, subcommand: 'key', args: ['issue', 'example'], execution: { agent: 'claude', node: 'local', permissions: { write: true } }, projectRoot: '/workspace' }), /direct execution/);
});
