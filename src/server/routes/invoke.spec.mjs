import { describe, it, expect, vi, beforeEach } from 'vitest';

// The route module imports the auth middleware at load; stub it so this spec
// exercises dispatch and scoping without a live server.
vi.mock('../auth.mjs', () => ({
  requireAuth: (req, _res, next) => next(),
  requireScope: () => (req, _res, next) => next(),
}));

const { invokeRouter, OPERATIONS } = await import('./invoke.mjs');

/** Minimal express-ish req/res doubles. */
function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

/**
 * Call a route handler with the auth middleware that would precede it.
 *
 * The handler under test is the LAST function in the route's stack; the earlier
 * entries are the auth guards the mock replaced. Calling the last one directly
 * requires first running the guards with a real `next`, which is what Express
 * does.
 */
async function callRoute(method, path, req) {
  const layer = invokeRouter.stack.find(l => l.route && l.route.path === path && l.route.methods[method]);
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} route`);
  const res = fakeRes();
  const stack = layer.route.stack.map(s => s.handle);
  let index = 0;
  await new Promise((resolve) => {
    const next = async (err) => {
      if (err) throw err;
      const fn = stack[index++];
      if (!fn) return resolve();
      const out = fn(req, res, next);
      if (out && typeof out.then === 'function') await out.catch(() => {});
      if (index >= stack.length) resolve();
    };
    next();
  });
  return res;
}

const post = (req) => callRoute('post', '/v1/invoke', req);
const capabilities = (req) => callRoute('get', '/v1/invoke/capabilities', req);

describe('agent invoke endpoint', () => {

  it('declares a scope for every operation except introspection', () => {
    // An operation without a declared scope would be reachable by any key, so
    // the registry is audited rather than trusted.
    for (const [name, def] of Object.entries(OPERATIONS)) {
      if (def.family === 'introspection') expect(def.scope).toBeNull();
      else expect(typeof def.scope, `${name} must declare a scope`).toBe('string');
    }
  });

  it('refuses a request with no operation', async () => {
    const res = await post({ body: {}, auth: { scopes: ['*'] } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('missing-operation');
  });

  it('refuses an unknown operation instead of falling through', async () => {
    const res = await post({ body: { operation: 'nope.run' }, auth: { scopes: ['*'] } });
    expect(res.statusCode).toBe(404);
    expect(res.body.error.code).toBe('unknown-operation');
  });

  it('refuses an operation the key is not scoped for', async () => {
    const res = await post({ body: { operation: 'cli.run', params: { verb: 'status' } }, auth: { scopes: ['ssss:read'] } });
    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('insufficient-scope');
    expect(res.body.scope).toBe('sandbox:run');
  });

  it('treats a missing scope list as denied, never as public', async () => {
    const res = await post({ body: { operation: 'ssss.read', params: {} }, auth: {} });
    expect(res.statusCode).toBe(403);
  });

  it('allows a wildcard key everywhere', async () => {
    const res = await post({ body: { operation: 'composable.list', params: {} }, auth: { scopes: ['*'] } });
    expect(res.body.ok).toBe(true);
  });

  it('returns one response shape for every family', async () => {
    const res = await post({ body: { operation: 'composable.list', params: {} }, auth: { scopes: ['config:read'] } });
    // One shape for every family, so a client writes a single parser.
    for (const key of ['ok', 'operation', 'result', 'error', 'scope']) expect(res.body).toHaveProperty(key);
    expect(res.body.latency_ms).toBeGreaterThanOrEqual(0);
    expect(res.body.operation).toBe('composable.list');
    expect(res.body.error).toBeNull();
  });

  it('reports an operation failure as an error, never as a silent default', async () => {
    const res = await post({ body: { operation: 'ssss.write', params: { category: 'bogus', content: 'x' } }, auth: { scopes: ['ssss:write'] } });
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('operation-failed');
    // The message names the valid set rather than failing vaguely.
    expect(res.body.error.message).toMatch(/Unknown memory category/);
    expect(res.body.error.message).toMatch(/invariant/);
  });

  it('rejects a memory category that is a node type, not a category', async () => {
    // `facts` is a directory/node type; the documented categories are singular.
    // Accepting it produced a confusing failure from deep in the write path.
    const res = await post({ body: { operation: 'ssss.write', params: { category: 'facts', content: 'x' } }, auth: { scopes: ['ssss:write'] } });
    expect(res.body.ok).toBe(false);
    expect(res.body.error.message).toMatch(/Unknown memory category 'facts'/);
  });

  it('lists only the operations the caller may run', async () => {
    const res = await capabilities({ auth: { scopes: ['ssss:read'] } });
    expect(res.body.ok).toBe(true);
    const names = Object.values(res.body.result.operations).flat().map(o => o.operation);
    expect(names).toContain('ssss.read');
    // An operation the key cannot use is omitted, not advertised then refused.
    expect(names).not.toContain('cli.run');
    expect(names).not.toContain('ssss.write');
  });

  it('validates cli.run arguments before spawning', async () => {
    const res = await post({ body: { operation: 'cli.run', params: { verb: 'status', args: [1, 2] } }, auth: { scopes: ['sandbox:run'] } });
    expect(res.body.ok).toBe(false);
    expect(res.body.error.message).toMatch(/args must be an array of strings/);
  });

  it('requires a kebab-case name for a composed command', async () => {
    const res = await post({ body: { operation: 'composable.run', params: { name: 'Not Kebab' } }, auth: { scopes: ['sandbox:run'] } });
    expect(res.body.ok).toBe(false);
    expect(res.body.error.message).toMatch(/kebab-case/);
  });

  it('requires questions for a decision', async () => {
    const res = await post({ body: { operation: 'decision.run', params: {} }, auth: { scopes: ['memory:read'] } });
    expect(res.body.ok).toBe(false);
    expect(res.body.error.message).toMatch(/needs questions/);
  });
});
