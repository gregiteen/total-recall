import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pluginDocumentOperation, executePluginDocument, serializeDocument, parseDocument } from './plugin-document-store.mjs';
const roots = [];
const extension = { registry: 'demo', extends: 'ssss', version: '1.0.0', document_primitives: {
  record: { family: 'host', append_only: false, portability: 'tenant_private', required_fields: ['type', 'id'], immutable_fields: ['id'] },
  ledger: { family: 'host', append_only: true, portability: 'tenant_private', required_fields: ['type', 'id'] },
} };
function fixture() { const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-doc-')); roots.push(vaultRoot); return { plugin: 'demo', vaultRoot, extension }; }
function content(type = 'record') { return serializeDocument({ type, id: 'one', title: 'Record', description: 'Fixture record', timestamp: new Date().toISOString(), x_future: { nested: ['one', 'two'] } }, 'Original body\n'); }
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
describe('plugin native document contract', () => {
  it('preflights, commits and preserves nested metadata/body through patches', () => {
    const binding = fixture();
    pluginDocumentOperation({ type: 'operation', path: 'record.md', content: content() }, binding);
    pluginDocumentOperation({ type: 'patch', path: 'record.md', patches: { title: 'Changed' } }, binding);
    const doc = parseDocument(fs.readFileSync(path.join(binding.vaultRoot, 'record.md'), 'utf8'));
    expect(doc.data.x_future).toEqual({ nested: ['one', 'two'] }); expect(doc.body).toContain('Original body');
    expect(() => pluginDocumentOperation({ type: 'patch', path: 'record.md', patches: { id: 'different' } }, binding)).toThrow(/immutable/);
  });
  it('rejects paths, unregistered types, invalid extension identity and forged actors', async () => {
    const binding = fixture();
    expect(() => pluginDocumentOperation({ type: 'operation', path: '../outside.md', content: content() }, binding)).toThrow(/path/i);
    expect(() => pluginDocumentOperation({ type: 'operation', path: 'unknown.md', content: content('unknown') }, binding)).toThrow(/Unknown/);
    await expect(executePluginDocument({ ...binding, plugin: 'other', envelope: {} })).rejects.toThrow(/matching/);
    const page = serializeDocument({ type: 'page', slug: 'denied', name: 'denied', sandbox_entry: 'ui/page.mjs', title: 'No access', description: 'Denied', timestamp: new Date().toISOString() }, '');
    expect(() => pluginDocumentOperation({ type: 'operation', path: 'page.md', content: page, actor: { role: 'system' } }, binding)).toThrow(/capabilities|forbidden/);
  });
  it('keeps append histories immutable and rejects replacement/deletion', () => {
    const binding = fixture();
    pluginDocumentOperation({ type: 'operation', path: 'ledger.md', content: content('ledger') }, binding);
    pluginDocumentOperation({ type: 'patch', path: 'ledger.md', patches: { __body__: 'Next record\n' } }, binding);
    const body = fs.readFileSync(path.join(binding.vaultRoot, 'ledger.md'), 'utf8');
    expect(body).toContain('Original body\nNext record');
    expect(() => pluginDocumentOperation({ type: 'operation', path: 'ledger.md', content: content('ledger') }, binding)).toThrow(/Append-only/);
    expect(() => pluginDocumentOperation({ type: 'delete', path: 'ledger.md' }, binding)).toThrow(/Append-only/);
  });
  it('replays durable event keys without duplicates and rejects different requests', () => {
    const binding = fixture(), envelope = { type: 'event', path: 'record.md', content: '{"event":"created"}', idempotency_key: 'same' };
    const first = pluginDocumentOperation(envelope, binding), second = pluginDocumentOperation(envelope, binding);
    expect(second.replay).toBe(true); expect(second.operation_id).toBe(first.operation_id);
    expect(() => pluginDocumentOperation({ ...envelope, content: '{"event":"different"}' }, binding)).toThrow(/idempotency_conflict/);
  });
  it('dry-run and symlink refusal leave canonical state untouched', () => {
    const binding = fixture();
    expect(pluginDocumentOperation({ type: 'operation', path: 'record.md', content: content(), dry_run: true }, binding).success).toBe(true);
    expect(fs.existsSync(path.join(binding.vaultRoot, 'record.md'))).toBe(false);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-doc-outside-')); roots.push(outside);
    fs.symlinkSync(outside, path.join(binding.vaultRoot, 'linked'));
    expect(() => pluginDocumentOperation({ type: 'operation', path: 'linked/record.md', content: content() }, binding)).toThrow(/symlink|path/i);
    expect(fs.readdirSync(outside)).toEqual([]);
  });
});
