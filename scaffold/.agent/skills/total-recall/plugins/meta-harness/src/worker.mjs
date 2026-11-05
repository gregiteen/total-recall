/** Portable read-only discovery / bounded dispatch worker; streamed to SSH stdin. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

/** These adapters can be told not to write. Any other runs read-only work only inside a disposable checkout. */
export const READ_ONLY_ADAPTERS = ['codex', 'claude', 'agy', 'muse', 'pi'];

/** The harness or node could not start the work. This says nothing about the quality of the harness. */
export function notReady(message) {
  const error = new Error(message);
  error.code = 'NOT_READY';
  return error;
}

export const ADAPTERS = [
  { id: 'claude', name: 'Claude Code', binary: 'claude', args: ['--output-format', 'json', '--permission-mode', 'acceptEdits', '-p'], input: 'stdin', auth: ['auth', 'status'], docs: 'https://code.claude.com/docs/en/headless' },
  { id: 'codex', name: 'Codex', binary: 'codex', args: ['exec', '--sandbox', 'workspace-write', '--json', '-'], input: 'stdin', auth: ['login', 'status'], docs: 'https://developers.openai.com/codex/noninteractive' },
  { id: 'agy', name: 'Antigravity', binary: 'agy', args: ['--mode', 'accept-edits', '--sandbox', '--output-format', 'json', '-p'], input: 'argument', docs: 'https://antigravity.google/docs/cli/reference' },
  { id: 'cursor', name: 'Cursor', binary: 'cursor-agent', args: ['--print', '--output-format', 'json'], input: 'argument', auth: ['status'], docs: 'https://docs.cursor.com/en/cli/reference/parameters' },
  { id: 'dsh', name: 'DSH', binary: 'dsh', args: ['--profile', 'headless', '--json', '-'], input: 'stdin', credentials: { OPENROUTER_API_KEY: ['DEVELOPER_OPENROUTER_API_KEY', 'OPENROUTER_API_KEY'] }, docs: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md' },
  { id: 'grok', name: 'Grok', binary: 'grok', args: ['--output-format', 'json', '-p'], input: 'argument', docs: 'https://docs.x.ai/build/cli/headless-scripting' },
  { id: 'muse', name: 'Muse', binary: 'muse', args: ['exec', '--json'], input: 'file', docs: 'https://dev.meta.ai/docs/muse-code/' },
  { id: 'pi', name: 'Pi', binary: 'pi', args: ['--print', '--mode', 'json', '--provider', 'openrouter', '--tools', 'read,bash', '--no-extensions'], input: 'stdin', credentials: { OPENROUTER_API_KEY: ['DEVELOPER_OPENROUTER_API_KEY', 'OPENROUTER_API_KEY'] }, docs: 'https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/cli.md' },
  { id: 'hermes', name: 'Hermes', binary: 'hermes', args: ['chat', '--oneshot', '--format', 'stream-json', '--query-file', '-'], input: 'stdin', docs: 'https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md' }
];

export const EXTENDED_ADAPTERS = [
  { id: 'ollama', name: 'Ollama', binary: 'ollama', args: ['run'], input: 'stdin', docs: 'https://ollama.com/library' },
  { id: 'openclaw', name: 'OpenClaw', binary: 'openclaw', args: ['agent', '--message'], input: 'argument', docs: 'https://openclaw.ai/docs' },
  { id: 'aider', name: 'Aider', binary: 'aider', args: ['--yes', '--message'], input: 'argument', docs: 'https://aider.chat/docs' },
  { id: 'goose', name: 'Goose', binary: 'goose', args: ['run', '--text'], input: 'argument', docs: 'https://block.github.io/goose/' },
  { id: 'openhands', name: 'OpenHands', binary: 'openhands', args: ['run'], input: 'argument', docs: 'https://docs.openhands.dev/' },
  { id: 'cline', name: 'Cline', binary: 'cline', args: ['task', '--json'], input: 'argument', docs: 'https://cline.bot/docs' }
];

export function getCustomAdaptersDirs() {
  const brain = process.env.TR_SECRETS_BRAIN || path.join(process.env.AGENT_DIR || path.join(os.homedir(), '.agent'), 'skills/total-recall');
  return [
    path.join(brain, 'config/harnesses'),
    path.join(process.cwd(), '.meta-harness/adapters')
  ];
}

export function loadCustomAdapters() {
  const custom = [];
  for (const dir of getCustomAdaptersDirs()) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.json')) continue;
        const fullPath = path.join(dir, file);
        try {
          const spec = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
          if (spec && typeof spec.id === 'string' && typeof spec.binary === 'string') {
            custom.push({
              id: spec.id,
              name: spec.name || spec.id,
              binary: spec.binary,
              args: Array.isArray(spec.args) ? spec.args : ['-p'],
              input: spec.input || 'argument',
              docs: spec.docs || null,
              custom: true,
              sourcePath: fullPath
            });
          }
        } catch {}
      }
    } catch {}
  }
  return custom;
}

export function getActiveAdapters() {
  const custom = loadCustomAdapters();
  const map = new Map();
  for (const a of ADAPTERS) map.set(a.id, a);
  for (const e of EXTENDED_ADAPTERS) map.set(e.id, e);
  for (const c of custom) map.set(c.id, { ...map.get(c.id), ...c });
  return Array.from(map.values());
}

export function agentEnvironment(source = process.env) {
  // Provider keys are never ambient. An adapter that needs one declares it under `credentials`.
  const allowed = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'TERM', 'SYSTEMROOT', 'SystemRoot', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'DSH_HOME', 'HERMES_HOME', 'PI_CODING_AGENT_DIR'];
  return Object.fromEntries(allowed.filter(key => typeof source[key] === 'string').map(key => [key, source[key]]));
}

export function findBinary(name, env = process.env) {
  const home = env.HOME || env.USERPROFILE || os.homedir();
  const installed = [path.dirname(process.execPath), path.join(home, '.local/bin'), path.join(home, '.npm-global/bin'), path.join(home, 'bin')];
  const versions = path.join(home, '.nvm/versions/node');
  try { for (const version of fs.readdirSync(versions).sort().reverse()) installed.push(path.join(versions, version, 'bin')); } catch {}
  for (const dir of [...new Set([...(env.PATH || '').split(path.delimiter), ...installed].filter(Boolean))]) {
    const file = path.join(dir, name);
    try { if (fs.statSync(file).isFile()) { fs.accessSync(file, fs.constants.X_OK); return file; } } catch {}
  }
  return null;
}

export function runProcess(binary, args, { cwd, input = '', timeoutMs = 300000, env = agentEnvironment(), maxBytes = 2 * 1024 * 1024 } = {}) {
  return new Promise(resolve => {
    let stdout = '', stderr = '', bytes = 0, reason = null, child, timer, escalation, settled = false;
    const kill = signal => { try { if (process.platform !== 'win32') process.kill(-child.pid, signal); else child.kill(signal); } catch {} };
    const finish = (exitCode, signal) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      // A parent can exit on TERM while a descendant still holds the process group.
      // Finish the owned group cleanup before releasing an aborted operation.
      if (reason && escalation) {
        clearTimeout(escalation);
        escalation = setTimeout(() => { kill('SIGKILL'); resolve({ exitCode, signal, stdout, stderr, reason }); }, 500);
      } else resolve({ exitCode, signal, stdout, stderr, reason });
    };
    const stop = cause => { if (reason) return; reason = cause; kill('SIGTERM'); escalation = setTimeout(() => kill('SIGKILL'), 500); };
    try { child = spawn(binary, args, { cwd, env, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch { finish(null); return; }
    timer = setTimeout(() => stop('timeout'), timeoutMs);
    child.on('error', () => { reason = 'spawn-error'; finish(null); });
    child.stdin.on('error', () => {});
    for (const [stream, output] of [[child.stdout, true], [child.stderr, false]]) stream.on('data', chunk => {
      const part = chunk.subarray(0, Math.max(0, maxBytes - bytes)).toString(); bytes += chunk.length;
      if (output) stdout += part; else stderr += part;
      if (bytes > maxBytes) stop('output-limit');
    });
    child.on('close', finish); child.stdin.end(input);
  });
}

const frameReason = frame => frame.finished_reason || frame.status || frame.type || null;
/** Turn "Resets in 119h40m44s" or "try again at 6:24 PM" into an instant. Returns null when no time is stated. */
export function parseResetTime(text, now = new Date()) {
  const span = String(text).match(/resets? in\s+(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?/i);
  if (span && (span[1] || span[2] || span[3])) return new Date(now.getTime() + ((+span[1] || 0) * 3600 + (+span[2] || 0) * 60 + (+span[3] || 0)) * 1000).toISOString();
  const clock = String(text).match(/try again at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (clock) {
    const at = new Date(now); at.setSeconds(0, 0);
    at.setHours((+clock[1] % 12) + (/pm/i.test(clock[3]) ? 12 : 0), +clock[2] || 0);
    if (at <= now) at.setDate(at.getDate() + 1);
    return at.toISOString();
  }
  return null;
}
export function classifyFailure(message, now) {
  const text = String(message || '');
  if (/resource_exhausted|quota|usage limit|rate.?limit|too many requests|\b429\b|out of credits|insufficient credits/i.test(text)) return { failureKind: 'quota', resetsAt: parseResetTime(text, now) };
  if (/not logged in|not authenticated|unauthenticated|please (log|sign) in|\b401\b|invalid api key|missing_credential|no api key/i.test(text)) return { failureKind: 'auth' };
  return { failureKind: 'agent' };
}
function frameError(frame) {
  const value = frame.error ?? (frame.is_error ? frame.result : undefined) ?? (frame.type === 'error' ? frame.message : undefined);
  return typeof value === 'string' ? value : value?.message || null;
}
function agentFailure(message, stderr = '') {
  const error = String(message || stderr || 'Agent reported failure').trim().slice(0, 500);
  return { ok: false, error, ...classifyFailure(`${error}\n${stderr}`) };
}
const PLAIN_TEXT_ADAPTERS = ['ollama', 'openclaw', 'aider', 'goose', 'openhands', 'cline'];
export function parseAgentResult(id, result) {
  const stderr = String(result.stderr || '').trim().slice(-2000);
  if (result.reason) return { ok: false, error: result.reason, failureKind: 'process' };
  if (PLAIN_TEXT_ADAPTERS.includes(id) || loadCustomAdapters().some(c => c.id === id)) {
    if (result.exitCode !== 0) return agentFailure(null, stderr || `Agent process exited ${result.exitCode}`);
    const text = String(result.stdout || '').trim();
    return text ? { ok: true, response: text, commandExecutionVerified: false } : { ok: false, error: 'Agent returned no result', failureKind: 'agent' };
  }
  let frames;
  try { const value = JSON.parse(result.stdout); frames = Array.isArray(value) ? value : [value]; }
  catch {
    try { frames = String(result.stdout).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
    catch { return result.exitCode === 0 ? { ok: false, error: 'Agent output is not valid structured data', failureKind: 'agent' } : agentFailure(null, stderr || `Agent process exited ${result.exitCode}`); }
  }
  frames = (frames || []).filter(frame => frame && typeof frame === 'object');
  const failed = frames.find(frame => frameError(frame) || frame.is_error || ['error', 'turn.failed'].includes(frame.type) || ['FAILED', 'ERROR', 'CANCELED', 'WAITING'].includes(frame.status) || ['print_timeout', 'interrupted', 'error'].includes(frame.finished_reason));
  if (failed) return agentFailure(frameError(failed) || frameReason(failed), stderr);
  if (result.exitCode !== 0) return agentFailure(null, stderr || `Agent process exited ${result.exitCode}`);
  if (!frames.length) return { ok: false, error: 'Agent returned no result', failureKind: 'agent' };
  const last = frames.at(-1);
  let text;
  if (id === 'codex' && last.type === 'turn.completed') text = frames.filter(frame => frame.type === 'item.completed' && frame.item?.type === 'agent_message').map(frame => frame.item.text).join('\n');
  if (['claude', 'cursor', 'grok'].includes(id) && last.type === 'result' && last.subtype === 'success') text = last.result;
  if (id === 'agy' && last.status === 'SUCCESS') text = last.response;
  if (id === 'dsh' && last.type === 'final') text = last.text;
  if (id === 'hermes' && last.type === 'result' && last.exit_code === 0) text = last.text;
  if (id === 'pi' && last.type === 'agent_end') {
    const messages = last.messages || [];
    if (messages.some(message => ['error', 'aborted'].includes(message.stopReason))) return { ok: false, error: 'Pi turn failed' };
    text = messages.filter(message => message.role === 'assistant').flatMap(message => message.content || []).filter(part => part.type === 'text').map(part => part.text).join('\n');
  }
  // The official headless contract documents JSONL plus exit status, not MSP
  // notifications. Preserve the actual log rather than invent a headless schema.
  // Exit zero certifies a finished turn only; it never certifies the requested work.
  if (id === 'muse') return { ok: true, response: result.stdout.trim(), events: frames, completionEvidence: 'headless-process-exit', commandExecutionVerified: false };
  return typeof text === 'string' && text.trim() ? { ok: true, response: text, commandExecutionVerified: false } : { ok: false, error: 'Agent did not produce a recognized completed result', failureKind: 'agent' };
}

/** Rebuild the instruction payload from the selected node/workspace, never a cached prompt. */
export async function totalRecallBootstrap(request, { probe = runProcess, env = process.env } = {}) {
  const binary = findBinary('total-recall', env);
  if (!binary) throw notReady('Total Recall is not installed on the selected node');
  // Rules come from the operator's project, even when the agent itself works in a temporary worktree.
  const cwd = request.contextCwd || request.cwd;
  const invoke = async args => {
    const result = await probe(binary, args, { cwd, timeoutMs: 120000, maxBytes: 4 * 1024 * 1024, env: agentEnvironment(env) });
    if (result.reason || result.exitCode !== 0) {
      let detail = String(result.stderr || '').trim();
      try { detail = JSON.parse(result.stdout).problems?.join('; ') || detail; } catch { /* plain output */ }
      throw notReady(`Total Recall ${args[0]} failed in ${cwd}, so dispatch was refused${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    }
    return result.stdout;
  };
  const actions = request.permissions?.write ? 'read,edit,test' : 'read';
  const task = String(request.contextTask || request.prompt).slice(0, 2000);
  const capsule = JSON.parse(await invoke(['context', task, '--action', actions, '--budget', '24000', '--format', 'json']));
  if (capsule.ready !== true || typeof capsule.context !== 'string') throw notReady('Required Total Recall context is not ready');
  await invoke(['preflight', 'ack', '--task', task, '--action', actions, '--json']);
  const help = await invoke(['--help']);
  const plugins = JSON.parse(await invoke(['plugin', 'library', '--json']));
  const commands = JSON.parse(await invoke(['composable-cli', 'library', '--json']));
  const docs = JSON.parse(await invoke(['meta-harness', 'docs-ensure', '--agent', request.agent, '--json']));
  if (docs.ok !== true) throw notReady('Official agent documentation is unavailable or stale');
  return `Requester: the operator of this Total Recall workspace.\nUse Total Recall and its owning plugin CLI for this task. The following context and command inventories were obtained automatically on this node before dispatch. Official documentation is cached at ${docs.directory}. Read the applicable cached references before changing an integration.\n\nTask context:\n${capsule.context}\n\nComplete CLI help:\n${help}\n\nInstalled plugin command library:\n${JSON.stringify(plugins)}\n\nComposed command library:\n${JSON.stringify(commands)}\n\nRequested task:\n${request.prompt}`;
}

/** Authentication is `true` or `false` only when a real probe says so. Everything else stays 'unknown' until a run proves it. */
export async function inspectAgents({ probe = runProcess, env = process.env, ids } = {}) {
  const agents = [];
  for (const adapter of getActiveAdapters()) {
    if (ids && !ids.includes(adapter.id)) continue;
    const binary = findBinary(adapter.binary, env);
    const item = { id: adapter.id, name: adapter.name, installed: Boolean(binary), authenticated: binary ? 'unknown' : false, executionVerified: false, docs: adapter.docs };
    if (binary) {
      const version = await probe(binary, ['--version'], { timeoutMs: 8000 });
      item.version = version.exitCode === 0 ? (version.stdout || version.stderr).match(/\b\d+\.\d+(?:\.\d+)?\b/)?.[0] || null : null;
      item.versionVerified = Boolean(item.version);
      if (adapter.id === 'codex') {
        const auth = await probe(binary, ['login', 'status'], { timeoutMs: 15000 });
        item.authenticated = auth.exitCode === 0 && /Logged in using ChatGPT/i.test(auth.stdout + auth.stderr);
      } else if (adapter.id === 'claude') {
        const auth = await probe(binary, ['auth', 'status'], { timeoutMs: 15000 });
        try { const value = JSON.parse(auth.stdout); item.authenticated = auth.exitCode === 0 && value.loggedIn === true && value.authMethod === 'claude.ai' && value.apiProvider === 'firstParty' && !value.apiKeySource && Boolean(value.subscriptionType); } catch { item.authenticated = false; }
      } else if (adapter.id === 'cursor') {
        const auth = await probe(binary, ['status'], { timeoutMs: 15000 });
        item.authenticated = auth.exitCode === 0 && /logged in|authenticated/i.test(auth.stdout) && !/not authenticated|not logged in/i.test(auth.stdout);
      } else if (adapter.id === 'ollama') {
        const list = await probe(binary, ['list'], { timeoutMs: 5000 });
        item.authenticated = list.exitCode === 0;
        // Embedding models cannot take a task. Without a chat model this runtime cannot be dispatched.
        const names = String(list.stdout || '').split('\n').slice(1).map(line => line.trim().split(/\s+/)[0]).filter(Boolean);
        item.chatModels = names.filter(name => !/embed|bge-|minilm|rerank/i.test(name));
        if (!item.chatModels.length) item.blockedBy = 'no-chat-model';
      }
    }
    agents.push(item);
  }
  return { agents, evidence: 'Version and login probes only; actual execution requires a completed run' };
}

export async function dispatchAgent(request, { probe = runProcess, env = process.env, bootstrap = totalRecallBootstrap } = {}) {
  const adapter = getActiveAdapters().find(item => item.id === request.agent);
  if (!adapter || !path.isAbsolute(request.cwd || '') || typeof request.prompt !== 'string' || !request.prompt.trim() || Buffer.byteLength(request.prompt) > 65536) throw new Error('Explicit supported agent, absolute workspace and bounded prompt required');
  if (!fs.statSync(request.cwd).isDirectory()) throw new Error('Selected workspace is not a directory');
  const binary = findBinary(adapter.binary, env);
  if (!binary) throw notReady(`${adapter.name} is not installed on the selected node`);
  const inspected = await inspectAgents({ probe, env, ids: [adapter.id] });
  const state = inspected.agents.find(item => item.id === adapter.id);
  if (!state.versionVerified) throw notReady(`${adapter.name} did not report a version`);
  if (state.authenticated === false) throw notReady(`${adapter.name} is not signed in on this node`);
  if (state.blockedBy === 'no-chat-model') throw notReady(`${adapter.name} has no chat model installed on this node`);
  if (state.authenticated === 'unknown' && request.allowUnknownAuth !== true) throw notReady(`${adapter.name} has no login probe; select it explicitly to verify it through execution`);
  if (request.permissions?.write !== true && !READ_ONLY_ADAPTERS.includes(adapter.id) && request.isolated !== true) throw notReady(`${adapter.name} has no read-only mode, so a read-only run must use a disposable checkout`);
  const prompt = await bootstrap(request, { probe, env });
  const credentials = {};
  for (const [name, candidates] of Object.entries(adapter.credentials || {})) {
    const auth = findBinary('total-recall', env);
    let value = null;
    for (const secret of candidates) {
      const result = auth ? await probe(auth, ['auth', 'secret', 'get', secret], { timeoutMs: 15000, env }) : { exitCode: 1 };
      if (result.exitCode === 0 && String(result.stdout).trim()) { value = String(result.stdout).trim(); break; }
    }
    if (!value) throw notReady(`${adapter.name} needs ${name}, and the auth store has none of: ${candidates.join(', ')}`);
    credentials[name] = value;
  }
  const args = [...adapter.args];
  const allowWrites = request.permissions?.write === true;
  if (adapter.id === 'codex') args[args.indexOf('--sandbox') + 1] = allowWrites ? 'workspace-write' : 'read-only';
  if (adapter.id === 'claude') args[args.indexOf('--permission-mode') + 1] = allowWrites ? 'acceptEdits' : 'plan';
  if (adapter.id === 'agy') args[args.indexOf('--mode') + 1] = allowWrites ? 'accept-edits' : 'plan';
  if (adapter.id === 'muse' && !allowWrites) args.push('--disable-write');
  if (adapter.id === 'pi') args[args.indexOf('--tools') + 1] = allowWrites ? 'read,bash,edit,write' : 'read';
  if (adapter.id === 'ollama') args.push(env.TR_OLLAMA_MODEL || state.chatModels[0]);
  let input = adapter.input === 'stdin' ? prompt : '', temporary;
  if (adapter.input === 'argument' || adapter.input === 'file') {
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-harness-prompt-'));
    const file = path.join(temporary, 'prompt.txt'); fs.writeFileSync(file, prompt, { mode: 0o600 });
    if (adapter.input === 'file') args.push('--prompt-file', file);
    else args.push(`Read ${file} completely before taking action. It contains the required Total Recall task context, full CLI/plugin/composed-command inventories, official documentation location and the requested task. Carry out that task using the supplied context.`);
  }
  try { return { agent: adapter.id, ...parseAgentResult(adapter.id, await probe(binary, args, { cwd: request.cwd, input, timeoutMs: request.timeoutMs || 900000, env: { ...agentEnvironment(env), ...credentials } })) }; }
  finally { if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); }
}

export async function runWorker(request) {
  if (request.operation === 'inspect') return { ...await inspectAgents(), defaultCwd: os.homedir() };
  if (request.operation === 'dispatch') return dispatchAgent(request);
  if (request.operation === 'direct') {
    if (!path.isAbsolute(request.cwd || '') || !Array.isArray(request.argv) || request.argv.some(arg => typeof arg !== 'string')) throw new Error('Explicit workspace and argv required');
    const binary = findBinary('total-recall');
    if (!binary) throw new Error('Total Recall CLI is not installed on the selected node');
    const result = await runProcess(binary, request.argv.slice(1), { cwd: request.cwd });
    return { ok: result.exitCode === 0 && !result.reason, output: result.stdout, error: result.reason || (result.exitCode ? 'CLI command failed' : undefined), exitCode: result.exitCode, commandExecutionVerified: result.exitCode === 0 && !result.reason };
  }
  throw new Error('Unknown meta-harness worker operation');
}
