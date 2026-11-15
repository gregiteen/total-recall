import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pluginCapabilities, sanitizeDeclaration } from './plugin-capabilities.mjs';
import { buildPluginCatalog } from './plugin-catalog.mjs';
import { syncPluginCapabilities, CAPABILITY_PATH } from './plugin-capability-store.mjs';
import { findVfsDocumentByPath } from './vfs-documents.mjs';
import { queryCliSemanticIndex, hashVerb } from './cli-semantic-index.mjs';

const roots = [];
const temp = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-capabilities-')); roots.push(root); return root; };
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const active = { enabled: true, state: 'active' };
function fixture() {
  const dir = temp();
  fs.writeFileSync(path.join(dir, 'cli.mjs'), 'throw Error("never import declarations");');
  return { id: 'example', dir, scope: 'project', valid: true, manifest: { id: 'example', description: 'Manage sample records', cli: { command: 'example', handler: 'cli.mjs', subcommands: [{ name: 'list', effect: 'read', output: 'json', args: [] }] }, runtime: { routers: ['cli.mjs'] }, api: { endpoints: [{ name: 'list', method: 'GET', path: '/records', schema: { type: 'object' }, custom: { preserve: true } }] }, mcpServers: { records: { command: 'node', env: { TOKEN: 'sensitive' }, tools: [{ name: 'lookup', inputSchema: { type: 'object' } }] } } } };
}

describe('installed capability ingestion', () => {
  it('reads CLI/API/router/MCP declarations without executing modules and preserves safe metadata', () => {
    const p = fixture(); const caps = pluginCapabilities(p, active);
    expect(caps.map(c => c.kind)).toEqual(expect.arrayContaining(['cli', 'api', 'api-router', 'mcp-server', 'mcp-tool']));
    expect(caps.find(c => c.kind === 'api')).toMatchObject({ callable: false, state: 'unsupported', schema: { type: 'object' }, declaration: { custom: { preserve: true } } });
    expect(JSON.stringify(caps)).not.toContain('sensitive');
    expect(caps.find(c => c.name === 'list' && c.kind === 'cli').callable).toBe(true);
    expect(pluginCapabilities(p, { enabled: false, state: 'inactive' }).every(c => !c.callable)).toBe(true);
  });
  it('fails on duplicate identities and escaping module symlinks before publication', () => {
    const p = fixture(); p.manifest.cli.subcommands.push(p.manifest.cli.subcommands[0]);
    expect(() => pluginCapabilities(p, active)).toThrow('Duplicate');
    p.manifest.cli.subcommands.pop(); const external = temp(); fs.writeFileSync(path.join(external, 'escape.mjs'), ''); fs.symlinkSync(path.join(external, 'escape.mjs'), path.join(p.dir, 'escape.mjs'));
    p.manifest.runtime.routers = ['escape.mjs']; expect(() => pluginCapabilities(p, active)).toThrow('Unsafe');
  });
  it('reconciles a real validated SSSS asset idempotently, including removals', async () => {
    const vault = temp(); const p = fixture();
    const catalog = buildPluginCatalog(temp(), { discover: () => [p] });
    expect((await syncPluginCapabilities(catalog, vault)).changed).toBe(true);
    const before = fs.statSync(path.join(vault, CAPABILITY_PATH)).mtimeMs;
    expect((await syncPluginCapabilities(catalog, vault)).changed).toBe(false);
    expect(fs.statSync(path.join(vault, CAPABILITY_PATH)).mtimeMs).toBe(before);
    const empty = { ...catalog, fingerprint: 'empty', plugins: [], capabilities: [] }; await syncPluginCapabilities(empty, vault);
    expect(JSON.parse(findVfsDocumentByPath(CAPABILITY_PATH, vault).body).capabilities).toEqual([]);
  });
  it('preflights the complete plan and propagates rejection without commit', async () => {
    const calls = []; const vault = temp();
    await expect(syncPluginCapabilities({ fingerprint: 'test', plugins: [], capabilities: [] }, vault, { execute: async e => { calls.push(e); return { success: false }; } })).rejects.toThrow('synchronization failed');
    expect(calls).toHaveLength(1); expect(calls[0].dry_run).toBe(true); expect(fs.existsSync(path.join(vault, CAPABILITY_PATH))).toBe(false);
    fs.mkdirSync(path.join(vault, 'system')); fs.symlinkSync(temp(), path.join(vault, 'system/plugin-capabilities'));
    await expect(syncPluginCapabilities({ capabilities: [] }, vault)).rejects.toThrow('symlinks');
  });
  it('refuses a pre-existing foreign document and detects declaration edits without source walking', async () => {
    const vault = temp(); fs.mkdirSync(path.join(vault, 'system/plugin-capabilities'), { recursive: true });
    fs.writeFileSync(path.join(vault, CAPABILITY_PATH), 'authored content');
    await expect(syncPluginCapabilities({ capabilities: [] }, vault)).rejects.toThrow('collision');
    const p = fixture(); fs.writeFileSync(path.join(p.dir, 'large.bin'), Buffer.alloc(2 * 1024 * 1024));
    const first = buildPluginCatalog(temp(), { discover: () => [p] });
    p.manifest.cli.subcommands[0].description = 'Changed records description';
    const next = buildPluginCatalog(temp(), { discover: () => [p] });
    expect(next.fingerprint).not.toBe(first.fingerprint);
    expect(next.capabilities.map(c => c.id)).toEqual(first.capabilities.map(c => c.id));
  });
  it('real queries expose source/schema/state and action mode excludes unsupported declarations', async () => {
    const caps = pluginCapabilities(fixture(), active).map(c => ({ ...c, verb: c.usage || c.id, hash: hashVerb(c) }));
    const hits = await queryCliSemanticIndex('records', { harvest: () => caps, minScore: 0, limit: 100 });
    expect(hits.find(c => c.kind === 'api')).toMatchObject({ plugin: 'example', callable: false, provenance: { manifest: 'plugin.json' } });
    const actions = await queryCliSemanticIndex('records', { harvest: () => caps, minScore: 0, limit: 100, actionableOnly: true });
    expect(actions.length).toBeGreaterThan(0); expect(actions.every(c => c.callable)).toBe(true);
  });
  it('redacts credential suffix fields but keeps benign routing values', () => {
    const out = sanitizeDeclaration({ client_secret: 'a', API_KEY_TOKEN: 'b', clientSecret: 'c', token_env: 'GH_TOKEN', max_tokens: 100, auth: { refresh_token: 'd' },
      env: { NODE_ENV: 'production', PORT: '3000', DB_PASSWORD: 'e', GH_TOKEN: '${GH_TOKEN}' }, headers: { Accept: 'application/json', Authorization: 'Bearer f' },
      credentials: { user: 'g' }, url: 'https://u:p@host/x?token=h' });
    expect(out).toMatchObject({ client_secret: '[REDACTED]', API_KEY_TOKEN: '[REDACTED]', clientSecret: '[REDACTED]', token_env: 'GH_TOKEN', max_tokens: 100, auth: { refresh_token: '[REDACTED]' },
      env: { NODE_ENV: 'production', PORT: '3000', DB_PASSWORD: '[REDACTED]', GH_TOKEN: '${GH_TOKEN}' }, headers: { Accept: 'application/json', Authorization: '[REDACTED]' }, credentials: { user: '[REDACTED]' } });
    expect(JSON.stringify(out)).not.toMatch(/"[a-h]"|u:p|token=h/);
  });
  it('redacts numeric credentials and encoded or compound URL credential names', () => {
    const out = sanitizeDeclaration({ token: 123456, max_tokens: 100, url: 'https://example.invalid/mcp?access_token=literal-one&clientSecret=literal-two&%61pi_key=literal-three&page=2' });
    expect(out.token).toBe('[REDACTED]'); expect(out.max_tokens).toBe(100);
    expect(out.url).toBe('https://example.invalid/mcp?access_token=[REDACTED]&clientSecret=[REDACTED]&%61pi_key=[REDACTED]&page=2');
  });
  it('treats missing and non-regular handlers as unavailable, including the root CLI entry', () => {
    const p = fixture(); fs.mkdirSync(path.join(p.dir, 'dir-handler'));
    for (const handler of ['missing.mjs', 'dir-handler']) {
      p.manifest.cli.handler = handler;
      const caps = pluginCapabilities(p, active).filter(c => c.kind === 'cli');
      expect(caps.length).toBeGreaterThan(1);
      expect(caps.every(c => c.state === 'unavailable' && c.callable === false)).toBe(true);
      const catalog = buildPluginCatalog(temp(), { discover: () => [p] });
      expect(catalog.plugins[0].callable).toBe(false);
      expect(catalog.commands).toEqual([]);
    }
  });
});
