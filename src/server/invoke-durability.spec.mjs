// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { brokerConfinedFact } from './invoke-durability.mjs';
import { executeInvokeChild, INVOKE_LIMITS } from './invoke-execution.mjs';
import { getTotalRecallEngine } from '../core/ssss-kernel-bridge.mjs';

let brain, context, key, controller, run;
beforeEach(() => {
  brain = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'invoke-durability-')));
  key = { id: 'durability-key', scopes: ['invoke:restricted', 'brain:server', 'ssss:write'] };
  controller = new AbortController();
  run = vi.fn(options => executeInvokeChild({ ...options, signal: controller.signal, limits: INVOKE_LIMITS }));
  context = { req: { auth: { type: 'pat', id: key.id } }, authorityId: key.id,
    store: { loadKeys: () => [key], keyHasScope: (k, s) => !k.revoked && (!s || k.scopes.includes(s)) },
    target: 'server', selectedBrain: brain, serverBrain: brain, registryBrain: brain,
    signal: controller.signal, limits: INVOKE_LIMITS, run };
});
async function stopOwnedWorkers() {
  // A readiness assertion can fail while a real transaction is still running.
  // Stop and reap every owned worker before removing the files it may access.
  controller.abort();
  await Promise.allSettled(run.mock.results.filter(result => result.type === 'return').map(result => result.value));
}
afterEach(async () => {
  await stopOwnedWorkers();
  vi.restoreAllMocks();
  fs.rmSync(brain, { recursive: true, force: true });
});

describe('fixed host durability broker', () => {
  it('reaps an owned real worker after a readiness assertion fails', async () => {
    const ready = path.join(brain, 'worker.pid');
    const pending = run({ entry: '', nodeArgs: ['--eval',
      `require('node:fs').writeFileSync(${JSON.stringify(ready)}, String(process.pid)); setInterval(() => {}, 1000);`],
      cwd: brain, env: {}, timeoutMs: 10000 });
    await vi.waitFor(() => expect(fs.existsSync(ready)).toBe(true), { timeout: 7500 });
    const pid = Number(fs.readFileSync(ready, 'utf8'));
    expect(() => process.kill(pid, 0)).not.toThrow();
    let failure;
    try { expect(fs.existsSync(path.join(brain, 'never-created'))).toBe(true); }
    catch (error) { failure = error; }
    finally { await stopOwnedWorkers(); }
    expect(failure).toBeInstanceOf(Error);
    expect(await pending).toMatchObject({ termination_reason: 'authority-ended', signal: 'SIGKILL' });
    expect(() => process.kill(pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
  });

  it('commits via the actual SSSS worker then indexes with no canonical write grant', async () => {
    const result = await brokerConfinedFact({ content: 'durable broker glacier' }, context);
    expect(result).toMatchObject({ committed: true, indexed: true });
    const [commit, projection] = run.mock.calls.map(([options]) => options);
    expect(commit.entry).toBe(path.resolve('src/server/invoke-durability.mjs'));
    expect(commit.nodeArgs).toEqual(['--max-old-space-size=128']);
    expect(commit.env).not.toHaveProperty('HOME');
    expect(commit.env).not.toHaveProperty('NODE_OPTIONS');
    expect(JSON.parse(commit.input)).toMatchObject({ brain, caller: key.id, params: { target: 'server' } });
    expect(projection.nodeArgs).toContain('--permission');
    expect(projection.nodeArgs.filter(a => a.startsWith('--allow-fs-write='))).toEqual([
      `--allow-fs-write=${brain}/memory-derived`, `--allow-fs-write=${brain}/memory-derived/*`,
    ]);
    expect(JSON.parse(projection.input)).toEqual({ brain });
    expect(projection.timeoutMs).toBeLessThan(commit.timeoutMs);
    expect(fs.readFileSync(path.join(brain, result.path), 'utf8')).toContain('durable broker glacier');
    expect(fs.existsSync(path.join(brain, 'memory-derived/local-search.json'))).toBe(true);
    const events = fs.readFileSync(path.join(brain, 'memory-vault/.events/confined-memory.jsonl'), 'utf8');
    expect(JSON.parse(events.trim())).toMatchObject({ action: 'create', principal: { id: key.id, capabilities: ['memory:create', 'ssss:memory:create'] } });
    // Probe the exact projection grants with real filesystem operations.
    const probe = await executeInvokeChild({ ...projection, input: '', entry: '',
      nodeArgs: [...projection.nodeArgs, '--input-type=module', '--eval',
        `import fs from 'node:fs'; let denied=false; try { fs.writeFileSync(${JSON.stringify(path.join(brain, 'memory-vault/facts/escape.md'))}, 'escape'); } catch(e) { denied=e.code==='ERR_ACCESS_DENIED'; } console.log(JSON.stringify({denied}));`],
      signal: controller.signal, limits: INVOKE_LIMITS });
    expect(probe.exit_code).toBe(0);
    expect(JSON.parse(probe.stdout)).toEqual({ denied: true });
    const rejected = await executeInvokeChild({ ...projection,
      input: JSON.stringify({ brain, params: { content: 'must not create' }, caller: key.id }), limits: INVOKE_LIMITS });
    expect(rejected.exit_code).toBe(1);
    expect(fs.readdirSync(path.join(brain, 'memory-vault/facts'))).toHaveLength(1);
  // Several real native workers exercise commit, projection and denied writes.
  }, 60000);

  it.each(['revoked', 'read-only', 'full', 'foreign', 'identity', 'invalid-params'])('independently denies %s before starting a transaction', async mode => {
    if (mode === 'revoked') key.revoked = true;
    if (mode === 'read-only') key.scopes = ['invoke:restricted', 'brain:server'];
    if (mode === 'full') key.scopes = ['invoke:full', 'brain:server', 'ssss:write'];
    if (mode === 'foreign') context.selectedBrain = path.join(brain, 'foreign');
    if (mode === 'identity') context.authorityId = 'another-key';
    await expect(brokerConfinedFact({ content: 'denied', ...(mode === 'invalid-params' ? { path: 'escape' } : {}) }, context)).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(brain, 'memory-vault'))).toBe(false);
  });

  it('retains the real commit when indexing fails', async () => {
    fs.writeFileSync(path.join(brain, 'memory-derived'), 'not a directory');
    await expect(brokerConfinedFact({ content: 'partial durable commit' }, context)).rejects.toMatchObject({ result: { committed: true, indexed: false } });
    expect(fs.readdirSync(path.join(brain, 'memory-vault/facts'))).toHaveLength(1);
  });

  it('retains the durable commit when the actual projection worker times out', async () => {
    run.mockImplementation(options => executeInvokeChild({ ...options,
      ...(options.entry.endsWith('invoke-write-child.mjs') ? { timeoutMs: 1 } : {}),
      signal: controller.signal, limits: INVOKE_LIMITS }));
    await expect(brokerConfinedFact({ content: 'commit survives projection timeout' }, context)).rejects.toMatchObject({
      code: 'timeout', result: { committed: true, indexed: false },
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(fs.readdirSync(path.join(brain, 'memory-vault/facts'))).toHaveLength(1);
    expect(fs.existsSync(path.join(brain, 'memory-derived/local-search.json'))).toBe(false);
  });

  it('retains the real commit when authority ends between stages and never starts indexing', async () => {
    run.mockImplementationOnce(async options => { const response = await executeInvokeChild(options); key.revoked = true; return response; });
    await expect(brokerConfinedFact({ content: 'revoked after commit' }, context)).rejects.toMatchObject({ result: { committed: true, indexed: false } });
    expect(run).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(brain, 'memory-derived'))).toBe(false);
  });

  it.each(['timeout', 'abort'])('kills a transaction waiting on an event lock: %s; recovery rolls it back', async mode => {
    const events = path.join(brain, 'memory-vault/.events');
    fs.mkdirSync(events, { recursive: true });
    const lock = path.join(events, 'confined-memory.jsonl.lock');
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, host: os.hostname(), acquired_at: new Date().toISOString() }));
    const pending = brokerConfinedFact({ content: 'interrupted before event commit', timeoutMs: 10000 }, context);
    // Attach rejection handling immediately while waiting for the real worker.
    const observed = pending.catch(error => error);
    // Atomic writes expose a temporary entry before rename; abort only after the real fact exists.
    // Cold native-worker startup can exceed 1.5s under contention. Wait for the
    // real canonical file (not a temporary atomic-write entry), within its deadline.
    await vi.waitFor(() => {
      const facts = path.join(brain, 'memory-vault/facts');
      expect(fs.existsSync(facts) ? fs.readdirSync(facts)
        .filter(name => /^fact-[0-9a-f-]{36}\.md$/.test(name)) : []).toHaveLength(1);
    }, { timeout: 7500 });
    if (mode === 'abort') controller.abort();
    const error = await observed;
    expect(error).toMatchObject({ code: mode === 'timeout' ? 'timeout' : 'authority-ended', result: { committed: 'unknown', indexed: false } });
    expect(run).toHaveBeenCalledTimes(1);
    // The child has exited; no owned transaction can continue after this point.
    fs.unlinkSync(lock);
    const recovered = await getTotalRecallEngine({ forceNew: true }).recover(path.join(brain, 'memory-vault'));
    expect(recovered).toContainEqual(expect.objectContaining({ outcome: 'rolled_back' }));
    expect(fs.readdirSync(path.join(brain, 'memory-vault/facts'))).toEqual([]);
  });
});
