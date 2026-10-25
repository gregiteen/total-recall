/** Optional developer API. Explicit grants precede every owner execution. */
import { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth } from '../auth.mjs';
import { loadKeys, keyHasScope } from '../keys.mjs';
import { brainDir, globalAgentDir, globalBrainDir } from '../../core/config.mjs';
import { logger } from '../../core/logger.mjs';
import crypto from 'node:crypto';
import { appendVfsEvent } from '../../core/ssss-operation-service.mjs';
import { CLI_COMMANDS } from '../../core/cli-commands.mjs';
import { buildPluginCatalog } from '../../core/plugin-catalog.mjs';
import { listSurfaceCommands } from '../../core/command-surface.mjs';
import { invokeAuthority, authorizeInvoke, operationAllowed } from '../invoke-policy.mjs';
import { restrictedBrainTargets } from '../invoke-targets.mjs';
import { INVOKE_LIMITS, InvokeError, executeInvokeChild, requireSuccessfulRun, invokeEnvironment, absoluteTarget } from '../invoke-execution.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// Share across router instances in this server; do not race projection refreshes.
const mutatingBrains = new Set();
export const OPERATIONS = Object.freeze(Object.fromEntries(Object.entries({
  capabilities: { scope: null, family: 'introspection' },
  'cli.run': { scope: 'sandbox:run', family: 'cli' },
  'ssss.read': { scope: 'ssss:read', family: 'ssss' },
  'ssss.write': { scope: 'ssss:write', family: 'ssss' },
  'composable.list': { scope: 'config:read', family: 'composable' },
  'composable.run': { scope: 'sandbox:run', family: 'composable' },
  'decision.run': { scope: 'memory:read', family: 'decision' },
  'decision.predict': { scope: 'memory:read', family: 'decision' },
}).map(([name, def]) => [name, Object.freeze(def)])));

const fail = (res, status, operation, code, message, extra = {}) => res.status(status).json({
  ok: false, operation, result: null, error: { code, message }, ...extra,
});

/** Only scopes that can execute are advertised. */
function capabilitiesFor(authority, limits = INVOKE_LIMITS, targets = ['server']) {
  const families = {};
  for (const [name, def] of Object.entries(OPERATIONS)) {
    if (!operationAllowed(authority, name, def.scope, targets)) continue;
    (families[def.family] ||= []).push({ operation: name, scope: def.scope });
  }
  return { operations: families, families: Object.keys(families), mode: authority.mode,
    targets: authority.mode === 'full' ? 'host' : targets,
    credentials: authority.mode === 'full' ? 'host-auth-owner' : [],
    provider_spending: authority.mode === 'full' ? 'trusted-host-authority' : 0,
    limits };
}

/** Injectable dependencies allow real HTTP tests with disposable auth-owned keys. */
export function createInvokeRouter({ auth = requireAuth, store = { loadKeys, keyHasScope },
  execute = executeInvokeChild, audit,
  cwd = process.cwd(), serverBrain = brainDir, registryBrain = globalBrainDir, limits = INVOKE_LIMITS } = {}) {
  const router = Router();
  const resolveTargets = authority => authority.mode === 'restricted' ?
    restrictedBrainTargets(authority, { serverBrain, registryBrain }) : new Map();
  const recordAudit = audit || (event => appendVfsEvent(`invoke/${crypto.randomUUID()}`, event, {
    vaultRoot: path.join(serverBrain, 'memory-vault'), workspaceId: 'invoke', actorRole: 'system', intent: 'Record developer invoke outcome',
  }));
  const active = new Map();
  let total = 0;
  router.get('/v1/invoke/capabilities', auth, (req, res) => {
    try {
      const authority = invokeAuthority(req, store);
      res.json({ ok: true, operation: 'capabilities', result: capabilitiesFor(authority, limits, [...resolveTargets(authority).keys()]), error: null });
    } catch (err) { fail(res, err.status || 503, 'capabilities', err.code || 'authority-unavailable', err.code ? err.message : 'Authority validation unavailable.'); }
  });
  router.post('/v1/invoke', auth, async (req, res) => {
    const started = Date.now();
    const { operation, params = {} } = req.body || {};
    if (typeof operation !== 'string' || !operation) return fail(res, 400, null, 'missing-operation', 'Body must include { operation, params }.');
    if (!Object.hasOwn(OPERATIONS, operation)) return fail(res, 404, operation, 'unknown-operation', 'Unknown operation.');
    const def = OPERATIONS[operation];
    let authority, timer, controller, disconnected, counted = false, outcome = 'denied', target = null, mutationBrain, mutationResult;
    try {
      if (!params || typeof params !== 'object' || Array.isArray(params)) throw new InvokeError(400, 'invalid-params', 'params must be an object.');
      if (Buffer.byteLength(JSON.stringify(params)) > 16384) throw new InvokeError(413, 'input-limit', 'Invoke parameters exceed 16 KiB.');
      authority = invokeAuthority(req, store);
      const targets = resolveTargets(authority), targetNames = [...targets.keys()];
      authorizeInvoke(authority, operation, def.scope, params, targetNames);
      target = authority.mode === 'restricted' ? (operation === 'capabilities' ? null : params.target ?? 'server') : absoluteTarget(params.target, cwd);
      const selectedBrain = authority.mode === 'restricted' && target ? targets.get(target) : serverBrain;
      if (authority.mode === 'restricted' && operation === 'ssss.write') {
        const brain = selectedBrain;
        if (mutatingBrains.has(brain)) throw new InvokeError(429, 'brain-write-busy', 'A confined write is already active for this brain.');
        mutatingBrains.add(brain); mutationBrain = brain;
      }
      if (total >= limits.concurrency || (active.get(authority.id) || 0) >= limits.perKey) throw new InvokeError(429, 'concurrency-limit', 'Execution concurrency limit reached.');
      total++; active.set(authority.id, (active.get(authority.id) || 0) + 1); counted = true;
      try { await recordAudit({ caller: authority.id, mode: authority.mode, operation, target, outcome: 'authorized' }); }
      catch { throw new InvokeError(503, 'audit-unavailable', 'Execution audit is unavailable; no work was started.'); }
      controller = new AbortController();
      disconnected = () => { if (!res.writableEnded) controller.abort(); };
      req.once('aborted', disconnected); res.once('close', disconnected);
      const revalidate = () => {
        try {
          const current = invokeAuthority(req, store);
          if (current.mode !== authority.mode) throw new Error('mode changed');
          const currentTargets = resolveTargets(current);
          authorizeInvoke(current, operation, def.scope, params, [...currentTargets.keys()]);
          if (current.mode === 'restricted' && target && currentTargets.get(target) !== selectedBrain) throw new Error('target changed');
        } catch { controller.abort(); }
      };
      revalidate();
      timer = setInterval(revalidate, 250); timer.unref?.();
      const context = { authority, target, serverBrain, selectedBrain, signal: controller.signal, limits,
        run: options => {
          revalidate();
          return execute({ ...options, signal: controller.signal, limits });
        } };
      let result;
      if (operation === 'capabilities') result = capabilitiesFor(authority, limits, targetNames);
      else result = await HANDLERS[operation](params, context);
      if (operation === 'ssss.write' && authority.mode === 'restricted') mutationResult = result;
      revalidate();
      if (controller.signal.aborted) throw new InvokeError(403, 'authority-ended', 'Caller authority ended during execution.');
      outcome = 'success';
      await recordAudit({ caller: authority.id, mode: authority.mode, operation, target, outcome, latency_ms: Date.now() - started });
      return res.json({ ok: true, operation, result, error: null, scope: def.scope, latency_ms: Date.now() - started });
    } catch (err) {
      outcome = err instanceof InvokeError ? err.code : 'operation-failed';
      // Error strings from owner code can contain secrets. Only curated policy
      // messages and explicitly requested full-mode command output are returned.
      try { await recordAudit({ caller: authority?.id || req.auth?.id || 'unresolved', operation, target, outcome, latency_ms: Date.now() - started }); }
      catch {
        logger.error('invoke', 'Execution outcome audit unavailable', { operation, caller: authority?.id || 'unresolved' });
        return fail(res, 503, operation, 'audit-unavailable', 'Execution audit could not be recorded.', mutationResult ? { result: mutationResult } : {});
      }
      return fail(res, err.status || 400, operation, outcome, err instanceof InvokeError ? err.message : 'Operation failed.',
        { scope: def.scope, latency_ms: Date.now() - started, ...(err.result || mutationResult ? { result: err.result || mutationResult } : {}) });
    } finally {
      clearInterval(timer);
      if (mutationBrain) mutatingBrains.delete(mutationBrain);
      if (disconnected) { req.removeListener('aborted', disconnected); res.removeListener('close', disconnected); }
      if (counted) { total--; const n = active.get(authority.id) - 1; if (n) active.set(authority.id, n); else active.delete(authority.id); }
    }
  });
  return router;
}

export const invokeRouter = createInvokeRouter();

/** The categories `total-recall remember` documents. Singular, and closed. */
const MEMORY_CATEGORIES = new Set(['invariant', 'preference', 'correction', 'fact', 'concept', 'pattern', 'anti-pattern', 'decision', 'lore']);

/** The same two executable composed-command directories used by the CLI. */
function composedCommands(cwd) {
  return listSurfaceCommands([
    { scope: 'project', dir: path.join(cwd, '.agent/commands') },
    { scope: 'global', dir: path.join(globalAgentDir, 'commands') },
  ]);
}

async function runCliVerb({ verb, args = [], timeoutMs }, context) {
  if (typeof verb !== 'string' || !verb.trim()) throw new InvokeError(400, 'invalid-verb', 'cli.run needs a registered verb.');
  if (!Array.isArray(args) || args.some(a => typeof a !== 'string' || a.includes('\0'))) throw new InvokeError(400, 'invalid-args', 'args must be an array of strings.');
  const parts = verb.trim().split(/\s+/);
  const [command] = parts;
  const catalog = buildPluginCatalog(context.target);
  const plugin = catalog.plugins.find(p => p.namespace === command && p.callable && p.activation.enabled);
  if (!Object.hasOwn(CLI_COMMANDS, command) && !plugin && !composedCommands(context.target).some(c => c.name === command)) {
    throw new InvokeError(404, 'unregistered-command', 'Command is not registered in the authorized target.');
  }
  const env = invokeEnvironment(true);
  env.TR_INVOKE_CONTEXT = JSON.stringify({ caller: context.authority.id, mode: 'full', target: context.target });
  return requireSuccessfulRun(await context.run({ entry: path.join(root, 'bin/total-recall.mjs'),
    args: [...parts, ...args], cwd: context.target, env, timeoutMs }));
}

const HANDLERS = {
  async 'cli.run'(params, context) { return await runCliVerb(params, context); },

  async 'ssss.read'({ query, category, limit = 5, timeoutMs }, context) {
    if (typeof query !== 'string' || !query.trim() || query.startsWith('-')) throw new InvokeError(400, 'invalid-query', 'query must be nonempty text, not a CLI option.');
    if (category !== undefined && (typeof category !== 'string' || !/^[a-z][a-z-]{0,63}$/.test(category))) throw new InvokeError(400, 'invalid-category', 'Invalid category.');
    if (context.authority.mode === 'restricted') {
      const brain = context.selectedBrain;
      const run = requireSuccessfulRun(await context.run({ entry: path.join(root, 'src/server/invoke-read-child.mjs'),
        cwd: root, env: invokeEnvironment(false), timeoutMs, nodeArgs: ['--max-old-space-size=128', '--permission',
          `--allow-fs-read=${path.join(root, 'src')}`, `--allow-fs-read=${path.join(root, 'node_modules')}`,
          `--allow-fs-read=${path.join(root, 'package.json')}`, `--allow-fs-read=${brain}`],
        input: JSON.stringify({ brain, query, category, limit: Math.max(1, Math.min(20, Number(limit) || 5)) }) }));
      try { return JSON.parse(run.stdout); } catch { throw new InvokeError(502, 'invalid-owner-output', 'Retrieval returned invalid output.'); }
    }
    // Retrieval belongs to the owning CLI. It searches metadata and indexed body
    // text with ranking and session chunks; a substring scan here would return
    // different, worse results than `recall` for the same question.
    const k = Math.max(1, Math.min(20, Number(limit) || 5));
    const args = ['--local', '--format', 'json', '-k', String(k), '--no-sessions'];
    if (category) args.push('--category', String(category));
    // The query is ONE argv element, passed through `args` so it is never
    // re-split on whitespace.
    const run = await runCliVerb({ verb: 'recall', args: [query, ...args], timeoutMs }, context);
    if (run.exit_code !== 0) throw new Error(run.stderr?.trim() || 'recall failed');
    // The CLI pretty-prints ONE JSON array across many lines, so it cannot be
    // read line-by-line: a line-based reader finds only `[` and fails to parse,
    // which surfaces as a successful call returning zero results. Slice from the
    // first `[` to the last `]` to tolerate leading log lines.
    const stdout = String(run.stdout || '');
    const start = stdout.indexOf('[');
    const end = stdout.lastIndexOf(']');
    let parsed = null;
    if (start !== -1 && end > start) {
      try { parsed = JSON.parse(stdout.slice(start, end + 1)); } catch { /* unparseable */ }
    }
    if (!Array.isArray(parsed)) throw new InvokeError(502, 'invalid-owner-output', 'Recall did not return a valid result array.');
    const nodes = parsed.map(n => ({
      slug: n.slug, category: n.category, title: n.title,
      status: n.status, score: n.score, snippet: String(n.body || n.content || '').slice(0, 240),
    }));
    return { count: nodes.length, nodes };
  },

  async 'ssss.write'(params, context) {
    const { category, title, content, tags, scope, timeoutMs } = params;
    if (context.authority.mode === 'restricted') {
      const brain = context.selectedBrain;
      const run = await context.run({ entry: path.join(root, 'src/server/invoke-write-child.mjs'),
        cwd: root, env: invokeEnvironment(false), timeoutMs, nodeArgs: ['--max-old-space-size=128', '--permission',
          `--allow-fs-read=${path.join(root, 'src')}`, `--allow-fs-read=${path.join(root, 'node_modules')}`,
          `--allow-fs-read=${path.join(root, 'package.json')}`, `--allow-fs-read=${brain}`,
          `--allow-fs-write=${path.join(brain, 'memory-vault')}`,
          `--allow-fs-write=${path.join(brain, 'memory-vault', '*')}`,
          `--allow-fs-write=${path.join(brain, 'memory-derived')}`,
          `--allow-fs-write=${path.join(brain, 'memory-derived', '*')}`],
        input: JSON.stringify({ brain, params: { ...params, target: 'server' }, caller: context.authority.id }) });
      let result;
      try { result = JSON.parse(run.stdout); } catch { /* interruption may precede output */ }
      if (run.exit_code !== 0 || run.termination_reason || run.truncated) {
        throw new InvokeError(run.termination_reason === 'timeout' ? 504 : run.termination_reason === 'authority-ended' ? 403 : 422,
          run.termination_reason || 'mutation-failed', 'Fact creation did not complete; check committed/indexed status before retry.',
          result || { committed: 'unknown', indexed: false });
      }
      if (!result?.committed || !result?.indexed) throw new InvokeError(502, 'invalid-owner-output', 'Mutation returned invalid output.', { committed: 'unknown', indexed: false });
      return result;
    }
    if (!content || typeof content !== 'string') throw new Error('ssss.write needs content.');
    // Canonical memory is written by its owning CLI, never reimplemented here.
    // `remember` runs the validated write path and recompiles the derived
    // surfaces; a hand-rolled vault write would bypass both and could leave the
    // indexes stale while reporting success.
    const cat = typeof category === 'string' && category.trim() ? category.trim() : 'fact';
    // These are the categories `remember` documents. They are singular, and a
    // node TYPE (`facts`) is not one of them — passing it produced a confusing
    // failure from deep inside the write path.
    if (!MEMORY_CATEGORIES.has(cat)) {
      throw new Error(`Unknown memory category '${cat}'. Valid: ${[...MEMORY_CATEGORIES].join(', ')}.`);
    }
    const text = title ? `${title}\n\n${content}` : content;
    const args = ['--tags', Array.isArray(tags) && tags.length ? tags.join(',') : 'invoke'];
    if (scope === 'global') args.push('--global');
    else args.push('--project');
    // Same rule as ssss.read: the memory text is one argv element, never split.
    const run = await runCliVerb({ verb: `remember ${cat}`, args: [text, ...args], timeoutMs }, context);
    if (run.exit_code !== 0) throw new Error(run.stderr?.trim() || run.stdout?.trim() || 'remember failed');
    const created = /vault:\s*(\S+)/.exec(run.stdout || '')?.[1] || null;
    return { category: cat, path: created, exit_code: run.exit_code };
  },

  async 'composable.list'(_params, context) {
    const catalog = buildPluginCatalog(context.target);
    const commands = composedCommands(context.target).filter(c => !Object.hasOwn(CLI_COMMANDS, c.name) &&
      !catalog.plugins.some(p => p.callable && p.activation.enabled && p.namespace === c.name));
    return { count: commands.length, commands };
  },

  async 'composable.run'({ name, args = [], timeoutMs }, context) {
    if (typeof name !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(name)) throw new InvokeError(400, 'invalid-name', 'composable.run needs a kebab-case command name.');
    if (Object.hasOwn(CLI_COMMANDS, name) || !composedCommands(context.target).some(c => c.name === name)) throw new InvokeError(404, 'unregistered-command', 'Composed name is not executable in the authorized target.');
    const catalog = buildPluginCatalog(context.target);
    if (catalog.plugins.some(p => p.callable && p.activation.enabled && p.namespace === name)) throw new InvokeError(409, 'shadowed-command', 'A plugin shadows this composed name.');
    return await runCliVerb({ verb: name, args, timeoutMs }, context);
  },

  async 'decision.run'(params, context) {
    if (!params.questions || typeof params.questions !== 'object' || Array.isArray(params.questions)) {
      throw new InvokeError(400, 'invalid-questions', 'decision.run needs a question object.');
    }
    return runDecision('decision.run', params, context);
  },

  async 'decision.predict'(params, context) {
    return runDecision('decision.predict', params, context);
  },
};

async function runDecision(operation, params, context) {
  const requested = params.timeoutMs === undefined ? context.limits.timeoutMs : Number(params.timeoutMs);
  if (!Number.isFinite(requested) || requested <= 0) throw new InvokeError(400, 'invalid-timeout', 'timeoutMs must be positive and finite.');
  const timeoutMs = Math.min(requested, context.limits.timeoutMs);
  const env = invokeEnvironment(true);
  env.TR_INVOKE_CONTEXT = JSON.stringify({ caller: context.authority.id, mode: 'full', target: context.target });
  const run = await context.run({ entry: path.join(root, 'src/server/invoke-decision-child.mjs'),
    cwd: context.target, env, timeoutMs,
    input: JSON.stringify({ operation, params, brain: context.serverBrain, timeoutMs }) });
  // Provider/auth diagnostics may contain credentials. Unlike requested cli.run
  // output, these pipes are never exposed, even on timeout or malformed output.
  if (run.termination_reason || run.truncated) {
    const code = run.termination_reason || 'output-limit';
    throw new InvokeError(code === 'timeout' ? 504 : code === 'authority-ended' ? 403 : 422,
      code, 'Decision execution did not complete; remote work may already have been accepted.');
  }
  let envelope;
  try { envelope = JSON.parse(run.stdout); } catch { /* denied below */ }
  if (run.exit_code !== 0) throw new InvokeError(502, 'decision-failed', 'Decision owner failed.');
  if (envelope?.ok === false) {
    const credential = envelope.error === 'credential-unavailable';
    throw new InvokeError(credential ? 503 : 502, credential ? 'credential-unavailable' : 'provider-failed',
      credential ? 'Decision credential is unavailable.' : 'Decision provider failed.');
  }
  if (envelope?.ok !== true || !envelope.result || typeof envelope.result !== 'object' || Array.isArray(envelope.result)) {
    throw new InvokeError(502, 'invalid-owner-output', 'Decision owner returned invalid output.');
  }
  return envelope.result;
}
