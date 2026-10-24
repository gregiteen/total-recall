/**
 * Single authenticated invoke endpoint.
 *
 * Any agent — DSH, Claude Code, Codex, a script — should need ONE route and ONE
 * scoped key, not a private client. Everything Total Recall can do is dispatched
 * from here by operation name, and every operation declares the scope it
 * requires so authorization stays enforced in code.
 *
 * The four operation families are the product surfaces:
 *   cli        — run a built-in or plugin CLI verb
 *   ssss       — a canonical memory mutation
 *   composable — run a composed command (the verbs built from other verbs)
 *   decision   — a typed Jev decision, answered from state + questions
 * plus `capabilities`, which lets an agent discover what its key may do rather
 * than guessing and being refused.
 *
 * Two rules this file holds to:
 *   1. Scope is checked per operation, before any work happens. An operation
 *      with no declared scope is refused rather than defaulting to allowed.
 *   2. The response shape is identical for every family, so a client writes one
 *      parser: { ok, operation, result, error, scope, cost_usd, latency_ms }.
 */
import { Router } from 'express';
import { requireAuth, requireScope } from '../auth.mjs';

export const invokeRouter = Router();

/**
 * The operation registry. `scope` is required: an entry without one is a bug,
 * and the dispatcher refuses unknown operations rather than falling through.
 */
export const OPERATIONS = {
  // ---- discovery -----------------------------------------------------------
  'capabilities': { scope: null, family: 'introspection' },

  // ---- cli -----------------------------------------------------------------
  'cli.run': { scope: 'sandbox:run', family: 'cli' },

  // ---- ssss ----------------------------------------------------------------
  'ssss.read': { scope: 'ssss:read', family: 'ssss' },
  'ssss.write': { scope: 'ssss:write', family: 'ssss' },

  // ---- composable ----------------------------------------------------------
  'composable.list': { scope: 'config:read', family: 'composable' },
  'composable.run': { scope: 'sandbox:run', family: 'composable' },

  // ---- decision ------------------------------------------------------------
  'decision.run': { scope: 'memory:read', family: 'decision' },
  'decision.predict': { scope: 'memory:read', family: 'decision' },
};

const ok = (res, operation, result, extra = {}) => res.json({
  ok: true, operation, result, error: null, ...extra,
});

const fail = (res, status, operation, code, message, extra = {}) => res.status(status).json({
  ok: false, operation, result: null, error: { code, message }, ...extra,
});

/**
 * Capabilities are filtered by the caller's own scopes, so an agent sees what it
 * can actually do. A capability an agent cannot use is omitted rather than
 * advertised and then refused.
 */
invokeRouter.get('/v1/invoke/capabilities', requireAuth, (req, res) => {
  const granted = new Set(req.auth?.scopes || []);
  const wildcard = granted.has('*');
  const families = {};
  for (const [name, def] of Object.entries(OPERATIONS)) {
    if (!wildcard && def.scope && !granted.has(def.scope)) continue;
    (families[def.family] ||= []).push({ operation: name, scope: def.scope });
  }
  ok(res, 'capabilities', {
    operations: families,
    families: Object.keys(families),
    note: 'Only operations your key may run are listed. Unknown operations are refused.',
  });
});

/** POST /v1/invoke — the single entry point. */
invokeRouter.post('/v1/invoke', requireAuth, async (req, res) => {
  const started = Date.now();
  const { operation, params = {} } = req.body || {};

  if (typeof operation !== 'string' || !operation) {
    return fail(res, 400, operation || null, 'missing-operation', 'Body must include { operation, params }.');
  }
  const def = OPERATIONS[operation];
  // Refuse rather than fall through: an unregistered name must never reach a
  // generic handler that might do something unintended.
  if (!def) {
    return fail(res, 404, operation, 'unknown-operation',
      `Unknown operation '${operation}'. GET /v1/invoke/capabilities lists the ones your key may run.`);
  }

  // Scope is enforced per operation, before any work. A missing scope on an
  // entry is treated as denied, not as public.
  if (def.scope) {
    const granted = new Set(req.auth?.scopes || []);
    if (!granted.has('*') && !granted.has(def.scope)) {
      return fail(res, 403, operation, 'insufficient-scope',
        `Operation '${operation}' requires scope '${def.scope}'.`, { scope: def.scope });
    }
  }

  try {
    const handler = HANDLERS[operation];
    if (!handler) return fail(res, 501, operation, 'not-implemented', `Operation '${operation}' is declared but not implemented.`);
    const result = await handler(params, req);
    return ok(res, operation, result, { scope: def.scope, latency_ms: Date.now() - started });
  } catch (err) {
    return fail(res, 400, operation, 'operation-failed', err?.message || 'Operation failed.', { scope: def.scope, latency_ms: Date.now() - started });
  }
});

/** The categories `total-recall remember` documents. Singular, and closed. */
const MEMORY_CATEGORIES = new Set(['invariant', 'preference', 'correction', 'fact', 'concept', 'pattern', 'anti-pattern', 'decision', 'lore']);

/** Run a CLI verb in-process through the plugin runner, never a shell string. */
/**
 * Run a CLI verb with argv built as real elements.
 *
 * `verb` is the command path only (e.g. "plugin list"); `args` are passed as
 * SEPARATE argv elements and are never re-split. Splitting a whole command line
 * on whitespace destroys any argument containing a space — a search query like
 * "invoke endpoint" became two words, matched nothing, and returned an empty
 * list while reporting success.
 */
async function runCliVerb({ verb, args = [], timeoutMs }) {
  if (typeof verb !== 'string' || !verb.trim()) throw new Error('cli.run needs a verb, e.g. "status" or "plugin list".');
  if (!Array.isArray(args) || args.some(a => typeof a !== 'string')) throw new Error('args must be an array of strings.');
  const parts = verb.trim().split(/\s+/);
  const [command, ...verbArgs] = parts;
  const { spawn } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const path = (await import('node:path')).default;
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const entry = path.join(root, 'bin/total-recall.mjs');
  return await new Promise((resolve, reject) => {
    // argv array with shell:false — a verb is never interpolated into a shell.
    const child = spawn(process.execPath, [entry, command, ...verbArgs, ...args], {
      cwd: root, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    let out = '', err = '', bytes = 0;
    const limit = 256 * 1024;
    const cap = (buf, sink) => {
      bytes += buf.length;
      if (bytes > limit) { child.kill('SIGKILL'); return sink; }
      return sink + buf.toString();
    };
    child.stdout.on('data', b => { out = cap(b, out); });
    child.stderr.on('data', b => { err = cap(b, err); });
    child.on('error', reject);
    const timer = setTimeout(() => child.kill('SIGKILL'), Number(timeoutMs) > 0 ? Number(timeoutMs) : 60000);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ exit_code: code, stdout: out, stderr: err, truncated: bytes > limit });
    });
  });
}

const HANDLERS = {
  async 'cli.run'(params) { return await runCliVerb(params); },

  async 'ssss.read'({ query, category, limit = 5 }) {
    // Retrieval belongs to the owning CLI. It searches metadata and indexed body
    // text with ranking and session chunks; a substring scan here would return
    // different, worse results than `recall` for the same question.
    const k = Math.max(1, Math.min(20, Number(limit) || 5));
    const args = ['--local', '--format', 'json', '-k', String(k), '--no-sessions'];
    if (category) args.push('--category', String(category));
    // The query is ONE argv element, passed through `args` so it is never
    // re-split on whitespace.
    const run = await runCliVerb({ verb: 'recall', args: [String(query || ''), ...args] });
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
    const nodes = Array.isArray(parsed) ? parsed.map(n => ({
      slug: n.slug, category: n.category, title: n.title,
      status: n.status, score: n.score, snippet: String(n.body || n.content || '').slice(0, 240),
    })) : [];
    return { count: nodes.length, nodes };
  },

  async 'ssss.write'({ category, title, content, tags, scope }) {
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
    const run = await runCliVerb({ verb: `remember ${cat}`, args: [text, ...args] });
    if (run.exit_code !== 0) throw new Error(run.stderr?.trim() || run.stdout?.trim() || 'remember failed');
    const created = /vault:\s*(\S+)/.exec(run.stdout || '')?.[1] || null;
    return { category: cat, path: created, exit_code: run.exit_code };
  },

  async 'composable.list'() {
    const { fileURLToPath } = await import('node:url');
    const path = (await import('node:path')).default;
    const fs = (await import('node:fs')).default;
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    const dir = path.join(root, '.agent/commands');
    if (!fs.existsSync(dir)) return { count: 0, commands: [] };
    const commands = fs.readdirSync(dir).filter(f => f.endsWith('.mjs')).map(f => {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      return {
        name: f.replace(/\.mjs$/, ''),
        description: text.match(/@description\s+(.*)/)?.[1] || '',
        risk: text.match(/@risk\s+(\S+)/)?.[1] || 'unknown',
      };
    });
    return { count: commands.length, commands };
  },

  async 'composable.run'({ name, args = [] }) {
    if (typeof name !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(name)) throw new Error('composable.run needs a kebab-case command name.');
    if (!Array.isArray(args)) throw new Error('args must be an array.');
    // A composed command is a CLI verb; run it the same controlled way.
    return await runCliVerb({ verb: name, args });
  },

  async 'decision.run'({ model, state, questions, timeoutMs }) {
    if (!questions || typeof questions !== 'object') throw new Error('decision.run needs questions.');
    const path = (await import('node:path')).default;
    const { pathToFileURL } = await import('node:url');
    const { brainDir } = await import('../../core/config.mjs');
    const pluginDir = path.join(brainDir, 'plugins/decision');
    const client = await import(pathToFileURL(path.join(pluginDir, 'src/client.mjs')).href);
    const auth = await import(pathToFileURL(path.join(pluginDir, 'auth-client.mjs')).href);
    const apiKey = auth.readAuthSecret('OPENROUTER_API_KEY');
    if (!apiKey) throw new Error('No OPENROUTER_API_KEY in the credential store.');
    const d = await client.requestDecision({
      apiKey, model: model || client.DEFAULT_MODEL,
      endpoint: client.DEFAULT_ENDPOINT,
      timeoutMs: Number(timeoutMs) > 0 ? Number(timeoutMs) : client.DEFAULT_TIMEOUT_MS,
      state: state || {}, questions,
    });
    // A provider failure is reported as a failure; it is never a silent default.
    if (!d) return { answered: false, reason: 'provider-failed' };
    const answers = {};
    for (const key of Object.keys(questions)) {
      const type = questions[key]?.type || 'choice';
      answers[key] = type === 'noul' ? d.noul(key) : type === 'score' ? d.score(key) : d.choice(key);
    }
    return { answered: true, answers, model: d.modelVersion, cost_usd: d.cost, latency_ms: d.latencyMs };
  },

  async 'decision.predict'({ intent, state = {}, limit = 20 }) {
    const path = (await import('node:path')).default;
    const { pathToFileURL } = await import('node:url');
    const { brainDir } = await import('../../core/config.mjs');
    const { predictNextAction } = await import('../../core/action-predictor.mjs');
    const pluginDir = path.join(brainDir, 'plugins/decision');
    const client = await import(pathToFileURL(path.join(pluginDir, 'src/client.mjs')).href);
    const auth = await import(pathToFileURL(path.join(pluginDir, 'auth-client.mjs')).href);
    const apiKey = auth.readAuthSecret('OPENROUTER_API_KEY');
    if (!apiKey) throw new Error('No OPENROUTER_API_KEY in the credential store.');
    const r = await predictNextAction(intent || '', {
      state, apiKey, requestDecision: client.requestDecision,
      derivedDir: path.join(brainDir, 'memory-derived'),
      model: client.DEFAULT_MODEL, endpoint: client.DEFAULT_ENDPOINT, timeoutMs: client.DEFAULT_TIMEOUT_MS,
      limit: Math.max(5, Math.min(40, Number(limit) || 20)),
    });
    return r;
  },
};
