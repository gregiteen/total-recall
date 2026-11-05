import { describe, it, expect, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PluginStateStore, executePluginState } from './plugin-state-store.mjs';

const roots = [];
function fixture() { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-state-')); roots.push(root); return path.join(root, 'state'); }
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
describe('native plugin SSSS state', () => {
  it('uses canonical Markdown and immutable kernel audit events without raw state writes', () => {
    const file = fixture(), store = new PluginStateStore(file, 'deploy');
    expect(store.read({ slots: {} })).toEqual({ slots: {} });
    expect(fs.existsSync(file)).toBe(false);
    expect(store.write({ slots: { green: { version: '2' } } }).success).toBe(true);
    expect(new PluginStateStore(file, 'deploy').read(null).slots.green.version).toBe('2');
    expect(fs.readFileSync(store.documentPath, 'utf8')).toContain('plugin-store:state');
    expect(fs.readdirSync(path.join(path.dirname(file), '.ssss/.events')).length).toBeGreaterThan(0);
    expect(fs.existsSync(file)).toBe(false);
  });
  it('refuses stale read-modify-write and does not silently reset corruption', () => {
    const file = fixture(), one = new PluginStateStore(file, 'tickets'), two = new PluginStateStore(file, 'tickets');
    one.read({}); two.read({}); one.write({ inventory: 1 });
    expect(() => two.write({ inventory: 2 })).toThrow(/version conflict/);
    fs.writeFileSync(one.documentPath, 'broken');
    expect(() => one.read({})).toThrow(/Invalid SSSS/);
  });
  it('keeps ledger records append-only and rejects replacement', () => {
    const store = new PluginStateStore(fixture(), 'phone');
    store.append({ id: 1 }); store.append({ id: 2 });
    expect(store.read([])).toEqual([{ id: 1 }, { id: 2 }]);
    expect(() => store.write([])).toThrow(/document type|Append-only/);
    expect(store.read([])).toHaveLength(2);
  });
  it('replays identical native intents durably and rejects conflicting keys', async () => {
    const file = fixture(), request = { file, plugin: 'phone', action: 'append', value: { id: 1 }, idempotencyKey: 'fixed' };
    const first = await executePluginState(request), replay = await executePluginState(request);
    expect(replay.receipt.operation_id).toBe(first.receipt.operation_id);
    expect(new PluginStateStore(file, 'phone').read([])).toHaveLength(1);
    await expect(executePluginState({ ...request, value: { id: 2 } })).rejects.toThrow(/idempotency conflict/);
    await expect(executePluginState({ ...request, file: path.join(path.dirname(file), 'other.json') })).rejects.toThrow(/idempotency conflict/);
  });
  it('serializes concurrent ledger appends without dropping audit records', async () => {
    const file = fixture();
    const results = await Promise.all([0, 1, 2, 3].map(id => executePluginState({ file, plugin: 'auth', action: 'append', value: { id } })));
    expect(results.every(result => result.receipt.success)).toBe(true);
    const rows = new PluginStateStore(file, 'auth').read([]);
    expect(rows.map(row => row.id).sort()).toEqual([0, 1, 2, 3]);
  });
  it('times out on a persistent guard without deleting it', async () => {
    const file = fixture(), lock = path.join(path.dirname(file), '.ssss', '.mutation-lock');
    fs.mkdirSync(lock, { recursive: true });
    await expect(executePluginState({ file, plugin: 'auth', action: 'append', value: { id: 1 }, guardTimeoutMs: 30 })).rejects.toThrow(/busy/);
    expect(fs.statSync(lock).isDirectory()).toBe(true);
    expect(new PluginStateStore(file, 'auth').read([])).toEqual([]);
  });
  it('starts a new ledger document at the size limit and never rewrites a sealed one', async () => {
    const file = fixture(), store = new PluginStateStore(file, 'auth');
    const append = id => executePluginState({ file, plugin: 'auth', action: 'append', value: { id }, segmentBytes: 400 });
    await append(0);
    const namespace = path.join(path.dirname(file), '.ssss/auth');
    let id = 1;
    while (fs.readdirSync(namespace).length === 1) await append(id++);
    const sealed = fs.readFileSync(store.documentPath, 'utf8');
    const lastInSealed = id - 2;
    for (const next of [id, id + 1, id + 2]) await append(next);
    expect(fs.readFileSync(store.documentPath, 'utf8')).toBe(sealed);
    expect(sealed).toContain(`{"id":${lastInSealed}}`);
    expect(store.read([]).map(row => row.id)).toEqual(Array.from({ length: id + 3 }, (_, index) => index));
    expect(store.readTail(2).map(row => row.id)).toEqual([id + 1, id + 2]);
    expect(store.readTail(1000)).toHaveLength(id + 3);
  });
  it('returns the version and receipt only, whatever the ledger holds', async () => {
    const file = fixture();
    await executePluginState({ file, plugin: 'auth', action: 'append', value: { id: 0 } });
    const result = await executePluginState({ file, plugin: 'auth', action: 'append', value: { id: 1 } });
    expect(Object.keys(result).sort()).toEqual(['receipt', 'version']);
  });
  it('still replays a retried append after the ledger rolled over', async () => {
    const file = fixture(), request = { file, plugin: 'auth', action: 'append', value: { id: 'retry' }, idempotencyKey: 'fixed', segmentBytes: 100 };
    const first = await executePluginState(request);
    await executePluginState({ file, plugin: 'auth', action: 'append', value: { id: 'later' }, segmentBytes: 100 });
    const replay = await executePluginState(request);
    expect(replay.receipt.operation_id).toBe(first.receipt.operation_id);
    expect(new PluginStateStore(file, 'auth').read([]).map(row => row.id)).toEqual(['retry', 'later']);
  });
  it('refuses to seal a state document as ledger history', async () => {
    const file = fixture();
    new PluginStateStore(file, 'auth').write({ big: 'x'.repeat(500) });
    await expect(executePluginState({ file, plugin: 'auth', action: 'append', value: { id: 1 }, segmentBytes: 100 })).rejects.toThrow(/not append-only/);
  });
  it('appends without blocking the event loop and batches rows queued meanwhile', async () => {
    const file = fixture(), store = new PluginStateStore(file, 'auth');
    let ticks = 0;
    const timer = setInterval(() => { ticks += 1; }, 5);
    const receipts = await Promise.all(Array.from({ length: 20 }, (_, id) => store.appendAsync({ id })));
    clearInterval(timer);
    expect(ticks).toBeGreaterThan(5);
    expect(receipts.every(receipt => receipt.success)).toBe(true);
    expect(store.read([]).map(row => row.id)).toEqual(Array.from({ length: 20 }, (_, id) => id));
    expect(new Set(receipts.map(receipt => receipt.operation_id)).size).toBe(2);
  }, 30000);
  it('rejects every queued row when its append cannot commit', async () => {
    const file = fixture(), store = new PluginStateStore(file, 'auth');
    fs.mkdirSync(path.join(path.dirname(file), '.ssss', '.mutation-lock'), { recursive: true });
    await expect(store.appendAsync({ id: 1 })).rejects.toThrow(/busy/);
    fs.rmdirSync(path.join(path.dirname(file), '.ssss', '.mutation-lock'));
    expect(store.read([])).toEqual([]);
  }, 30000);
  it('removes expired idempotency records from one-shot writers', async () => {
    const file = fixture();
    await executePluginState({ file, plugin: 'auth', action: 'append', value: { id: 0 }, idempotencyKey: 'old' });
    const directory = path.join(path.dirname(file), '.ssss/.idempotency');
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const [entry] = fs.readdirSync(directory).filter(name => name.endsWith('.json'));
    fs.utimesSync(path.join(directory, entry), old, old);
    const spy = vi.spyOn(crypto, 'randomInt').mockReturnValue(0);
    try { await executePluginState({ file, plugin: 'auth', action: 'append', value: { id: 1 } }); }
    finally { spy.mockRestore(); }
    expect(fs.readdirSync(directory)).not.toContain(entry);
  });
  it('rejects root and document symlinks, invalid owners and unowned guards', () => {
    const file = fixture(), root = path.dirname(file), outside = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-outside-')); roots.push(outside);
    fs.symlinkSync(outside, path.join(root, '.ssss'));
    expect(() => new PluginStateStore(file, 'deploy').read({})).toThrow(/real directory/);
    expect(() => new PluginStateStore(file, '../deploy')).toThrow(/identity/);
  });
});
