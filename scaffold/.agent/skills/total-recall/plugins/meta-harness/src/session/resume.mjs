/** One-shot harness sessions. Portable: this module uses Node built-ins only. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';

// Match the one-shot adapters in worker.mjs. Callers can supply their prepared
// args (model, permissions and provider settings), without the prompt operand.
const COMMANDS = {
  agy: ['--mode', 'accept-edits', '--sandbox', '--output-format', 'json', '-p'],
  cursor: ['--print', '--output-format', 'json'],
  dsh: ['--profile', 'headless', '--json', '-'],
  grok: ['--output-format', 'json', '-p'],
  muse: ['exec', '--json'],
  pi: ['--print', '--mode', 'json', '--provider', 'openrouter', '--tools', 'read,bash', '--no-extensions'],
  hermes: ['chat', '--oneshot', '--format', 'stream-json', '--query-file', '-'],
  openclaw: ['agent', '--message'],
  aider: ['--yes', '--message'],
  goose: ['run', '--text'],
  openhands: ['run'],
  cline: ['task', '--json'],
  ollama: ['run'],
};
const STDIN = new Set(['dsh', 'pi', 'hermes', 'ollama']);
const PLAIN = new Set(['ollama', 'aider', 'goose', 'openhands', 'cline']);
// Verified 2026-11-09. No "latest" selectors: parallel jobs must not share state.
// antigravity.google/docs/cli/reference/; cursor.com/docs/cli/reference/parameters
// docs.x.ai/build/cli/reference; dev.meta.ai/docs/muse-code/extending
// github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/cli.md
// github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md
// docs.openclaw.ai/cli/agent; aider.chat/docs/config/options.html
// goose-docs.ai/docs/guides/goose-cli-commands/
// github.com/OpenHands/OpenHands-CLI; github.com/cline/cline/blob/main/docs/cli/cli-reference.mdx
const SELECTOR = { agy: '--conversation', cursor: '--resume', grok: '--resume',
  muse: '--session-id', pi: '--session', hermes: '--resume', openclaw: '--session-id',
  cline: '--id', openhands: '--resume' };
const emptyUsage = () => ({ inputTokens: null, outputTokens: null, costUsd: null });
const number = (...values) => values.find(value => typeof value === 'number' && Number.isFinite(value) && value >= 0) ?? null;
const sumUsage = (a, b) => Object.fromEntries(Object.keys(a).map(key => [key,
  a[key] === null && b[key] === null ? null : (a[key] ?? 0) + (b[key] ?? 0)]));
const usageOf = value => ({
  inputTokens: number(value?.inputTokens, value?.input_tokens, value?.input),
  outputTokens: number(value?.outputTokens, value?.output_tokens, value?.output),
  costUsd: number(value?.costUsd, value?.cost_usd, value?.total_cost_usd, value?.cost?.total),
});
const textOf = content => typeof content === 'string' ? content : Array.isArray(content)
  ? content.filter(part => part?.type === 'text').map(part => part.text || '').join('\n') : '';
const errorText = value => typeof value === 'string' ? value : value?.message;
const failureKind = text => /quota|rate.?limit|resource_exhausted|\b429\b|insufficient credits/i.test(text) ? 'quota'
  : /not logged in|unauthenticated|\b401\b|invalid api key/i.test(text) ? 'auth' : 'agent';

/**
 * `args` are the existing one-shot command, before prompt injection. Unknown
 * adapters may pass { id, input } as harness. Their controls stay unsupported.
 * Queued replies are returned in done.pendingMessages and job.pendingMessages,
 * so the next attempt can carry them without pretending they were delivered.
 */
export function createResumeDriver({ harness, binary, args = [], cwd, env, job,
  options = {}, onEvent = () => {}, onFrame = () => {}, spawnFn = spawn }) {
  for (const key of ['maxTurns', 'maxTokens', 'maxBudgetUsd']) {
    const value = options[key];
    if (value != null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
        (key !== 'maxBudgetUsd' && !Number.isInteger(value)))) throw new Error(`Invalid ${key}.`);
  }
  const id = typeof harness === 'string' ? harness : harness?.id;
  const inputMode = harness?.input || (STDIN.has(id) ? 'stdin' : id === 'muse' ? 'file' : 'argument');
  const baseArgs = [...(args.length ? args : COMMANDS[id] || [])];
  const knownResume = Boolean(SELECTOR[id] || ['aider', 'goose'].includes(id));
  const canFork = ['grok', 'pi'].includes(id);
  const pendingMessages = Array.isArray(job?.pendingMessages)
    ? job.pendingMessages.filter(item => typeof item?.text === 'string').map(item => ({ ...item })) : [];
  let sessionId = options.sessionId || null, active = null, settled = false, closed = false, closeRequested = false;
  let started = false, directory, totalUsage = emptyUsage(), totalTurns = 0, limitError;
  let resolveDone, controls = Promise.resolve(), lastResponse;
  let done = new Promise(resolve => { resolveDone = resolve; });
  const capabilities = { reply: 'unsupported', interrupt: 'metaharness', answer: 'unsupported',
    fork: 'unsupported', goal: 'unsupported', limits: 'metaharness', schema: 'unsupported', review: 'unsupported' };
  const emit = event => { try { onEvent(event); } catch { /* A view cannot stop a job. */ } };
  const refresh = () => {
    const resume = knownResume && Boolean(sessionId);
    capabilities.reply = capabilities.answer = resume ? 'metaharness' : 'unsupported';
    capabilities.fork = resume && canFork ? 'metaharness' : 'unsupported';
  };
  const setSession = value => {
    if (typeof value !== 'string' || !value) return;
    active?.sessionReady?.(value);
    if (value === sessionId) return;
    sessionId = value; refresh();
    emit({ kind: 'session', text: `${id} session ${value}`, sessionId: value, session: value });
  };
  const resultUsage = () => sumUsage(totalUsage, active?.usage || emptyUsage());
  const finish = result => {
    if (settled) return;
    settled = true;
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
    const value = { response: null, structured: null, error: null, failureKind: null, ...result,
      sessionId, usage: resultUsage(), ...(pendingMessages.length ? { pendingMessages: [...pendingMessages] } : {}) };
    lastResponse = value.response;
    emit({ kind: 'finish', text: value.ok ? 'Finished' : value.error, ...value });
    resolveDone(value);
  };
  const serialize = action => {
    const next = controls.then(action);
    controls = next.catch(() => {});
    return next;
  };
  const checkOpen = () => { if (closed || closeRequested || settled) throw new Error('The session is closed.'); };
  const signal = (run, name) => {
    try {
      if (process.platform !== 'win32' && run.child.pid) process.kill(-run.child.pid, name);
      else run.child.kill(name);
    } catch { /* It may have exited. */ }
  };
  const stop = async reason => {
    const run = active;
    if (!run || run.exited) return;
    run.stopReason ||= reason;
    signal(run, 'SIGTERM');
    // Wait for close (all output drained) before a replacement can start.
    // Harnesses write their final result (session id, usage) after SIGTERM; give them time on a busy machine.
    const timer = setTimeout(() => signal(run, 'SIGKILL'), options.stopGraceMs ?? 5000);
    try { await run.exit; } finally {
      clearTimeout(timer);
      // A descendant can keep running after its parent exits on SIGTERM.
      if (process.platform !== 'win32') signal(run, 'SIGKILL');
    }
  };
  const checkLimits = () => {
    const usage = resultUsage();
    const turns = totalTurns + (active?.turns || 0);
    const cap = options.maxTokens != null && (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) >= options.maxTokens ? 'token'
      : options.maxBudgetUsd != null && (usage.costUsd ?? 0) >= options.maxBudgetUsd ? 'budget'
      : options.maxTurns != null && turns >= options.maxTurns ? 'turn' : null;
    if (cap && !limitError) {
      limitError = `Metaharness ${cap} limit reached.`;
      void stop('limit').then(() => finish({ ok: false, error: limitError, failureKind: 'limit' }));
    }
    return Boolean(limitError);
  };
  const frame = (run, value) => {
    onFrame(value);
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const item of value) frame(run, item); return; }
    run.frames.push(value);
    const agentMeta = value.result?.meta?.agentMeta || value.meta?.agentMeta || value.payload?.meta?.agentMeta;
    setSession(value.session_id || value.sessionId || value.conversation_id || value.conversationId ||
      (value.type === 'session' ? value.id : null) || agentMeta?.sessionId);
    const type = value.type;
    const message = value.message;
    if (['turn_start', 'turn.started'].includes(type)) emit({ kind: 'step-start', text: 'Turn started' });
    if (['tool_use', 'tool_execution_start'].includes(type)) emit({ kind: 'step-start', text: value.name || value.toolName || 'Tool started' });
    if (['tool_result', 'tool_execution_end'].includes(type)) emit({ kind: 'step-end', text: value.name || value.toolName || 'Tool finished' });
    const text = type === 'text' ? value.text : type === 'message_update' ? value.assistantMessageEvent?.delta
      : type === 'message_end' && message?.role === 'assistant' ? textOf(message.content) : null;
    if (text) emit({ kind: 'message', text });
    if (type === 'turn_end') { run.turns += 1; emit({ kind: 'step-end', text: 'Turn finished' }); }
    if (typeof value.num_turns === 'number') run.turns = Math.max(run.turns, value.num_turns);
    const error = errorText(value.error) || (value.is_error ? value.result : null);
    if (error || type === 'error') { run.error = String(error || value.message || 'Agent failed'); emit({ kind: 'error', text: run.error }); }
    if (value.structured_output !== undefined) run.structured = value.structured_output;

    // Pi usage is cumulative within a message; agent_end repeats completed
    // messages. Do not add both the updates and the final snapshot.
    let usage;
    if (id === 'pi') {
      if (type === 'message_start' && message?.role === 'assistant') run.partialUsage = emptyUsage();
      if (type === 'message_update' && value.usage) run.partialUsage = usageOf(value.usage);
      if (type === 'message_end' && message?.role === 'assistant') {
        run.messageUsage = sumUsage(run.messageUsage, usageOf(message.usage));
        run.partialUsage = emptyUsage();
      }
      if (type === 'agent_end' && Array.isArray(value.messages)) {
        // agent_end covers one low-level run; message_end remains authoritative
        // when it was observed, including across automatic retries.
        if (!run.sawMessageUsage) run.messageUsage = value.messages.filter(m => m.role === 'assistant')
          .reduce((sum, m) => sumUsage(sum, usageOf(m.usage)), emptyUsage());
      }
      if (type === 'message_end' && message?.role === 'assistant') run.sawMessageUsage = true;
      usage = sumUsage(run.messageUsage, run.partialUsage);
    } else if (value.usage || value.tokens || value.total_cost_usd !== undefined || agentMeta?.usage) {
      usage = usageOf(value.usage || value.tokens || agentMeta?.usage);
      usage.costUsd = number(value.total_cost_usd, value.costUsd, usage.costUsd);
    }
    if (usage && Object.values(usage).some(n => n !== null)) {
      run.usage = { ...run.usage, ...Object.fromEntries(Object.entries(usage).filter(([, n]) => n !== null)) };
      emit({ kind: 'usage', text: 'Usage reported', ...resultUsage() });
    }
    checkLimits();
  };
  const queue = (text, command, requestId) => {
    pendingMessages.push({ command, text, ...(requestId === undefined ? {} : { requestId }) });
    if (job && typeof job === 'object') job.pendingMessages = [...pendingMessages];
    const ack = { ack: true, via: 'metaharness', queued: true, reply: 'unsupported' };
    emit({ kind: 'ack', text: 'Queued for the next attempt; this harness cannot resume this session.', command, ...ack });
    return ack;
  };
  const launch = async (text, { resume = false, fork = false } = {}) => {
    checkOpen();
    if (checkLimits()) return;
    directory ||= fs.mkdtempSync(path.join(os.tmpdir(), 'metaharness-resume-'));
    let argv = [...baseArgs], extra = [];
    if (resume) {
      // Remove an earlier selector before setting the exact saved session.
      const selectors = new Set(['--conversation', '--resume', '--session', '--session-id', '--id']);
      argv = argv.filter((arg, i, all) => !selectors.has(arg) && !selectors.has(all[i - 1]));
      if (id === 'aider') extra.push('--restore-chat-history');
      else if (id === 'goose') extra.push('--resume', '--name', sessionId);
      else extra.push(SELECTOR[id], sessionId);
      if (fork) {
        if (id === 'pi') extra = ['--fork', sessionId];
        else extra.push('--fork-session');
      }
    }
    if (id === 'aider') {
      const history = argv.indexOf('--chat-history-file');
      if (history >= 0) sessionId = argv[history + 1];
      else {
        sessionId ||= path.join(os.tmpdir(), `metaharness-aider-${randomUUID()}.history.md`);
        extra.push('--chat-history-file', sessionId);
      }
    }
    if (id === 'goose' && !resume) { sessionId ||= `metaharness-${randomUUID()}`; extra.push('--name', sessionId); }
    if (['grok', 'openclaw'].includes(id) && !resume && !argv.includes('--session-id')) {
      sessionId ||= randomUUID(); extra.push('--session-id', sessionId);
    }
    refresh();
    // The worker supplies an unfilled prompt option. Keep its operand next to
    // it even when provider or model options were appended to the command.
    const promptOption = ['agy', 'grok'].includes(id) ? '-p'
      : ['openclaw', 'aider'].includes(id) ? '--message' : id === 'goose' ? '--text' : null;
    if (promptOption) argv = argv.filter(arg => arg !== promptOption);
    argv.push(...extra);
    const prompt = [text, ...pendingMessages.splice(0).map(item => item.text)].join('\n\n');
    if (job && typeof job === 'object') job.pendingMessages = [];
    if (inputMode === 'file') {
      const file = path.join(directory, `${randomUUID()}.txt`);
      fs.writeFileSync(file, prompt, { mode: 0o600 }); argv.push('--prompt-file', file);
    } else if (inputMode !== 'stdin') argv.push(...(promptOption ? [promptOption] : []), prompt);
    let child;
    try { child = spawnFn(binary, argv, { cwd, env, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { finish({ ok: false, error: error.message, failureKind: 'process' }); throw error; }
    let resolveExit, resolveSession;
    const run = { child, awaitingHeader: ['pi', 'hermes'].includes(id), frames: [], stdout: '', stderr: '', buffer: '', bytes: 0, turns: 0,
      usage: emptyUsage(), messageUsage: emptyUsage(), partialUsage: emptyUsage(),
      exit: new Promise(resolve => { resolveExit = resolve; }),
      session: new Promise(resolve => { resolveSession = resolve; }), sessionReady: value => resolveSession(value) };
    active = run;
    const decoder = new StringDecoder('utf8');
    const line = text => { try { frame(run, JSON.parse(text)); } catch { /* Plain output is valid for some adapters. */ } };
    const collect = chunk => {
      run.bytes += chunk.length;
      if (run.bytes > 32 * 1024 * 1024) { void stop('output-limit'); return; }
      const text = decoder.write(chunk); run.stdout += text; run.buffer += text;
      let end;
      while ((end = run.buffer.indexOf('\n')) >= 0) { line(run.buffer.slice(0, end)); run.buffer = run.buffer.slice(end + 1); }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', chunk => { run.stderr = (run.stderr + chunk).slice(-8000); });
    child.stdin.on('error', () => {});
    const exit = (code, signalName) => {
      if (run.exited) return;
      run.buffer += decoder.end();
      if (run.buffer.trim()) line(run.buffer);
      // Pretty-printed JSON is not JSONL.
      if (!run.frames.length) { try { frame(run, JSON.parse(run.stdout)); } catch {} }
      run.exited = true;
      if (!run.turns) run.turns = 1;
      checkLimits();
      totalUsage = sumUsage(totalUsage, run.usage); totalTurns += run.turns;
      active = null; resolveSession(null); resolveExit();
      if (limitError) { finish({ ok: false, error: limitError, failureKind: 'limit' }); return; }
      if (['replace', 'interrupt'].includes(run.stopReason)) return;
      if (run.stopReason === 'close') { finish({ ok: false, error: 'Session closed.', failureKind: 'cancelled' }); return; }
      const frames = run.frames, last = frames.at(-1);
      const agentError = run.error || (last?.exit_code ? `Agent exited ${last.exit_code}` : null) ||
        (['FAILED', 'ERROR', 'CANCELED', 'WAITING'].includes(last?.status) ? last.status : null) ||
        (last?.messages?.some(m => ['error', 'aborted'].includes(m.stopReason)) ? 'Agent turn failed' : null);
      let response = last?.result ?? last?.response ?? last?.text;
      if (id === 'pi') response = frames.filter(f => f.type === 'agent_end').flatMap(f => f.messages || [])
        .filter(m => m.role === 'assistant').map(m => textOf(m.content)).join('\n');
      if (id === 'openclaw') response = (last?.result?.payloads || last?.payload?.payloads || last?.payloads || []).map(p => p.text || '').join('\n') || response;
      if (PLAIN.has(id) || id === 'muse' || !COMMANDS[id]) response ||= run.stdout.trim();
      const error = run.spawnError || agentError || (run.stopReason ? `Agent stopped: ${run.stopReason}` : null) ||
        (code !== 0 ? run.stderr.trim() || `Agent process exited ${code ?? signalName}` : null) ||
        (typeof response !== 'string' || !response.trim() ? 'Agent returned no completed result.' : null);
      finish({ ok: !error, response: typeof response === 'string' ? response : null, structured: run.structured ?? null,
        ...(options.captureExecution ? { execution: { stdout: run.stdout, stderr: run.stderr, exitCode: code } } : {}),
        error, failureKind: error ? run.spawnError || run.stopReason ? 'process' : failureKind(error) : null });
    };
    child.once('close', exit);
    const live = new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', error => { run.spawnError = error.message; exit(null); reject(error); });
    });
    child.stdin.end(inputMode === 'stdin' ? prompt : '');
    await live;
    // These streams have a documented session header. Wait until the resumed
    // process has read its input before accepting another replacement.
    if (run.awaitingHeader) await run.session;
    run.awaitingHeader = false;
    return run;
  };
  refresh();
  const deliver = (text, command, requestId) => serialize(async () => {
    checkOpen();
    if (typeof text !== 'string' || !text.trim()) throw new Error('A non-empty message is required.');
    if (!knownResume || !started) return queue(text, command, requestId);
    await stop('replace');
    if (settled || limitError) throw new Error(limitError || 'The session has finished.');
    // JSON-only harnesses may report their ID only while shutting down. Read
    // that final output before deciding whether this session can be resumed.
    if (!sessionId) {
      const ack = queue(text, command, requestId);
      finish({ ok: false, error: 'The harness did not report a resumable session ID.', failureKind: 'process' });
      return ack;
    }
    await launch(text, { resume: true });
    const ack = { ack: true, via: 'metaharness' };
    emit({ kind: 'ack', text: 'Resumed with the message.', command, ...ack });
    return ack;
  });
  return {
    capabilities,
    start: brief => serialize(async () => {
      checkOpen();
      if (active || started) throw new Error('The session has already started.');
      if (typeof brief !== 'string' || !brief.trim()) throw new Error('A non-empty brief is required.');
      started = true;
      if (options.sessionId && !knownResume) throw new Error('Resume is unsupported for this harness.');
      if (options.forkSession && (!canFork || options.atTurn !== undefined)) throw new Error('Fork is unsupported for this harness or turn.');
      await launch(brief, { resume: Boolean(options.sessionId && knownResume), fork: options.forkSession === true });
    }),
    send: text => deliver(text, 'send'),
    answer: (requestId, value) => deliver(typeof value === 'string' ? value : JSON.stringify(value), 'answer', requestId),
    interrupt: () => {
      // A startup hook can wait before the header. It must remain stoppable
      // while start() is waiting, rather than blocking behind that wait.
      const startup = active?.awaitingHeader ? stop('interrupt') : null;
      return serialize(async () => { checkOpen(); await startup; await stop('interrupt'); emit({ kind: 'ack', text: 'Interrupted.', command: 'interrupt' }); });
    },
    fork: ({ atTurn } = {}) => serialize(async () => {
      checkOpen();
      if (capabilities.fork === 'unsupported' || atTurn !== undefined) throw new Error('Fork is unsupported for this harness or turn.');
      await stop('replace');
      const previous = sessionId;
      const run = await launch('Continue from this session.', { resume: true, fork: true });
      const forked = await run?.session;
      if (!forked || forked === previous) throw new Error('The harness did not report a forked session ID.');
      return { sessionId: forked };
    }),
    close: () => {
      closeRequested = true;
      const startup = active?.awaitingHeader ? stop('close') : null;
      return serialize(async () => {
        if (closed) return;
        closed = true; await startup; await stop('close');
        if (!settled) finish({ ok: false, error: 'Session closed.', failureKind: 'cancelled' });
      });
    },
    get done() { return done; },
    next: async text => {
      await serialize(async () => {
      if (!settled || closed || closeRequested) throw new Error('The session is not ready for another turn.');
      settled = false;
      done = new Promise(resolve => { resolveDone = resolve; });
      await launch(knownResume && sessionId ? text : `Previous result:\n${lastResponse}\n\n${text}`, { resume: Boolean(knownResume && sessionId) });
      });
      return done;
    },
  };
}
