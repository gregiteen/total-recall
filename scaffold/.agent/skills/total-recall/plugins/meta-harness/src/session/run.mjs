/** Job lifecycle around a native session. All dependencies ship with the worker. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClaudeDriver } from './claude.mjs';
import { createCodexDriver } from './codex.mjs';
import { createResumeDriver } from './resume.mjs';
import { GOAL_SCHEMA, readResult } from './result.mjs';
import { tailInbox, appendEvent, waitingRequests } from '../control.mjs';
import { mcpConfigFor, createMcpTools, NO_ANSWER, QUESTION_TIMEOUT_MS } from '../mcp-server.mjs';

// A routed attempt or coordination stage shares its CLI job's limits. Each
// driver reports its own usage; the job sums those reports without double count.
const budgets = new Map();

export function sessionOptions(request) {
  const result = {};
  if (request.sessionId) result.resumeSession = true;
  for (const key of ['goal', 'maxTurns', 'maxTokens', 'maxBudgetUsd', 'resultSchema', 'approvalPolicy', 'questionTimeoutMs', 'sessionId', 'forkSession', 'atTurn', 'name', 'effort', 'fallbackModel', 'reviewTarget']) {
    if (request[key] !== undefined) result[key] = request[key];
  }
  for (const key of ['maxTurns', 'maxTokens', 'questionTimeoutMs']) if (result[key] !== undefined && (!Number.isSafeInteger(result[key]) || result[key] < 1)) throw new Error(`${key} must be a positive integer.`);
  if (result.maxBudgetUsd !== undefined && (!Number.isFinite(result.maxBudgetUsd) || result.maxBudgetUsd < 0)) throw new Error('maxBudgetUsd must be nonnegative.');
  if (result.goal !== undefined && (typeof result.goal !== 'string' || !result.goal.trim() || result.goal.length > 4000)) throw new Error('goal must have 1..4000 characters.');
  if (result.approvalPolicy !== undefined && !['auto', 'operator', 'rules'].includes(result.approvalPolicy)) throw new Error('Approval policy must be auto, operator, or rules.');
  if (typeof result.resultSchema === 'string') result.resultSchema = JSON.parse(fs.readFileSync(path.resolve(request.cwd, result.resultSchema), 'utf8'));
  if (result.resultSchema !== undefined && typeof result.resultSchema !== 'boolean' && (!result.resultSchema || typeof result.resultSchema !== 'object' || Array.isArray(result.resultSchema))) throw new Error('resultSchema must be a JSON Schema.');
  return result;
}

export async function runSession({ request, adapter, binary, args, env, prompt, progress, register = () => () => {},
  driverFactory, controlToolsFactory = createMcpTools, onFrame = () => {} } = {}) {
  const options = sessionOptions(request);
  options.captureExecution = adapter.id === 'openclaw';
  options.trackTurns = true;
  let goal = options.goal || request.contextTask || request.prompt;
  options.goal = goal.slice(0, 4000);
  const job = request.jobId || process.env.TR_METAHARNESS_JOB || `session-${randomUUID()}`;
  const budget = budgets.get(job) || new Map();
  budgets.set(job, budget);
  const runId = randomUUID();
  const config = mcpConfigFor(job, options);
  if (adapter.id === 'claude') options.mcpConfig = config.claude;
  if (adapter.id === 'codex') {
    // exec flags belong to the old one-shot surface, not app-server.
    const start = args.indexOf('exec');
    const prefix = start < 0 ? [] : args.slice(0, start);
    const model = args.lastIndexOf('--model');
    args = [...prefix, ...(model >= 0 ? ['-c', `model=${JSON.stringify(args[model + 1])}`] : []), ...config.codex];
  }
  let driver, tools, watcher, deferredWatcher, replyWaiter = null, timer, stopResult, stopTask, turns = 0;
  const deferredReplies = new Map();
  let resolveStop;
  const stopped = new Promise(resolve => { resolveStop = resolve; });
  const usage = { inputTokens: null, outputTokens: null, costUsd: null };
  const totals = () => [...budget.values()].reduce((sum, entry) => ({
    inputTokens: sum.inputTokens + (entry.usage.inputTokens || 0), outputTokens: sum.outputTokens + (entry.usage.outputTokens || 0),
    costUsd: sum.costUsd + (entry.usage.costUsd || 0), turns: sum.turns + entry.turns,
  }), { inputTokens: 0, outputTokens: 0, costUsd: 0, turns: 0 });
  const toolResults = [];
  const emit = event => progress ? progress.event(event) : appendEvent(job, event);
  const stop = (failureKind, error) => {
    if (stopResult) return;
    stopResult = { ok: false, failureKind, error };
    resolveStop(stopResult);
    stopTask = Promise.resolve(driver?.interrupt()).catch(() => {});
  };
  budget.set(runId, { usage, turns: 0, stop });
  const limit = error => { for (const entry of budget.values()) entry.stop?.('limit', error); };
  const onEvent = event => {
    if (event.kind !== 'usage') emit(['question', 'approval'].includes(event.kind) ? { ...event, kind: 'native-request' } : event);
    if (event.kind === 'usage') {
      for (const key of ['inputTokens', 'outputTokens', 'costUsd']) if (event[key] != null) {
        usage[key] = adapter.id === 'claude' ? (usage[key] || 0) + event[key] : event[key];
      }
      const used = totals();
      emit({ ...event, ...used, limits: { maxTurns: options.maxTurns, maxTokens: options.maxTokens, maxBudgetUsd: options.maxBudgetUsd } });
      if (options.maxTokens !== undefined && used.inputTokens + used.outputTokens >= options.maxTokens) limit('Job token limit reached.');
      if (options.maxBudgetUsd !== undefined && usage.costUsd !== null && used.costUsd >= options.maxBudgetUsd) limit('Job budget limit reached.');
      if (options.maxBudgetUsd !== undefined && usage.costUsd === null && adapter.id !== 'claude') stop('limit', 'The harness did not report cost, so the USD cap cannot be enforced.');
    }
    if (event.kind === 'finish') {
      turns += event.turns || 1;
      budget.get(runId).turns = turns;
      if (options.maxTurns !== undefined && totals().turns > options.maxTurns) limit('Job turn limit reached.');
    }
    const item = event.item;
    if (event.kind === 'step-end' && toolResults.length < 20 && (event.toolUseId || item?.type === 'commandExecution')) {
      toolResults.push({ tool: item ? 'shell' : 'tool', status: event.isError || item?.exitCode ? 'failed' : 'completed',
        ...(Number.isInteger(item?.exitCode) ? { exitCode: item.exitCode } : {}), output: String(item?.aggregatedOutput || event.text || '').slice(0, 4096) });
    }
    if (event.kind === 'question' || event.kind === 'approval') {
      // Native requests use the same policy, timeout and operator path as MCP.
      void Promise.resolve().then(async () => {
        if (!tools) return;
        const answer = await tools.call(event.kind === 'question' ? 'ask' : 'approve', event.kind === 'question'
          ? { questions: event.questions || event.request?.questions || [event.text || 'Reply to the agent.'] }
          : { tool_name: event.request?.tool_name || event.request?.command || event.method || 'tool', input: event.request || {} },
          // A native request pauses the harness itself with no model call, so it waits for the answer here.
          { defer: false });
        let value = answer.content[0].text;
        if (event.kind === 'approval') {
          const approval = JSON.parse(value);
          value = adapter.id === 'claude' ? approval : approval.behavior === 'allow' ? 'allow' : 'deny';
        }
        await driver.answer(event.requestId, value);
        emit({ kind: 'ack', requestId: event.requestId, ok: true, text: 'Native request answered.' });
      }).catch(error => emit({ kind: 'error', text: error.message }));
    }
  };
  const factory = driverFactory || (adapter.id === 'claude' ? createClaudeDriver : adapter.id === 'codex' ? createCodexDriver : createResumeDriver);
  const used = totals();
  const driverOptions = { ...options,
    ...(options.maxTurns !== undefined ? { maxTurns: Math.max(1, options.maxTurns - used.turns) } : {}),
    ...(options.maxBudgetUsd !== undefined ? { maxBudgetUsd: Math.max(0, options.maxBudgetUsd - used.costUsd) } : {}),
    ...(options.maxTokens !== undefined ? { maxTokens: Math.max(1, options.maxTokens - used.inputTokens - used.outputTokens) } : {}) };
  driver = factory({ harness: adapter, binary, args, cwd: request.cwd,
    env: { ...env, TR_METAHARNESS_JOB: job }, job: { id: job }, options: driverOptions, onEvent, onFrame });
  tools = controlToolsFactory({ job, approvalPolicy: options.approvalPolicy || 'auto', questionTimeoutMs: options.questionTimeoutMs });
  const unregister = register(() => { stop('cancelled', 'Job cancelled.'); void driver.close(); });
  const wait = promise => Promise.race([promise, stopped]);
  const capabilities = () => ({ ...driver.capabilities,
    goal: driver.capabilities.goal === 'native' ? 'native' : 'metaharness',
    schema: driver.capabilities.schema === 'native' ? 'native' : 'metaharness',
    limits: options.maxTokens !== undefined || adapter.id !== 'claude' ? 'metaharness' : driver.capabilities.limits });
  const next = async (text, schema) => {
    if (options.maxTurns !== undefined && totals().turns >= options.maxTurns) return { ok: false, failureKind: 'limit', error: 'Job turn limit reached.' };
    return wait(driver.next(text, { resultSchema: schema,
      ...(options.maxTurns !== undefined ? { maxTurns: options.maxTurns - totals().turns } : {}),
      ...(options.maxBudgetUsd !== undefined && usage.costUsd !== null ? { maxBudgetUsd: Math.max(0, options.maxBudgetUsd - totals().costUsd) } : {}) }));
  };
  try {
    timer = setTimeout(() => stop('process', 'Session timeout.'), request.timeoutMs || 900000);
    if (options.maxTurns !== undefined && used.turns >= options.maxTurns || options.maxTokens !== undefined && used.inputTokens + used.outputTokens >= options.maxTokens || options.maxBudgetUsd !== undefined && used.costUsd >= options.maxBudgetUsd) {
      return { ok: false, failureKind: 'limit', error: 'Job limit reached before launch.', usage, turns };
    }
    if (options.maxBudgetUsd === 0) return { ok: false, failureKind: 'limit', error: 'Job budget limit reached before launch.', usage, turns };
    await wait(driver.start(`${prompt}\n\nJob goal: ${goal}`));
    if (stopResult) return stopResult;
    emit({ kind: 'capabilities', text: 'Session controls reported.', capabilities: capabilities() });
    deferredWatcher = tailInbox(job, command => {
      if (command.type !== 'reply' || !command.requestId) return false;
      deferredReplies.set(command.requestId, command.text);
      replyWaiter?.();
      return { via: 'metaharness' };
    }, { recipient: 'deferred' });
    watcher = tailInbox(job, async command => {
      if (command.type === 'reply') return driver.send(command.text);
      if (command.type === 'approve') return driver.answer(command.requestId, command.value);
      if (command.type === 'interrupt') { await driver.interrupt(); stop('interrupted', 'Turn interrupted; the session can be resumed.'); return { via: 'metaharness' }; }
      if (command.type === 'goal') {
        if (driver.setGoal) await driver.setGoal(command.text); else await driver.send(`Job goal: ${command.text}`);
        goal = command.text;
        return { via: driver.setGoal ? 'native' : 'metaharness' };
      }
      if (command.type === 'fork') {
        const fork = await driver.fork({ atTurn: command.atTurn });
        emit({ kind: 'fork', commandId: command.id, ...fork });
        return { via: driver.capabilities.fork };
      }
      return false;
    });
    let result = await wait(driver.done);
    // Deferred questions (A-125): the agent ended its turn after asking. Hold the session with no
    // model calls until the operator replies, then start the next turn with the answer.
    while (result.ok && !stopResult) {
      const open = waitingRequests(job).filter(r => r.kind === 'question' && r.source === 'deferred');
      if (!open.length) break;
      emit({ kind: 'waiting', text: `Waiting for the operator on ${open.length} question(s); no model calls until a reply.` });
      const answer = await wait(new Promise(resolve => {
        const check = () => { const hit = open.find(r => deferredReplies.has(r.requestId)); if (hit) { replyWaiter = null; clearTimeout(limit); resolve({ request: hit, text: deferredReplies.get(hit.requestId) }); } };
        const limit = setTimeout(() => { replyWaiter = null; resolve({ request: open[0], text: NO_ANSWER, timeout: true }); }, options.questionTimeoutMs ?? QUESTION_TIMEOUT_MS);
        replyWaiter = check; check();
      }));
      if (!answer || stopResult) break;
      appendEvent(job, { kind: 'ack', command: 'ask', requestId: answer.request.requestId, ok: true, value: answer.text, text: answer.text, ...(answer.timeout ? { timeout: true } : {}) });
      result = await next(`The operator answered your question ${answer.request.text}: ${answer.text}\nContinue the task.`);
    }
    if (result.ok && options.maxTokens !== undefined && usage.inputTokens === null && usage.outputTokens === null) {
      result = { ...result, ok: false, failureKind: 'limit', error: 'The harness did not report token usage, so the token cap cannot be enforced.' };
    }
    if (result.ok && options.maxBudgetUsd !== undefined && usage.costUsd === null) {
      result = { ...result, ok: false, failureKind: 'limit', error: 'The harness did not report cost, so the USD cap cannot be enforced.' };
    }
    if ((result.ok || result.failureKind === 'schema') && options.resultSchema !== undefined) {
      let parsed = readResult(result, options.resultSchema);
      if (parsed.errors.length) {
        const corrected = await next(`Correct your final result once. Return only JSON matching ${JSON.stringify(options.resultSchema)}. Errors: ${parsed.errors.join('; ')}`, options.resultSchema);
        if (!corrected.ok) return { ...corrected, usage: { ...usage }, turns, capabilities: { ...driver.capabilities } };
        result = corrected; parsed = readResult(result, options.resultSchema);
      }
      if (parsed.errors.length) result = { ...result, ok: false, failureKind: 'schema', error: parsed.errors.join('; ') };
      else result.structured = parsed.value;
    }
    const work = result;
    if (result.ok) {
      const check = await next(`Check the goal against what you did. Goal: ${goal}\nReturn only JSON with schema ${JSON.stringify(GOAL_SCHEMA)}. List concrete evidence and all remaining work.`, GOAL_SCHEMA);
      if (!check.ok) result = { ...work, ...check };
      else {
        const parsed = readResult(check, GOAL_SCHEMA);
        result = { ...work, goalCheck: parsed.value, ...(parsed.errors.length ? { ok: false, failureKind: 'goal', error: parsed.errors.join('; ') }
          : !parsed.value.met ? { ok: false, failureKind: 'goal', error: parsed.value.remaining.join('\n') || 'The goal was not met.' }
          : !parsed.value.evidence.length || parsed.value.remaining.length ? { ok: false, failureKind: 'goal', error: 'The goal check needs evidence and no remaining work.' } : {}) };
      }
    }
    return { ...result, ...stopResult, usage: { ...usage }, turns,
      capabilities: capabilities(),
      toolResults, toolExecutionVerified: toolResults.length > 0, commandExecutionVerified: toolResults.some(t => t.tool === 'shell' && t.status === 'completed') };
  } finally {
    budget.get(runId).stop = null;
    clearTimeout(timer); unregister();
    // Close outstanding questions before waiting for the inbox consumer.
    await tools.close();
    if (stopTask) {
      let grace;
      try { await Promise.race([stopTask, new Promise(resolve => { grace = setTimeout(resolve, 1000); })]); }
      finally { clearTimeout(grace); }
    }
    await driver.close();
    await watcher?.close();
    await deferredWatcher?.close();
  }
}
