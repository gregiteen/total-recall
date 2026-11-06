/**
 * The OpenClaw side of the Total Recall gate. It decides nothing: it asks
 * `total-recall preflight gate --harness openclaw` about each tool call and carries the answer.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

const GATE_ARGS = ['preflight', 'gate', '--harness', 'openclaw'];
/** OpenClaw blocks a call whose hook runs out of time, so the gate's limit sits inside the hook's. */
export const GATE_TIMEOUT_MS = 8000;
export const HOOK_TIMEOUT_MS = 10000;
/** A block ends the call, so the gate runs before any other plugin's hook. */
const HOOK_PRIORITY = 1000;
const MAX_HELD_NOTES = 200;

/** The gate reads these. A tool's other params, such as file contents, stay out of its process. */
const PARAMS_THE_GATE_READS = ['command', 'workdir', 'path', 'file_path', 'filePath'];
const KEPT_ENV = ['HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'AGENT_DIR'];
const KEPT_ENV_PREFIXES = ['TR_', 'TOTAL_RECALL_'];
const NEVER_KEPT_ENV = new Set(['TR_SECRETS_PASSWORD']);

const PLAIN_TR = /^(cd\s+\S+\s*&&\s*)?(npx\s+)?total-recall\s/;

/** One Total Recall command with nothing chained after it. Mirrors core's isPlainTotalRecall. */
function isPlainTotalRecall(command) {
  const text = String(command || '').trim();
  if (!PLAIN_TR.test(text)) return false;
  const runnable = text.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, "''").replace(PLAIN_TR, '');
  return !/[;&|`\n<>]|\$\(/.test(runnable);
}

/** The gateway holds model and channel keys, and the gate needs none of them. */
export function gateEnv(settings = {}, env = process.env) {
  const kept = {};
  for (const key of KEPT_ENV) if (env[key]) kept[key] = env[key];
  for (const [key, value] of Object.entries(env)) {
    if (KEPT_ENV_PREFIXES.some((prefix) => key.startsWith(prefix)) && !NEVER_KEPT_ENV.has(key)) kept[key] = value;
  }
  kept.PATH = [...(settings.path || []), env.PATH].filter(Boolean).join(path.delimiter);
  return kept;
}

/** A subagent's session key, as OpenClaw writes it: agent:<id>:subagent:<uuid>. */
export function isSubagentSession(sessionKey) {
  return typeof sessionKey === 'string' && /(^|:)subagent:/.test(sessionKey);
}

/**
 * The call as the gate reads it. `ctx.agentId` names the configured agent, such as `main`, on every
 * call, so it must never reach the gate as `agent_id`, which would mark every call a subagent's.
 */
export function payloadFor(event = {}, ctx = {}, cwd) {
  const params = {};
  for (const key of PARAMS_THE_GATE_READS) {
    if (event.params?.[key] !== undefined) params[key] = event.params[key];
  }
  const payload = { event: 'before_tool_call', toolName: event.toolName, params, cwd };
  const toolKind = event.toolKind || ctx.toolKind;
  if (toolKind) payload.toolKind = toolKind;
  if (event.derivedPaths?.length) payload.derivedPaths = [...event.derivedPaths];
  const session = ctx.sessionId || ctx.sessionKey;
  if (session) payload.session_id = session;
  if (isSubagentSession(ctx.sessionKey)) payload.agent_id = ctx.sessionKey;
  return payload;
}

function reasonFrom(stderr) {
  const lines = String(stderr || '').split('\n').map((line) => line.trim()).filter(Boolean);
  return (lines.find((line) => /error/i.test(line)) || lines.at(-1) || '').slice(0, 300);
}

/** What one run of the gate said, or `failed` when it reached no decision. */
export function readAnswer(code, stdout, stderr) {
  let answer = null;
  try { answer = JSON.parse(stdout); } catch { /* no decision on stdout */ }
  if (answer?.block === true || answer?.decision === 'deny') {
    return { block: true, reason: answer.blockReason || answer.reason || reasonFrom(stderr) || 'The Total Recall gate denied this call.' };
  }
  if (code === 0) return { block: false, warning: typeof answer?.warning === 'string' ? answer.warning : null };
  if (code === 2) return { block: true, reason: reasonFrom(stderr) || 'The Total Recall gate denied this call.' };
  return { failed: reasonFrom(stderr) || `it exited with ${code ?? 'a signal'} and gave no decision` };
}

/** Never rejects. A real process, so a call never waits on the gateway's event loop. */
export function askGate(command, payload, { env, signal, timeoutMs = GATE_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer = null;
    const finish = (answer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(answer);
    };
    let child;
    try {
      child = spawn(command, GATE_ARGS, { env, signal, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      finish({ failed: err.message });
      return;
    }
    timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ failed: `no answer within ${timeoutMs} ms` });
    }, timeoutMs);
    child.on('error', (err) => finish({ failed: err.message }));
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdin.on('error', () => { /* it exited first, and `close` reports that */ });
    child.on('close', (code) => finish(readAnswer(code, stdout, stderr)));
    child.stdin.end(JSON.stringify(payload));
  });
}

function inside(target, from, folder) {
  if (!folder || typeof target !== 'string' || !target) return false;
  const full = path.resolve(from, target);
  return full === folder || full.startsWith(`${folder}${path.sep}`);
}

/**
 * The gate could not run, so core's `whenGateFails` never ran either, and OpenClaw blocks a hook
 * that throws. The same rule lives here: work stays denied, and what can repair the gate stays open.
 */
export function whenGateCannotRun(event = {}, cwd, why, settings = {}) {
  const { open = [], shell = [], write = [] } = settings.tools || {};
  const name = event.toolName;
  const params = event.params || {};
  const from = typeof params.workdir === 'string' && params.workdir.trim() ? path.resolve(cwd, params.workdir) : cwd;
  const repairs = open.includes(name)
    || (shell.includes(name) && (isPlainTotalRecall(params.command) || inside(from, cwd, settings.package)))
    || (write.includes(name) && [params.path, params.file_path, params.filePath, ...(event.derivedPaths || [])].some((target) => inside(target, cwd, settings.package)));
  if (repairs) return undefined;
  const scope = settings.package ? `, plain Total Recall commands and changes inside ${settings.package}` : ' and plain Total Recall commands';
  return {
    block: true,
    blockReason: `TR-PREFLIGHT gate could not run: ${why}. The gate fails closed. Reading${scope} stay open so it can be repaired. An operator on this machine can also run: openclaw plugins disable total-recall-gate`,
  };
}

/** The agent's real workspace. The hook context has no working folder, and the gateway's own is not it. */
function workspaceOf(api, ctx) {
  const agentId = ctx?.agentId || /^agent:([^:]+):/.exec(ctx?.sessionKey || '')?.[1] || 'main';
  try {
    return api.runtime.agent.resolveAgentWorkspaceDir(api.config, agentId) || process.cwd();
  } catch {
    return process.cwd();
  }
}

export function registerGate(api, settings = {}) {
  const command = settings.command || 'total-recall';
  const env = gateEnv(settings);
  const held = new Map();

  const hold = (key, note) => {
    if (!key) return;
    if (held.size >= MAX_HELD_NOTES && !held.has(key)) held.delete(held.keys().next().value);
    held.set(key, held.has(key) ? `${held.get(key)} ${note}` : note);
  };
  const take = (...keys) => {
    for (const key of keys) {
      if (key && held.has(key)) {
        const note = held.get(key);
        held.delete(key);
        return note;
      }
    }
    return null;
  };

  api.on('before_tool_call', async (event, ctx) => {
    let cwd = process.cwd();
    try {
      cwd = workspaceOf(api, ctx);
      const answer = await askGate(command, payloadFor(event, ctx, cwd), { env, signal: ctx?.abortSignal });
      if (answer.failed) {
        api.logger?.warn?.(`Total Recall gate could not run: ${answer.failed}`);
        return whenGateCannotRun(event, cwd, answer.failed, settings);
      }
      if (answer.block) return { block: true, blockReason: answer.reason };
      if (answer.warning) hold(event.toolCallId || ctx?.toolCallId || ctx?.sessionKey || ctx?.sessionId, answer.warning);
      return undefined;
    } catch (err) {
      api.logger?.warn?.(`Total Recall gate could not run: ${err.message}`);
      return whenGateCannotRun(event, cwd, err.message, settings);
    }
  }, { priority: HOOK_PRIORITY, timeoutMs: HOOK_TIMEOUT_MS });

  // The hook has no text field that lets a tool run, so a warning travels with the tool's result.
  try {
    api.registerAgentToolResultMiddleware((event, ctx) => {
      const note = take(event.toolCallId, ctx?.sessionKey, ctx?.sessionId);
      if (!note) return undefined;
      const content = Array.isArray(event.result?.content) ? event.result.content : [];
      return { result: { ...event.result, content: [...content, { type: 'text', text: note }] } };
    });
  } catch (err) {
    api.logger?.warn?.(`Total Recall gate cannot deliver warnings: ${err.message}`);
  }

  api.logger?.info?.(`Total Recall gate asks ${command}`);
}
