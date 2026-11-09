/**
 * MCP stdio (JSONL), with the initialize lifecycle used by Claude and Codex.
 * Protocol: https://modelcontextprotocol.io/specification/2025-11-25
 * Approval result: https://code.claude.com/docs/en/agent-sdk/user-input
 */
import { createInterface } from 'node:readline';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brainDir } from './paths.mjs';
import { appendEvent, jobPaths, tailInbox } from './control.mjs';

const execute = promisify(execFile);
export const QUESTION_TIMEOUT_MS = 10 * 60_000;
export const NO_ANSWER = 'No answer; proceed on your best judgment';
const versions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const textResult = text => ({ content: [{ type: 'text', text }] });
const fault = (code, message) => Object.assign(new Error(message), { code });

export const MCP_TOOLS = [
  { name: 'ask', description: 'Ask the operator questions and wait for a reply.', inputSchema: {
    type: 'object', properties: { questions: { type: 'array', minItems: 1, items: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'object' }] } } }, required: ['questions'], additionalProperties: false,
  } },
  { name: 'approve', description: 'Answer a Claude Code permission prompt under the job approval policy.', inputSchema: {
    type: 'object', properties: { tool_name: { type: 'string', minLength: 1 }, input: { type: 'object' }, tool_use_id: { type: 'string' } }, required: ['tool_name', 'input'],
  } },
];

/** Return Claude's --mcp-config object and Codex's -c arguments. No shell parses these values. */
export function mcpConfigFor(job, options = {}) {
  const id = jobPaths(job).id;
  const command = process.execPath;
  const args = [fileURLToPath(import.meta.url), '--approvals', options.approvalPolicy || 'auto',
    '--question-timeout-ms', String(options.questionTimeoutMs ?? options.timeoutMs ?? QUESTION_TIMEOUT_MS)];
  const env = { TR_METAHARNESS_JOB: id, TR_SECRETS_BRAIN: brainDir() };
  if (process.env.TOTAL_RECALL_BIN) env.TOTAL_RECALL_BIN = process.env.TOTAL_RECALL_BIN;
  const claude = { mcpServers: { metaharness: { command, args, env } } };
  const tomlEnv = `{ ${Object.entries(env).map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join(', ')} }`;
  const codex = ['-c', `mcp_servers.metaharness.command=${JSON.stringify(command)}`,
    '-c', `mcp_servers.metaharness.args=${JSON.stringify(args)}`, '-c', `mcp_servers.metaharness.env=${tomlEnv}`,
    '-c', `mcp_servers.metaharness.tool_timeout_sec=${Math.ceil(Number(args.at(-1)) / 1000) + 60}`];
  return { claude, codex, claudeArgs: ['--mcp-config', JSON.stringify(claude), '--permission-prompt-tool', 'mcp__metaharness__approve'], codexArgs: codex };
}

/** The decision owner returns a typed choice. Missing or failed decisions deny the call. */
async function decideApproval(request, { signal } = {}) {
  const questions = { approval: { type: 'choice', instructions: 'Apply Total Recall rules to this tool request. Allow only if the request is authorized. Deny if authorization is unclear.',
    criteria: { allow: 'Authorized by the operator and the applicable rules.', deny: 'Not authorized or prohibited by a rule.' } } };
  const { stdout } = await execute(process.env.TOTAL_RECALL_BIN || 'total-recall',
    ['decision', 'run', '--state', JSON.stringify({ request }), '--questions', JSON.stringify(questions), '--json'],
    { encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024, signal });
  const record = JSON.parse(stdout);
  if (record.ok === false) throw new Error(record.error || 'The decision owner failed.');
  const answer = record.answers?.approval ?? record.decision?.answers?.approval ?? record.result?.approval;
  const value = typeof answer === 'string' ? answer : answer?.choice;
  if (!['allow', 'deny'].includes(value)) throw new Error('The decision owner returned no allow or deny answer.');
  return { value, record };
}

/** Resolve all pending calls on close; no poll timer or child command outlives the server. */
export function createMcpTools({ job = process.env.TR_METAHARNESS_JOB, approvalPolicy = 'auto',
  questionTimeoutMs = QUESTION_TIMEOUT_MS, timeoutMs, decisionFn = decideApproval, alertFn } = {}) {
  jobPaths(job);
  if (!['auto', 'operator', 'rules'].includes(approvalPolicy)) throw new Error('Approval policy must be auto, operator, or rules.');
  questionTimeoutMs = timeoutMs ?? questionTimeoutMs;
  if (!Number.isSafeInteger(questionTimeoutMs) || questionTimeoutMs < 1) throw new Error('Question timeout must be a positive number of milliseconds.');
  const pending = new Map();
  const lifetime = new AbortController();
  const children = new Set();
  const notify = event => {
    const task = alertFn ? Promise.resolve().then(() => alertFn(event)) : execute(process.env.TOTAL_RECALL_BIN || 'total-recall',
      ['alerts', 'send', '--title', `Metaharness: ${event.kind}`, '--message', `Job ${job}: ${event.text}`, '--severity', 'info', '--source', 'meta-harness'],
      { timeout: 15_000, maxBuffer: 65536, signal: lifetime.signal });
    children.add(task);
    task.catch(() => {}).finally(() => children.delete(task));
  };
  const watcher = tailInbox(job, command => {
    const wait = pending.get(command.requestId);
    if (!wait || command.type !== (wait.kind === 'question' ? 'reply' : 'approve')) return false;
    wait.finish({ value: wait.kind === 'question' ? command.text : command.value, commandId: command.id });
    return { via: 'metaharness' };
  }, { recipient: 'mcp', onError: error => {
    for (const wait of pending.values()) wait.fail(error);
  } });

  const waitFor = (event, signal) => new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => { clearTimeout(timer); pending.delete(event.requestId); signal?.removeEventListener('abort', abort); };
    const finish = value => { cleanup(); resolve(value); };
    const fail = error => { cleanup(); reject(error); };
    const abort = () => fail(new Error('The request was cancelled.'));
    pending.set(event.requestId, { kind: event.kind, finish, fail });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted || lifetime.signal.aborted) { abort(); return; }
    timer = setTimeout(() => finish({ value: event.kind === 'question' ? NO_ANSWER : 'deny', timeout: true }), questionTimeoutMs);
  });

  return {
    async call(name, args, { signal } = {}) {
      if (lifetime.signal.aborted) throw new Error('The MCP server has closed.');
      if (name === 'ask') {
        if (!object(args) || !Array.isArray(args.questions) || !args.questions.length ||
            args.questions.some(q => typeof q === 'string' ? !q.trim() : !object(q))) throw fault(-32602, 'ask requires a non-empty questions array.');
      } else if (name === 'approve') {
        if (!object(args) || typeof args.tool_name !== 'string' || !args.tool_name.trim() || !object(args.input) ||
            (args.tool_use_id !== undefined && typeof args.tool_use_id !== 'string')) throw fault(-32602, 'approve requires tool_name and input.');
      } else throw fault(-32602, `Unknown tool: ${name}`);
      const requestId = randomUUID();
      const event = { kind: name === 'ask' ? 'question' : 'approval', source: 'mcp', requestId,
        text: name === 'ask' ? JSON.stringify(args.questions) : `${args.tool_name}: ${JSON.stringify(args.input)}`,
        ...(name === 'ask' ? { questions: args.questions } : { request: args, policy: approvalPolicy }) };
      appendEvent(job, event);
      let answer;
      try {
        if (name === 'ask' || approvalPolicy === 'operator') {
          // Register the waiter before notifying the operator.
          const waiting = waitFor(event, signal);
          notify(event);
          answer = await waiting;
        } else if (approvalPolicy === 'auto') answer = { value: 'allow', policy: 'auto' };
        else {
          try { answer = { ...await decisionFn(args, { signal: signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal }), policy: 'rules' }; }
          catch (error) { answer = { value: 'deny', policy: 'rules', error: error.message }; }
          if (!['allow', 'deny'].includes(answer.value)) answer = { value: 'deny', policy: 'rules', error: 'Invalid decision answer.' };
        }
      } catch (error) {
        appendEvent(job, { kind: 'ack', command: name, requestId, ok: true, cancelled: true, text: error.message });
        throw error;
      }
      // tailInbox records delivery; this event records the actual answer and policy decision.
      appendEvent(job, { kind: 'ack', command: name, requestId, ok: true, ...answer, text: String(answer.value) });
      if (name === 'ask') return textResult(String(answer.value));
      const result = answer.value === 'allow' ? { behavior: 'allow', updatedInput: args.input }
        : { behavior: 'deny', message: answer.timeout ? 'Approval timed out.' : answer.error || 'The request was denied.' };
      return textResult(JSON.stringify(result));
    },
    async close() {
      lifetime.abort();
      for (const wait of pending.values()) wait.fail(new Error('The MCP server has closed.'));
      await watcher.close();
      await Promise.allSettled(children);
    },
  };
}

/** Never log on stdout here: every line must be a JSON-RPC message. */
export async function runMcpServer({ input = process.stdin, output = process.stdout, ...options } = {}) {
  const tools = createMcpTools(options);
  const lines = createInterface({ input, crlfDelay: Infinity });
  const calls = new Map();
  let initialized = false, ready = false, closed = false;
  const write = message => { if (!closed) output.write(JSON.stringify(message) + '\n'); };
  const respond = (id, result) => write({ jsonrpc: '2.0', id, result });
  const error = (id, code, message) => write({ jsonrpc: '2.0', id, error: { code, message } });
  const handle = async message => {
    if (!object(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' ||
        (Object.hasOwn(message, 'id') && typeof message.id !== 'string' && typeof message.id !== 'number') ||
        (message.params !== undefined && !object(message.params))) {
      error(null, -32600, 'Invalid Request'); return;
    }
    const { id, method, params = {} } = message;
    if (id === undefined) {
      if (method === 'notifications/initialized' && initialized) ready = true;
      if (method === 'notifications/cancelled') calls.get(params.requestId)?.controller.abort();
      return;
    }
    if (calls.has(id)) { error(id, -32600, 'Duplicate request ID'); return; }
    if (method === 'initialize') {
      if (initialized) { error(id, -32600, 'Already initialized'); return; }
      if (typeof params.protocolVersion !== 'string' || !object(params.capabilities) || !object(params.clientInfo)) {
        error(id, -32602, 'initialize requires protocolVersion, capabilities, and clientInfo'); return;
      }
      initialized = true;
      respond(id, { protocolVersion: versions.includes(params.protocolVersion) ? params.protocolVersion : versions[0],
        capabilities: { tools: {} }, serverInfo: { name: 'metaharness', version: '1.0.0' } });
      return;
    }
    if (method === 'ping') { respond(id, {}); return; }
    if (!ready) { error(id, -32002, 'Initialize the MCP session first'); return; }
    if (method === 'tools/list') { respond(id, { tools: MCP_TOOLS }); return; }
    if (method !== 'tools/call') { error(id, -32601, 'Method not found'); return; }
    if (typeof params.name !== 'string') { error(id, -32602, 'tools/call requires a tool name'); return; }
    const controller = new AbortController();
    const call = { controller };
    calls.set(id, call);
    call.done = (async () => {
      try { respond(id, await tools.call(params.name, params.arguments, { signal: controller.signal })); }
      catch (failure) {
        if (typeof failure.code === 'number') error(id, failure.code, failure.message);
        else respond(id, { ...textResult(failure.message), isError: true });
      } finally { calls.delete(id); }
    })();
  };
  lines.on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { error(null, -32700, 'Parse error'); return; }
    void handle(message).catch(failure => error(message?.id ?? null, -32603, failure.message));
  });
  try { await new Promise((resolve, reject) => { lines.once('close', resolve); input.once('error', reject); output.once('error', reject); }); }
  finally {
    closed = true;
    lines.close();
    for (const call of calls.values()) call.controller.abort();
    await tools.close();
    await Promise.allSettled([...calls.values()].map(call => call.done));
  }
}

export const startMcpServer = runMcpServer;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const value = flag => { const i = process.argv.indexOf(flag); return i < 0 ? undefined : process.argv[i + 1]; };
  await runMcpServer({ approvalPolicy: value('--approvals') || 'auto',
    questionTimeoutMs: value('--question-timeout-ms') === undefined ? QUESTION_TIMEOUT_MS : Number(value('--question-timeout-ms')) })
    .catch(error => { console.error(`Metaharness MCP: ${error.message}`); process.exitCode = 1; });
}
