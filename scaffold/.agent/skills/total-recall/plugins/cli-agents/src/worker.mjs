/** Portable read-only discovery / bounded dispatch worker; streamed to SSH stdin. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const ADAPTERS = [
  { id: 'claude', name: 'Claude Code', binary: 'claude', args: ['--output-format', 'json', '--permission-mode', 'acceptEdits', '-p'], input: 'stdin', auth: ['auth', 'status'], docs: 'https://code.claude.com/docs/en/headless' },
  { id: 'codex', name: 'Codex', binary: 'codex', args: ['exec', '--sandbox', 'workspace-write', '--json', '-'], input: 'stdin', auth: ['login', 'status'], docs: 'https://developers.openai.com/codex/noninteractive' },
  { id: 'agy', name: 'Antigravity', binary: 'agy', args: ['--mode', 'accept-edits', '--sandbox', '--output-format', 'json', '-p'], input: 'argument', docs: 'https://antigravity.google/docs/cli/headless/' },
  { id: 'cursor', name: 'Cursor', binary: 'cursor-agent', args: ['--print', '--output-format', 'json'], input: 'argument', auth: ['status'], docs: 'https://docs.cursor.com/en/cli/reference/parameters' },
  { id: 'dsh', name: 'DSH', binary: 'dsh', args: ['--profile', 'headless', '--json', '-'], input: 'stdin', docs: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md' },
  { id: 'grok', name: 'Grok', binary: 'grok', args: ['--output-format', 'json', '-p'], input: 'argument', docs: 'https://docs.x.ai/build/cli/headless-scripting' },
  { id: 'muse', name: 'Muse', binary: 'muse', args: ['exec', '--json'], input: 'file', docs: 'https://dev.meta.ai/docs/muse-code/' },
  { id: 'pi', name: 'Pi', binary: 'pi', args: ['--print', '--mode', 'json', '--tools', 'read,bash', '--no-mcp', '--no-extensions'], input: 'stdin', docs: 'https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/cli.md' },
  { id: 'hermes', name: 'Hermes', binary: 'hermes', args: ['chat', '--oneshot', '--format', 'stream-json', '--query-file', '-'], input: 'stdin', docs: 'https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md' },
];

export function agentEnvironment(source = process.env) {
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

export function parseAgentResult(id, result) {
  if (result.reason || result.exitCode !== 0) return { ok: false, error: result.reason || 'Agent process failed' };
  let frames;
  try { const value = JSON.parse(result.stdout); frames = Array.isArray(value) ? value : [value]; }
  catch { try { frames = result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); } catch { return { ok: false, error: 'Agent output is not valid structured data' }; } }
  if (!frames.length || frames.some(frame => !frame || typeof frame !== 'object')) return { ok: false, error: 'Agent returned no result' };
  if (frames.some(frame => frame.error || frame.is_error || ['error', 'turn.failed'].includes(frame.type) || ['FAILED', 'ERROR', 'CANCELED', 'WAITING'].includes(frame.status))) return { ok: false, error: 'Agent reported failure' };
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
  return typeof text === 'string' && text.trim() ? { ok: true, response: text, commandExecutionVerified: false } : { ok: false, error: 'Agent did not produce a recognized completed result' };
}

/** Rebuild the instruction payload from the selected node/workspace, never a cached prompt. */
export async function totalRecallBootstrap(request, { probe = runProcess, env = process.env } = {}) {
  const binary = findBinary('total-recall', env);
  if (!binary) throw new Error('Total Recall is not installed on the selected node');
  const invoke = async args => {
    const result = await probe(binary, args, { cwd: request.cwd, timeoutMs: 120000, maxBytes: 4 * 1024 * 1024, env: agentEnvironment(env) });
    if (result.reason || result.exitCode !== 0) throw new Error(`Total Recall ${args[0]} failed; dispatch refused`);
    return result.stdout;
  };
  const actions = request.permissions?.write ? 'read,edit,test' : 'read';
  await invoke(['cli-agents','setup','--json']);
  const capsule = JSON.parse(await invoke(['context', request.prompt.slice(0,2000), '--action', actions, '--budget', '24000', '--format', 'json']));
  if (capsule.ready !== true || typeof capsule.context !== 'string') throw new Error('Required Total Recall context is not ready');
  const help = await invoke(['--help']);
  const plugins = JSON.parse(await invoke(['plugin', 'library', '--json']));
  const commands = JSON.parse(await invoke(['composable-cli', 'library', '--json']));
  const docs = JSON.parse(await invoke(['cli-agents', 'docs-ensure', '--agent', request.agent, '--json']));
  if (docs.ok !== true) throw new Error('Official agent documentation is unavailable or stale');
  return `Requester: the operator of this Total Recall workspace.\nUse Total Recall and its owning plugin CLI for this task. The following context and command inventories were obtained automatically on this node before dispatch. Official documentation is cached at ${docs.directory}. Read the applicable cached references before changing an integration.\n\nTask context:\n${capsule.context}\n\nComplete CLI help:\n${help}\n\nInstalled plugin command library:\n${JSON.stringify(plugins)}\n\nComposed command library:\n${JSON.stringify(commands)}\n\nRequested task:\n${request.prompt}`;
}

export async function inspectAgents({ probe = runProcess, env = process.env, ids } = {}) {
  const agents = [];
  for (const adapter of ADAPTERS) {
    if (ids && !ids.includes(adapter.id)) continue;
    const binary = findBinary(adapter.binary, env);
    const item = { id: adapter.id, name: adapter.name, installed: Boolean(binary), authenticated: 'unknown', executionVerified: false, docs: adapter.docs };
    if (binary) {
      const version = await probe(binary, ['--version'], { timeoutMs: 8000 });
      item.version = version.exitCode === 0 ? (version.stdout || version.stderr).match(/\b\d+\.\d+(?:\.\d+)?\b/)?.[0] || null : null;
      item.versionVerified = Boolean(item.version);
      if (adapter.auth) {
        const auth = await probe(binary, adapter.auth, { timeoutMs: 15000 });
        if (adapter.id === 'codex') item.authenticated = auth.exitCode === 0 && /Logged in using ChatGPT/i.test(auth.stdout + auth.stderr);
        if (adapter.id === 'claude') {
          try { const value = JSON.parse(auth.stdout); item.authenticated = auth.exitCode === 0 && value.loggedIn === true && value.authMethod === 'claude.ai' && value.apiProvider === 'firstParty' && !value.apiKeySource && Boolean(value.subscriptionType); } catch { item.authenticated = false; }
        }
        if (adapter.id === 'cursor') item.authenticated = auth.exitCode === 0 && /logged in|authenticated/i.test(auth.stdout) && !/not authenticated|not logged in/i.test(auth.stdout);
      }
    }
    agents.push(item);
  }
  return { agents, evidence: 'Installed version/auth metadata; actual command execution requires a separate completed run' };
}

export async function dispatchAgent(request, { probe = runProcess, env = process.env, bootstrap = totalRecallBootstrap } = {}) {
  const adapter = ADAPTERS.find(item => item.id === request.agent);
  if (!adapter || !path.isAbsolute(request.cwd || '') || typeof request.prompt !== 'string' || !request.prompt.trim() || Buffer.byteLength(request.prompt) > 65536) throw new Error('Explicit supported agent, absolute workspace and bounded prompt required');
  if (!fs.statSync(request.cwd).isDirectory()) throw new Error('Selected workspace is not a directory');
  const binary = findBinary(adapter.binary, env);
  if (!binary) throw new Error(`${adapter.name} is not installed on the selected node`);
  const inspected = await inspectAgents({ probe, env, ids: [adapter.id] });
  const state = inspected.agents.find(item => item.id === adapter.id);
  if (!state.versionVerified || state.authenticated === false) throw new Error('Selected agent version or account is not ready');
  if (state.authenticated === 'unknown' && request.allowUnknownAuth !== true) throw new Error('Selected account authentication is unknown; explicitly select this agent to verify it through execution');
  const prompt = await bootstrap(request, { probe, env });
  const args = [...adapter.args];
  const allowWrites = request.permissions?.write === true;
  if (adapter.id === 'codex') args[args.indexOf('--sandbox') + 1] = allowWrites ? 'workspace-write' : 'read-only';
  if (adapter.id === 'claude') args[args.indexOf('--permission-mode') + 1] = allowWrites ? 'acceptEdits' : 'plan';
  if (adapter.id === 'agy') args[args.indexOf('--mode') + 1] = allowWrites ? 'accept-edits' : 'plan';
  if (adapter.id === 'muse' && !allowWrites) args.push('--disable-write');
  let input = adapter.input === 'stdin' ? prompt : '', temporary;
  if (adapter.input === 'argument' || adapter.input === 'file') {
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-agent-prompt-'));
    const file = path.join(temporary, 'prompt.txt'); fs.writeFileSync(file, prompt, { mode: 0o600 });
    if (adapter.input === 'file') args.push('--prompt-file', file);
    else args.push(`Read ${file} completely before taking action. It contains the required Total Recall task context, full CLI/plugin/composed-command inventories, official documentation location and the requested task. Carry out that task using the supplied context.`);
  }
  try { return { agent: adapter.id, ...parseAgentResult(adapter.id, await probe(binary, args, { cwd: request.cwd, input, timeoutMs: 300000 })) }; }
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
  throw new Error('Unknown CLI-agent worker operation');
}
