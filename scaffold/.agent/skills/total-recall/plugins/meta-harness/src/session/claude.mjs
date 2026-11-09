import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

// Protocol sources: code.claude.com/docs/en/{cli-reference,headless}.md and
// agent-sdk/{streaming-vs-single-mode,typescript}.md (read 2026-11-09).
const controls = ['reply', 'interrupt', 'answer', 'fork', 'goal', 'limits', 'schema', 'review'];
const ownedValues = new Set(['--input-format', '--output-format', '--session-id', '--name', '-n',
  '--max-turns', '--max-budget-usd', '--json-schema', '--effort', '--fallback-model', '--mcp-config',
  '--permission-prompt-tool']);
const ownedSwitches = new Set(['-p', '--print', '--verbose', '--replay-user-messages',
  '--include-hook-events', '--forward-subagent-text']);
const textOf = content => typeof content === 'string' ? content : Array.isArray(content)
  ? content.filter(block => block.type === 'text').map(block => block.text).join('\n') : '';
const failureKind = (text, subtype) => /error_max_(turns|budget_usd)/.test(subtype || '') ? 'limit'
  : /quota|rate.?limit|usage limit|credit|\b429\b/i.test(text) ? 'quota'
  : /not (?:logged|signed) in|authenticat|invalid api key|\b401\b/i.test(text) ? 'auth' : 'agent';

/** Own one Claude stream-json process. Only Node built-ins are used on remote nodes. */
export function createClaudeDriver({ harness, binary, args = [], cwd, env, job,
  options = {}, onEvent = () => {}, onFrame = () => {}, spawnFn = spawn } = {}) {
  const capabilities = Object.fromEntries(controls.map(key => [key, 'unsupported']));
  let sessionId = options.forkSession ? randomUUID() : options.sessionId || randomUUID();
  let child, lines, started = false, closing = false, exited = false, initialized = false;
  let settled = false, stderr = '', response = '', closePromise, continuation;
  let usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  let resolveReady, rejectReady, resolveDone, resolveExit;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  ready.catch(() => {}); // start() is the public reader of startup errors.
  let done = new Promise(resolve => { resolveDone = resolve; });
  const exit = new Promise(resolve => { resolveExit = resolve; });
  const signal = name => {
    try { if (process.platform !== 'win32' && child?.pid) process.kill(-child.pid, name); else child?.kill(name); return true; }
    catch { return false; }
  };
  const pending = new Map();
  const requests = new Map();
  const emit = (kind, fields = {}) => { try { onEvent({ kind, text: '', ...fields }); } catch { /* observers do not own the process */ } };
  const rejectPending = error => {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
    pending.clear();
    requests.clear();
  };
  const complete = result => {
    if (settled) return;
    settled = true;
    resolveDone({ ok: false, response, sessionId, usage: { ...usage }, structured: undefined,
      error: null, failureKind: null, ...result });
  };
  const fail = error => {
    const message = String(error?.message || error);
    rejectReady(new Error(message));
    rejectPending(new Error(message));
    emit('error', { text: message });
    complete({ error: message, failureKind: failureKind(message) });
  };
  const writable = () => {
    if (!started || closing || exited || !child?.stdin?.writable) throw new Error('Claude session is not open.');
  };
  const write = frame => {
    writable();
    child.stdin.write(`${JSON.stringify(frame)}\n`, error => { if (error) fail(error); });
  };
  const userMessage = text => ({ type: 'user', uuid: randomUUID(), session_id: sessionId,
    message: { role: 'user', content: text }, parent_tool_use_id: null });
  const acknowledge = (id, value) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id); clearTimeout(entry.timer);
    emit('ack', { command: entry.command, requestId: id, via: 'native' });
    entry.resolve(value);
  };
  const handle = frame => {
    onFrame(frame);
    if (!frame || typeof frame !== 'object') throw new Error('Invalid Claude stream message.');
    const parent = frame.parent_tool_use_id;
    const parentFields = parent ? { parent_tool_use_id: parent } : {};
    if (frame.type === 'system' && frame.subtype === 'init') {
      sessionId = frame.session_id || sessionId;
      const reported = Array.isArray(frame.capabilities) ? frame.capabilities : [];
      Object.assign(capabilities, { reply: 'native',
        interrupt: reported.includes('interrupt_receipt_v1') || reported.includes('interrupt_cancel_queued_v1') ? 'native' : 'metaharness',
        answer: 'metaharness', fork: 'native', goal: 'metaharness', limits: 'native', schema: 'native', review: 'metaharness' });
      initialized = true;
      emit('session', { text: `Claude session ${sessionId}`, sessionId, session: sessionId,
        capabilities: { ...capabilities }, nativeCapabilities: [...reported], model: frame.model });
      resolveReady();
      return;
    }
    if (frame.type === 'control_response') {
      const receipt = frame.response;
      const entry = pending.get(receipt?.request_id);
      if (entry?.command !== 'interrupt') return;
      if (receipt.subtype === 'error') {
        pending.delete(receipt.request_id); clearTimeout(entry.timer);
        entry.reject(new Error(receipt.error || 'Claude rejected the interrupt.'));
      } else acknowledge(receipt.request_id, { ack: true, via: 'native', ...receipt.response });
      return;
    }
    if (frame.type === 'control_request') {
      if (frame.request?.subtype === 'can_use_tool') {
        requests.set(frame.request_id, frame.request);
        emit('approval', { text: `Approval for ${frame.request.tool_name}`, requestId: frame.request_id, request: frame.request });
      }
      return;
    }
    if (frame.type === 'system' && frame.subtype === 'api_retry') {
      emit('error', { text: `API retry ${frame.attempt}/${frame.max_retries}: ${frame.error}`,
        retry: true, attempt: frame.attempt, maxRetries: frame.max_retries,
        retryDelayMs: frame.retry_delay_ms, errorStatus: frame.error_status });
      return;
    }
    if (frame.type === 'system' && ['hook_started', 'hook_progress', 'hook_response'].includes(frame.subtype)) {
      emit('hook', { text: frame.output || frame.hook_name || '', name: frame.hook_name,
        phase: frame.subtype.slice(5), hookId: frame.hook_id, hookEvent: frame.hook_event,
        outcome: frame.outcome, stdout: frame.stdout, stderr: frame.stderr, exitCode: frame.exit_code });
      return;
    }
    if (frame.type === 'system' && frame.subtype === 'permission_denied') {
      emit('error', { text: `Permission denied: ${frame.tool_name || frame.message || ''}` });
      return;
    }
    if (frame.type === 'assistant' || frame.type === 'user') {
      const content = frame.message?.content;
      const blocks = Array.isArray(content) ? content : typeof content === 'string' ? [{ type: 'text', text: content }] : [];
      if (frame.type === 'user' && !parent && !blocks.some(block => block.type === 'tool_result')) {
        // Only a replay with our UUID acknowledges delivery. Tool results and subagent
        // prompts must not acknowledge a user's pending message with the same text.
        if (pending.get(frame.uuid)?.command === 'reply') acknowledge(frame.uuid, { ack: true, via: 'native' });
        return;
      }
      for (const block of blocks) {
        if (frame.type === 'assistant' && block.type === 'tool_use') {
          emit('step-start', { text: `${block.name}: ${JSON.stringify(block.input || {})}`,
            toolUseId: block.id, tool: block.name, input: block.input, ...parentFields });
        } else if (block.type === 'tool_result') {
          emit('step-end', { text: textOf(block.content) || (block.is_error ? 'Tool returned an error' : 'Tool finished'),
            toolUseId: block.tool_use_id, isError: block.is_error === true, ...parentFields });
        } else if (block.type === 'text' || (parent && block.type === 'thinking')) {
          const text = block.text || block.thinking || '';
          if (parent) emit('subagent', { text, ...parentFields });
          else if (frame.type === 'assistant') {
            response += text;
            emit('message', { text });
          }
        }
      }
      if (frame.error) emit('error', { text: String(frame.error), ...parentFields });
      return;
    }
    if (frame.type === 'result') {
      sessionId = frame.session_id || sessionId;
      usage = { inputTokens: frame.usage?.input_tokens ?? 0,
        outputTokens: frame.usage?.output_tokens ?? 0, costUsd: frame.total_cost_usd ?? 0 };
      const ok = frame.subtype === 'success' && !frame.is_error;
      const error = ok ? null : frame.errors?.join('\n') || frame.result || frame.subtype || 'Claude reported failure.';
      const result = { ok, response: frame.result ?? response, sessionId, usage: { ...usage },
        ...(options.trackTurns ? { turns: frame.num_turns || 1 } : {}),
        structured: frame.structured_output, error, failureKind: ok ? null : failureKind(error, frame.subtype) };
      emit('usage', { ...usage });
      emit('finish', { text: ok ? 'Finished' : error, ...result });
      complete(result);
      response = '';
      return;
    }
    if (frame.type === 'error') emit('error', { text: String(frame.error?.message || frame.message || frame.error) });
  };

  function launchArgs() {
    const result = [];
    for (let i = 0; i < args.length; i++) {
      const flag = args[i].split('=')[0];
      if (ownedValues.has(flag)) { if (!args[i].includes('=')) i++; continue; }
      if (ownedSwitches.has(flag)) continue;
      // The MCP prompt tool must get approval requests under an operator/rules policy.
      if (options.approvalPolicy && options.approvalPolicy !== 'auto') {
        if (flag === '--dangerously-skip-permissions') continue;
        if (flag === '--permission-mode') { if (!args[i].includes('=')) i++; continue; }
      }
      result.push(args[i]);
    }
    result.push('-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
      '--replay-user-messages', '--include-hook-events', '--forward-subagent-text');
    if (options.resumeSession) result.push('--resume', options.sessionId);
    else result.push('--session-id', sessionId);
    if (options.forkSession) {
      if (options.atTurn !== undefined) throw new Error('Claude CLI cannot fork at a selected turn.');
      result.push('--fork-session');
      result.push('--session-id', sessionId);
    }
    const name = options.name ?? (typeof job === 'string' ? job : job?.id ?? job?.job);
    for (const [flag, value] of [['--name', name], ['--max-turns', options.maxTurns],
      ['--max-budget-usd', options.maxBudgetUsd], ['--json-schema', options.resultSchema],
      ['--effort', options.effort], ['--fallback-model', options.fallbackModel], ['--mcp-config', options.mcpConfig]]) {
      if (value !== undefined && value !== null) result.push(flag, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    result.push('--permission-prompt-tool', 'mcp__metaharness__approve');
    return result;
  }

  return {
    capabilities, get done() { return done; },
    async next(text, { resultSchema, maxTurns = options.maxTurns, maxBudgetUsd = options.maxBudgetUsd } = {}) {
      if (continuation) return continuation.next(text, { resultSchema, maxTurns, maxBudgetUsd });
      writable();
      if (!settled) throw new Error('The current turn has not finished.');
      // The schema is a process flag. Reopen the same native session when a
      // goal-check turn needs a different schema from the requested result.
      if (JSON.stringify(resultSchema) !== JSON.stringify(options.resultSchema) || maxTurns !== options.maxTurns || maxBudgetUsd !== options.maxBudgetUsd) {
        await this.close();
        continuation = createClaudeDriver({ harness, binary, args, cwd, env, job, spawnFn, onEvent, onFrame,
          options: { ...options, sessionId, resumeSession: true, forkSession: false, resultSchema, maxTurns, maxBudgetUsd } });
        await continuation.start(text);
        done = continuation.done;
        return done;
      }
      settled = false; response = '';
      done = new Promise(resolve => { resolveDone = resolve; });
      write(userMessage(text));
      return done;
    },
    async start(brief) {
      if (started) return ready;
      if (closing) throw new Error('Claude session is closed.');
      if (typeof brief !== 'string') throw new TypeError('The brief must be text.');
      started = true;
      try {
        child = spawnFn(binary || harness?.binary || 'claude', launchArgs(), {
          cwd, env, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
        });
        child.once('error', error => { fail(error); if (!child.pid) { exited = true; resolveExit(); } });
        child.stdin.on('error', error => { if (!closing && !exited) fail(error); });
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-65536); });
        lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
        lines.on('line', line => {
          if (!line.trim()) return;
          try { handle(JSON.parse(line)); }
          catch (error) { fail(new Error(`Invalid Claude stream: ${error.message}`)); signal('SIGTERM'); }
        });
        child.once('close', (code, signal) => {
          exited = true; lines.close(); resolveExit();
          const error = new Error(stderr.trim() || `Claude closed without a result (${signal || code}).`);
          rejectPending(error);
          if (!initialized) rejectReady(error);
          if (!settled) fail(error);
        });
        // The CLI reads its first user message before it emits system/init.
        write(userMessage(brief));
      } catch (error) { exited = true; resolveExit(); fail(error); }
      return ready;
    },
    async send(text) {
      if (continuation) return continuation.send(text);
      if (typeof text !== 'string') throw new TypeError('The reply must be text.');
      writable();
      const frame = userMessage(text);
      return new Promise((resolve, reject) => {
        pending.set(frame.uuid, { command: 'reply', resolve, reject });
        try { write(frame); } catch (error) { pending.delete(frame.uuid); reject(error); }
      });
    },
    async interrupt() {
      if (continuation) return continuation.interrupt();
      writable();
      if (!initialized) throw new Error('Claude session is not live.');
      if (capabilities.interrupt !== 'native') {
        if (!signal('SIGTERM')) throw new Error('Cannot interrupt Claude.');
        emit('ack', { command: 'interrupt', via: 'metaharness' });
        return { ack: true, via: 'metaharness' };
      }
      const requestId = randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Claude interrupt receipt timed out.')); }, 30000);
        pending.set(requestId, { command: 'interrupt', resolve, reject, timer });
        try { write({ type: 'control_request', request_id: requestId, request: { subtype: 'interrupt' } }); }
        catch (error) { clearTimeout(timer); pending.delete(requestId); reject(error); }
      });
    },
    async answer(requestId, value) {
      if (continuation) return continuation.answer(requestId, value);
      if (!requests.has(requestId)) throw new Error('No native approval has this ID. Answer MCP requests through the Metaharness inbox.');
      write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response: value } });
      requests.delete(requestId);
      emit('ack', { command: 'approve', requestId, via: 'native' });
      return { ack: true, via: 'native' };
    },
    async fork({ atTurn } = {}) {
      if (continuation) return continuation.fork({ atTurn });
      if (!initialized) throw new Error('Claude session is not live.');
      if (atTurn !== undefined) throw new Error('Claude CLI cannot fork at a selected turn.');
      const fork = createClaudeDriver({ harness, binary, args,
        cwd, env, job, options: { ...options, sessionId, resumeSession: true, forkSession: true }, spawnFn });
      try {
        // /rename is a documented local print-mode command. It materializes the fork
        // without replaying the brief or asking a model to do more work.
        await fork.start(`/rename ${options.name || 'Metaharness fork'}`);
        const result = await fork.done;
        if (!result.ok) throw new Error(result.error);
        return { sessionId: result.sessionId };
      } finally { await fork.close(); }
    },
    async close() {
      if (continuation) return continuation.close();
      if (closePromise) return closePromise;
      closing = true;
      rejectPending(new Error('Claude session is closed.'));
      if (!started) { exited = true; rejectReady(new Error('Claude session is closed.')); complete({ error: 'Claude session was not started.', failureKind: 'agent' }); resolveExit(); }
      closePromise = (async () => {
        if (exited) return;
        child.stdin.end();
        const term = setTimeout(() => signal('SIGTERM'), 1000);
        const kill = setTimeout(() => signal('SIGKILL'), 2000);
        try { await exit; } finally { signal('SIGKILL'); clearTimeout(term); clearTimeout(kill); }
      })();
      return closePromise;
    },
  };
}
