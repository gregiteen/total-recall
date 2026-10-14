import { describe, it, expect, afterEach } from 'vitest';
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
    expect(replay.value).toHaveLength(1);
    await expect(executePluginState({ ...request, value: { id: 2 } })).rejects.toThrow(/idempotency conflict/);
    await expect(executePluginState({ ...request, file: path.join(path.dirname(file), 'other.json') })).rejects.toThrow(/idempotency conflict/);
  });
  it('rejects root and document symlinks, invalid owners and unowned guards', () => {
    const file = fixture(), root = path.dirname(file), outside = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-outside-')); roots.push(outside);
    fs.symlinkSync(outside, path.join(root, '.ssss'));
    expect(() => new PluginStateStore(file, 'deploy').read({})).toThrow(/real directory/);
    expect(() => new PluginStateStore(file, '../deploy')).toThrow(/identity/);
  });
});
