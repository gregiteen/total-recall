import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { syncPluginCapabilities, CAPABILITY_PATH } from './plugin-capability-store.mjs';
import { findVfsDocumentByPath } from './vfs-documents.mjs';
import { processOperationAsync } from './operation-validator.mjs';

const roots = [];
const temp = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-capstore-')); roots.push(root); return root; };
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const catalog = (ids, fingerprint = ids.join(',') || 'empty') => ({ fingerprint, plugins: [], capabilities: ids.map(id => ({ id })) });
const read = vault => findVfsDocumentByPath(CAPABILITY_PATH, vault);
const sha = text => crypto.createHash('sha256').update(text).digest('hex');

describe('plugin capability store', () => {
  it('writes and reads a validated asset whose hash is the body hash, not the catalog fingerprint', async () => {
    const vault = temp();
    expect(await syncPluginCapabilities(catalog(['a', 'b'], 'fp-1'), vault)).toEqual({ changed: true, count: 2 });
    const doc = read(vault);
    expect(doc.type).toBe('asset');
    expect(JSON.parse(doc.body).capabilities.map(c => c.id)).toEqual(['a', 'b']);
    expect(doc.frontmatter.hash).toBe(`sha256:${sha(doc.body.trim())}`);
    expect(doc.frontmatter.x_catalog_fingerprint).toBe('fp-1');
    expect(doc.frontmatter.hash).not.toContain('fp-1');
  });
  it('is a no-op when unchanged, even if only the fingerprint metadata differs', async () => {
    const vault = temp();
    await syncPluginCapabilities(catalog(['a']), vault);
    const target = path.join(vault, CAPABILITY_PATH); const before = fs.readFileSync(target);
    expect((await syncPluginCapabilities(catalog(['a']), vault)).changed).toBe(false);
    expect(fs.readFileSync(target).equals(before)).toBe(true);
  });
  it('reconciles changed and removed declarations and can return to an earlier catalog', async () => {
    const vault = temp();
    await syncPluginCapabilities(catalog(['a', 'b']), vault);
    expect((await syncPluginCapabilities(catalog(['a', 'c']), vault)).changed).toBe(true);
    expect(JSON.parse(read(vault).body).capabilities.map(c => c.id)).toEqual(['a', 'c']);
    expect((await syncPluginCapabilities(catalog(['a', 'b']), vault)).changed).toBe(true);
    await syncPluginCapabilities(catalog([]), vault);
    expect(JSON.parse(read(vault).body).capabilities).toEqual([]);
  });
  it('derives a stable request identity and compare-and-swaps on the previous bytes', async () => {
    const vault = temp(); await syncPluginCapabilities(catalog(['a']), vault);
    const envelopes = []; const spy = async (e, v, o) => { envelopes.push(e); return processOperationAsync(e, v, o); };
    const before = fs.readFileSync(path.join(vault, CAPABILITY_PATH));
    await syncPluginCapabilities(catalog(['b']), vault, { execute: spy });
    expect(envelopes.map(e => e.dry_run)).toEqual([true, false]);
    expect(envelopes[0].idempotency_key).toBe(envelopes[1].idempotency_key);
    expect(envelopes[0].idempotency_key).not.toMatch(/\d{13}/);
    expect(envelopes[0].expected_before_hash).toBe(`sha256:${sha(before)}`);
    expect(envelopes[0].content).toBe(envelopes[1].content);
    // A replay of the same before/after plan produces the same key and content.
    const replayVault = temp(); const again = [];
    await syncPluginCapabilities(catalog(['a']), replayVault);
    await syncPluginCapabilities(catalog(['b']), replayVault, { execute: async (e, v, o) => { again.push(e); return processOperationAsync(e, v, o); } });
    expect(again[0].content).toBe(envelopes[0].content);
  });
  it('refuses a concurrent change instead of overwriting it', async () => {
    const vault = temp(); await syncPluginCapabilities(catalog(['a']), vault);
    const raced = async (e, v, o) => {
      if (!e.dry_run) await processOperationAsync({ ...e, idempotency_key: 'racer', expected_before_hash: undefined, content: e.content.replace('"b"', '"racer"') }, v, o);
      return processOperationAsync(e, v, o);
    };
    await expect(syncPluginCapabilities(catalog(['b']), vault, { execute: raced })).rejects.toThrow('synchronization failed');
    expect(read(vault).body).toContain('racer');
  });
  it('refuses colliding foreign documents and non-owned assets', async () => {
    const vault = temp(); fs.mkdirSync(path.join(vault, 'system/plugin-capabilities'), { recursive: true });
    fs.writeFileSync(path.join(vault, CAPABILITY_PATH), 'authored content');
    await expect(syncPluginCapabilities(catalog([]), vault)).rejects.toThrow('collision');
    expect(fs.readFileSync(path.join(vault, CAPABILITY_PATH), 'utf8')).toBe('authored content');
    const other = temp(); fs.mkdirSync(path.join(other, 'system/plugin-capabilities'), { recursive: true });
    fs.writeFileSync(path.join(other, CAPABILITY_PATH), '---\ntype: asset\nname: x\ntitle: x\ndescription: x\ntimestamp: 2026-01-01T00:00:00.000Z\nmime_type: text/plain\nx_owner: someone-else\n---\nmine\n');
    await expect(syncPluginCapabilities(catalog([]), other)).rejects.toThrow('collision');
  });
  it('refuses symlinked destinations without writing through them', async () => {
    const vault = temp(); const external = temp(); fs.mkdirSync(path.join(vault, 'system'));
    fs.symlinkSync(external, path.join(vault, 'system/plugin-capabilities'));
    await expect(syncPluginCapabilities(catalog([]), vault)).rejects.toThrow('symlinks');
    expect(fs.readdirSync(external)).toEqual([]);
    const linkedFile = temp(); fs.mkdirSync(path.join(linkedFile, 'system/plugin-capabilities'), { recursive: true });
    fs.writeFileSync(path.join(external, 'target.md'), 'x'); fs.symlinkSync(path.join(external, 'target.md'), path.join(linkedFile, CAPABILITY_PATH));
    await expect(syncPluginCapabilities(catalog([]), linkedFile)).rejects.toThrow('symlinks');
    expect(fs.readFileSync(path.join(external, 'target.md'), 'utf8')).toBe('x');
  });
  it('preflights with a dry run and writes nothing when validation or commit fails', async () => {
    const vault = temp(); const calls = [];
    await expect(syncPluginCapabilities(catalog([]), vault, { execute: async e => { calls.push(e.dry_run); return { success: false, validation: { errors: ['bad shape'] } }; } })).rejects.toThrow('bad shape');
    expect(calls).toEqual([true]); expect(fs.existsSync(path.join(vault, CAPABILITY_PATH))).toBe(false);
    const commitFails = temp(); const seen = [];
    await expect(syncPluginCapabilities(catalog([]), commitFails, { execute: async e => { seen.push(e.dry_run); return { success: e.dry_run }; } })).rejects.toThrow('synchronization failed');
    expect(seen).toEqual([true, false]); expect(fs.existsSync(path.join(commitFails, CAPABILITY_PATH))).toBe(false);
  });
});
