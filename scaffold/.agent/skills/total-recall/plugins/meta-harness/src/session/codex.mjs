/** Codex app-server session. Only Node built-ins may be shipped to a remote node.
 * Wire contract: https://learn.chatgpt.com/docs/app-server.md
 * Response types: openai/codex, app-server-protocol/schema/typescript (2026-11-09).
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const controls = ['reply', 'interrupt', 'answer', 'fork', 'goal', 'limits', 'schema', 'review'];
const approvalMethods = new Set(['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/permissions/requestApproval']);
const questionMethods = new Set(['tool/requestUserInput', 'item/tool/requestUserInput']);
const featureForMethod = { 'turn/steer': 'reply', 'turn/interrupt': 'interrupt', 'thread/fork': 'fork', 'thread/goal/set': 'goal' };
const textInput = text => [{ type: 'text', text }];
const errorText = error => error?.message || String(error);

function answerPayload(request, value) {
  if (questionMethods.has(request.method)) {
    const questions = request.params.questions || [];
    let answers = value?.answers ?? value;
    if (typeof answers === 'string' || Array.isArray(answers)) {
      if (questions.length !== 1) throw new Error('Answer each question by its question ID.');
      answers = { [questions[0].id]: answers };
    }
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('Question answers must be an object.');
    const result = {};
    for (const [id, answer] of Object.entries(answers)) {
      if (!questions.some(question => question.id === id)) throw new Error(`Unknown question ID: ${id}`);
      const values = typeof answer === 'string' ? [answer] : Array.isArray(answer) ? answer : answer?.answers;
      if (!Array.isArray(values) || values.some(entry => typeof entry !== 'string')) throw new Error(`Invalid answer for ${id}`);
      result[id] = { answers: values };
    }
    return { answers: result };
  }
  if (request.method === 'item/permissions/requestApproval') {
    const result = value === 'allow' || value === true
      ? { permissions: request.params.permissions || {}, scope: 'turn' }
      : value === 'deny' || value === false ? { permissions: {}, scope: 'turn' } : value;
    if (!result?.permissions || typeof result.permissions !== 'object' || Array.isArray(result.permissions) ||
        (result.scope !== undefined && !['turn', 'session'].includes(result.scope))) throw new Error('Invalid permission grant.');
    return { ...result, scope: result.scope || 'turn' };
  }
  let decision = value?.decision ?? value;
  if (decision === 'allow' || decision === true) decision = 'accept';
  if (decision === 'deny' || decision === false) decision = 'decline';
  const amendment = request.method === 'item/commandExecution/requestApproval' && decision && typeof decision === 'object' &&
    (decision.acceptWithExecpolicyAmendment || decision.applyNetworkPolicyAmendment);
  if (!['accept', 'acceptForSession', 'decline', 'cancel'].includes(decision) && !amendment) throw new Error('Invalid approval decision.');
  return { decision };
}

export function createCodexDriver({ harness, binary = 'codex', args = [], cwd, env = process.env, job, options = {}, onEvent = () => {}, onFrame = () => {}, spawnFn = spawn }) {
  const capabilities = Object.fromEntries(controls.map(key => [key, 'unsupported']));
  const pending = new Map(), requests = new Map(), turnWaiters = new Map(), completedTurns = new Set(), messages = new Map();
  const usage = { inputTokens: 0, outputTokens: 0, costUsd: null };
  let child, lines, started, sessionId = null, activeTurn = null, sequence = 0;
  let closed = false, exited = false, settled = false, closing, completion = null, finishTimer;
  let queued = 0, controlTail = Promise.resolve(), limitError = null, stderr = '', bytes = 0;
  let resolveDone, resolveExit;
  let done = new Promise(resolve => { resolveDone = resolve; });
  const exit = new Promise(resolve => { resolveExit = resolve; });
  const emit = (kind, fields = {}) => {
    try { onEvent({ kind, text: '', ...fields }); } catch { /* Observers do not own the session. */ }
  };
  const response = () => {
    const items = [...messages.values()];
    const final = items.filter(item => item.phase === 'final_answer');
    return (final.length ? final : items).map(item => item.text || '').join('\n');
  };
  function settle(result) {
    if (settled) return;
    settled = true;
    clearImmediate(finishTimer);
    const value = { ok: false, response: response(), sessionId, usage: { ...usage }, structured: null, error: null, failureKind: null, ...result };
    emit('finish', { text: value.ok ? 'Finished' : value.error, ...value });
    resolveDone(value);
  }
  function rejectPending(error) {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
    for (const entry of turnWaiters.values()) { clearTimeout(entry.timer); entry.reject(error); }
    pending.clear(); requests.clear(); turnWaiters.clear();
  }
  function fail(error, failureKind = 'protocol') {
    if (limitError) failureKind = 'limit';
    emit('error', { text: errorText(error), failureKind });
    settle({ error: errorText(error), failureKind });
    rejectPending(error);
    void close();
  }
  function write(message) {
    return new Promise((resolve, reject) => {
      if (!child || exited || closed || child.stdin.destroyed) { reject(new Error('Codex session is closed.')); return; }
      child.stdin.write(`${JSON.stringify(message)}\n`, error => error ? reject(error) : resolve());
    });
  }
  function rpc(method, params) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail(new Error(`Codex request timed out: ${method}`)), 30_000);
      timer.unref?.();
      pending.set(id, { resolve, reject, timer, method });
      write({ id, method, params }).catch(error => fail(error, 'transport'));
    });
  }
  function finishWhenIdle() {
    clearImmediate(finishTimer);
    // Let controls submitted by event handlers, and responses in this JSONL batch, drain first.
    finishTimer = setImmediate(() => {
      if (!completion || activeTurn || queued || settled) return;
      const turn = completion;
      if (limitError) { settle({ error: limitError, failureKind: 'limit' }); return; }
      if (turn.status !== 'completed') {
        const info = turn.error?.codexErrorInfo;
        settle({ error: turn.error?.message || `Codex turn ${turn.status}.`,
          failureKind: turn.status === 'interrupted' ? 'cancelled' : info === 'usageLimitExceeded' ? 'quota' : 'agent' });
        return;
      }
      let structured = null;
      if (options.resultSchema !== undefined) {
        try { structured = JSON.parse(response()); }
        catch { settle({ error: 'Codex returned invalid JSON for the result schema.', failureKind: 'schema' }); return; }
      }
      settle({ ok: true, structured });
    });
  }
  function control(command, action) {
    queued += 1;
    const task = controlTail.then(async () => {
      if (!started) throw new Error('Start the Codex session first.');
      await started;
      if (closed || exited) throw new Error('Codex session is closed.');
      const result = await action();
      emit('ack', { text: `${command} acknowledged`, command });
      return result;
    }).finally(() => { queued -= 1; finishWhenIdle(); });
    controlTail = task.catch(() => {});
    return task;
  }
  async function startTurn(text) {
    if (limitError) throw new Error(limitError);
    completion = null;
    messages.clear();
    const result = await rpc('turn/start', { threadId: sessionId, input: textInput(text),
      ...(options.effort ? { effort: options.effort } : {}),
      ...(options.resultSchema !== undefined ? { outputSchema: options.resultSchema } : {}) });
    if (!result?.turn?.id) throw new Error('Codex turn/start returned no turn ID.');
    if (!completedTurns.has(result.turn.id)) activeTurn = result.turn.id;
  }
  async function interruptTurn() {
    const turnId = activeTurn;
    if (!turnId) return;
    // The RPC reply only acknowledges cancellation. Wait for turn/completed before
    // returning, so an immediate continuation starts a new turn rather than steering it.
    const stopped = new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail(new Error('Codex interrupt did not complete.')), 30_000);
      timer.unref?.();
      turnWaiters.set(turnId, { resolve, reject, timer });
    });
    try { await Promise.all([stopped, rpc('turn/interrupt', { threadId: sessionId, turnId })]); }
    finally { clearTimeout(turnWaiters.get(turnId)?.timer); turnWaiters.delete(turnId); }
  }
  function itemEvent(method, params) {
    const item = params.item;
    if (item?.type === 'agentMessage' || item?.type === 'exitedReviewMode') {
      if (item.type === 'exitedReviewMode') item.text = item.review;
      messages.set(item.id, { ...item });
      if (method === 'item/completed') emit('message', { text: item.text || '', item, itemId: item.id, phase: item.phase });
      return;
    }
    if (item) {
      const text = item.command || item.text || item.review || item.query || item.tool || item.type;
      emit(method === 'item/started' ? 'step-start' : 'step-end', { text, item, itemId: item.id });
      if (item.type === 'collabToolCall') emit('subagent', { text: item.prompt || text, item });
      return;
    }
    if (method === 'item/agentMessage/delta') {
      const previous = messages.get(params.itemId) || { id: params.itemId, type: 'agentMessage', text: '' };
      messages.set(params.itemId, { ...previous, text: previous.text + (params.delta || '') });
    }
    if (typeof params.delta === 'string') emit('message', { text: params.delta, delta: true, itemId: params.itemId, method });
  }
  function notification(method, params) {
    // A fork also emits thread/started. Never replace this driver's thread with that fork.
    if (params.threadId && params.threadId !== sessionId) return;
    if (method.startsWith('item/')) { itemEvent(method, params); return; }
    switch (method) {
      case 'turn/started':
        if (!completedTurns.has(params.turn.id)) activeTurn = params.turn.id;
        break;
      case 'turn/completed': {
        const turn = params.turn;
        if (completedTurns.has(turn.id)) return;
        if (activeTurn && activeTurn !== turn.id) return;
        for (const item of turn.items || []) if (item.type === 'agentMessage') messages.set(item.id, item);
        completedTurns.add(turn.id); activeTurn = null; completion = turn;
        const waiting = turnWaiters.get(turn.id);
        if (waiting) { clearTimeout(waiting.timer); waiting.resolve(); turnWaiters.delete(turn.id); }
        for (const [id, request] of requests) if (request.params.turnId === turn.id) requests.delete(id);
        finishWhenIdle();
        break;
      }
      case 'serverRequest/resolved': requests.delete(params.requestId); break;
      case 'turn/plan/updated': emit('plan', { text: params.explanation || 'Plan updated', steps: params.plan || [] }); break;
      case 'turn/diff/updated': emit('diff', { text: params.diff || '', summary: params.diff || '' }); break;
      case 'model/rerouted': emit('reroute', { text: `${params.fromModel} → ${params.toModel}`, from: params.fromModel, to: params.toModel, reason: params.reason }); break;
      case 'hook/started': case 'hook/completed':
        emit('hook', { text: params.run?.eventName || '', name: params.run?.eventName, phase: method.split('/')[1], run: params.run }); break;
      case 'thread/tokenUsage/updated': {
        const total = params.tokenUsage?.total;
        if (!total) return;
        // These are cumulative thread snapshots. Summing them would count tokens twice.
        usage.inputTokens = total.inputTokens ?? usage.inputTokens;
        usage.outputTokens = total.outputTokens ?? usage.outputTokens;
        emit('usage', { text: `${usage.inputTokens} in, ${usage.outputTokens} out tokens`, ...usage });
        if (options.maxTokens !== undefined && !limitError && (total.totalTokens ?? usage.inputTokens + usage.outputTokens) >= options.maxTokens) {
          limitError = `Codex token limit reached (${options.maxTokens}).`;
          void control('interrupt', async () => {
            if (activeTurn) await interruptTurn();
            else settle({ error: limitError, failureKind: 'limit' });
          }).catch(error => fail(error, 'limit'));
        }
        break;
      }
      case 'error': emit('error', { text: params.error?.message || 'Codex error', error: params.error, willRetry: params.willRetry }); break;
    }
  }
  function frame(message) {
    onFrame(message);
    if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Invalid Codex JSON-RPC frame.');
    if (message.method && Object.hasOwn(message, 'id')) {
      if (approvalMethods.has(message.method) || questionMethods.has(message.method)) {
        requests.set(message.id, message);
        emit(questionMethods.has(message.method) ? 'question' : 'approval', {
          requestId: message.id, request: message.params, method: message.method,
          ...(questionMethods.has(message.method) ? { questions: message.params.questions || [] } : {}) });
      } else {
        void write({ id: message.id, error: { code: -32601, message: `Unsupported client method: ${message.method}` } }).catch(error => fail(error, 'transport'));
      }
    } else if (Object.hasOwn(message, 'id')) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error) {
        const feature = featureForMethod[entry.method];
        if (feature && message.error.code === -32601) capabilities[feature] = 'unsupported';
        entry.reject(Object.assign(new Error(message.error.message || 'Codex request failed.'), message.error));
      } else if (Object.hasOwn(message, 'result')) entry.resolve(message.result);
      else entry.reject(new Error('Codex response has no result or error.'));
    } else if (typeof message.method === 'string') notification(message.method, message.params || {});
    else throw new Error('Invalid Codex JSON-RPC frame.');
  }
  async function start(brief) {
    if (started) throw new Error('Codex session has already started.');
    if (closed) throw new Error('Codex session is closed.');
    started = (async () => {
      if (typeof brief !== 'string' || !brief.trim()) throw new Error('A non-empty brief is required.');
      if (options.maxTokens !== undefined && (!Number.isSafeInteger(options.maxTokens) || options.maxTokens < 1)) throw new Error('maxTokens must be a positive integer.');
      try {
        child = spawnFn(binary, [...args, 'app-server', '--listen', 'stdio://'], {
          cwd, env, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (error) { error.failureKind = 'spawn'; throw error; }
      child.on('error', error => { exited = true; resolveExit(); fail(error, 'spawn'); });
      child.on('close', (code, signal) => {
        exited = true; resolveExit(); lines?.close();
        rejectPending(Object.assign(new Error(`Codex app-server closed (${signal || code}).${stderr ? ` ${stderr}` : ''}`), { failureKind: 'process' }));
        if (!closed && !settled) {
          // stdout has drained at close; allow a preceding turn/completed to settle first.
          finishWhenIdle();
          setImmediate(() => { if (!settled) fail(new Error(`Codex app-server exited before turn completion (${signal || code}).${stderr ? ` ${stderr}` : ''}`), 'process'); });
        }
      });
      child.stdin.on('error', error => { if (!closed) fail(error, 'transport'); });
      child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4096); });
      child.stdout.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 32 * 1024 * 1024) fail(new Error('Codex transport output limit reached.'), 'limit');
      });
      lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
      lines.on('line', line => {
        if (!line.trim() || closed) return;
        try { frame(JSON.parse(line)); } catch (error) { fail(error); }
      });
      const initialized = await rpc('initialize', {
        clientInfo: { name: 'metaharness', title: 'Metaharness', version: '1.0.0' },
        capabilities: { experimentalApi: true } });
      if (!initialized || typeof initialized.userAgent !== 'string') throw new Error('Codex initialize returned no server identity.');
      await write({ method: 'initialized', params: {} });
      // InitializeResponse reports identity/platform, not a per-method feature list. Use the
      // documented app-server surface after this handshake, never a version-string test.
      Object.assign(capabilities, Object.fromEntries(controls.map(key => [key, key === 'limits' ? 'metaharness' : 'native'])));
      const result = await rpc(options.forkSession ? 'thread/fork' : options.sessionId ? 'thread/resume' : 'thread/start', {
        ...(options.sessionId ? { threadId: options.sessionId, excludeTurns: true } : {}),
        ...(options.forkSession && options.atTurn ? { lastTurnId: options.atTurn } : {}),
        cwd, sandbox: 'danger-full-access', approvalPolicy: options.approvalPolicy === 'operator' || options.approvalPolicy === 'rules'
          ? 'on-request' : options.approvalPolicy === 'auto' || !options.approvalPolicy ? 'never' : options.approvalPolicy });
      // The resumable handle is thread.id; thread.sessionId can name a fork's ancestor.
      sessionId = result?.thread?.id;
      if (!sessionId) throw new Error('Codex returned no thread ID.');
      await rpc('thread/name/set', { threadId: sessionId, name: options.name || job?.name || job?.id || (typeof job === 'string' ? job : 'Metaharness job') });
      if (options.goal) await rpc('thread/goal/set', { threadId: sessionId, objective: options.goal });
      emit('session', { text: `Codex session ${sessionId}`, sessionId, session: sessionId, rootSessionId: result.thread.sessionId,
        capabilities: { ...capabilities }, server: initialized, harness });
      if (options.reviewTarget) {
        const review = await rpc('review/start', { threadId: sessionId, delivery: 'inline', target: options.reviewTarget });
        if (!review?.turn?.id) throw new Error('Codex review/start returned no turn ID.');
        if (!completedTurns.has(review.turn.id)) activeTurn = review.turn.id;
      } else await startTurn(brief);
    })();
    try { await started; }
    catch (error) { fail(error, error.failureKind || 'protocol'); throw error; }
  }
  function send(text) {
    return control('send', async () => {
      if (typeof text !== 'string' || !text.trim()) throw new Error('A non-empty message is required.');
      if (limitError) throw new Error(limitError);
      if (activeTurn) {
        const turnId = activeTurn;
        try { await rpc('turn/steer', { threadId: sessionId, expectedTurnId: turnId, input: textInput(text) }); }
        catch (error) {
          // The turn can finish between selecting steer and the server handling it.
          if (error.code === -32600 && !activeTurn && /no active turn|not active|turn.*mismatch/i.test(error.message)) await startTurn(text);
          else throw error;
        }
      } else await startTurn(text);
      return { ack: true, via: 'native' };
    });
  }
  function interrupt() {
    return control('interrupt', async () => {
      await interruptTurn();
      return { ack: true, via: 'native' };
    });
  }
  async function answer(requestId, value) {
    if (closed || exited) throw new Error('Codex session is closed.');
    const id = requests.has(requestId) ? requestId : [...requests.keys()].find(key => String(key) === String(requestId));
    const request = requests.get(id);
    if (!request) throw new Error(`No pending Codex request: ${requestId}`);
    const result = answerPayload(request, value);
    // Reserve the request before yielding: two concurrent operator replies must not
    // write two JSON-RPC responses for the same server request.
    requests.delete(id);
    queued += 1;
    try {
      await write({ id: request.id, result });
      emit('ack', { text: 'answer acknowledged', command: 'answer', requestId: request.id });
      return { ack: true, via: 'native' };
    } finally { queued -= 1; finishWhenIdle(); }
  }
  function fork({ atTurn } = {}) {
    return control('fork', async () => {
      const result = await rpc('thread/fork', { threadId: sessionId, excludeTurns: true, ...(atTurn ? { lastTurnId: atTurn } : {}) });
      if (!result?.thread?.id) throw new Error('Codex fork returned no thread ID.');
      return { sessionId: result.thread.id };
    });
  }
  function close() {
    if (closing) return closing;
    closed = true;
    clearImmediate(finishTimer);
    rejectPending(new Error('Codex session is closed.'));
    if (!settled) settle({ error: limitError || 'Codex session closed.', failureKind: limitError ? 'limit' : 'cancelled' });
    closing = (async () => {
      if (!child) return;
      const kill = signal => {
        try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal); else child.kill(signal); }
        catch { try { child.kill(signal); } catch { /* Already stopped. */ } }
      };
      if (!exited) child.stdin.end();
      kill('SIGTERM');
      const timer = setTimeout(() => kill('SIGKILL'), 500);
      await exit;
      // A server can exit while a descendant ignores TERM and has closed its pipes.
      // Stop the owned group as well before releasing the session.
      kill('SIGKILL'); clearTimeout(timer); lines?.close();
    })();
    return closing;
  }
  return { capabilities, start, send, interrupt, answer, fork, close, get done() { return done; },
    setGoal: objective => control('goal', () => rpc('thread/goal/set', { threadId: sessionId, objective })),
    async next(text, { resultSchema } = {}) {
      if (!settled || closed || exited) throw new Error('The session is not ready for another turn.');
      settled = false;
      options.resultSchema = resultSchema;
      done = new Promise(resolve => { resolveDone = resolve; });
      await startTurn(text);
      return done;
    } };
}
