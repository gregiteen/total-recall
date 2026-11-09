// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { writeNodeValidatedAsync } from './validated-write.mjs';
import { processOperationAsync } from './operation-validator.mjs';
import { ruleLengthStats } from './rule-length.mjs';
import { importRuleFiles } from './import-rules.mjs';
import { safeStringify } from './vault.mjs';
import remember from '../cli/remember.mjs';
import edit from '../cli/edit.mjs';
import ssssRouter from '../server/routes/ssss.mjs';

const selected = vi.hoisted(() => ({ vault: '' }));
vi.mock('./logger.mjs', () => ({ logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } }));
vi.mock('./auto-compile.mjs', () => ({ autoCompileSurfaces: vi.fn(async () => true) }));
vi.mock('./duplicate-guard.mjs', () => ({ assertNoDuplicateRule: vi.fn() }));
vi.mock('../server/auth.mjs', () => ({
  requireAuth: (req, _res, next) => { req.auth = { role: 'admin' }; next(); },
  requireScope: () => (_req, _res, next) => next(),
}));
vi.mock('../server/routes/_shared.mjs', () => ({ resolveVaultFromQuery: () => selected.vault }));

let temp, vault;
const node = (category, body, extra = {}) => ({ type: 'memory', slug: 'guarded', category, title: 'Guarded', body, ...extra });
const envelope = (content, extra = {}) => ({ type: 'operation', workspace_id: 'rules',
  idempotency_key: crypto.randomUUID(), path: 'invariants/guarded.md', content, actor: { role: 'admin' }, ...extra });
beforeEach(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-length-'));
  const agent = path.join(temp, '.agent');
  vault = path.join(agent, 'skills/total-recall/memory-vault');
  fs.mkdirSync(vault, { recursive: true });
  selected.vault = vault;
  vi.stubEnv('AGENT_DIR', agent); vi.stubEnv('_TR_TEST_AGENT_DIR', agent);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs(); vi.restoreAllMocks(); process.exitCode = 0;
  fs.rmSync(temp, { recursive: true, force: true });
});

describe('shared rule length policy', () => {
  it.each(['invariants', 'preferences', 'anti-patterns'])('rejects oversized %s before writing and counts only rejections', async category => {
    const before = ruleLengthStats().rejections;
    const body = 'PRIVATE-RULE-'.repeat(70);
    const result = await writeNodeValidatedAsync(node(category, body), vault);
    expect(result.success).toBe(false);
    expect(result.validation.errors.join(' ')).toContain('limit 800');
    expect(JSON.stringify(result)).not.toContain('PRIVATE-RULE');
    expect(ruleLengthStats().rejections).toBe(before + 1);
    expect(fs.existsSync(path.join(vault, category, 'guarded.md'))).toBe(false);
  });
  it.each([300, 301, 800])('keeps the soft and hard boundaries at %s characters', async length => {
    const before = ruleLengthStats().rejections;
    const result = await writeNodeValidatedAsync(node('preferences', 'a'.repeat(length)), vault);
    expect(result.success).toBe(true);
    expect(result.validation.warnings.length > 0).toBe(length > 300);
    expect(ruleLengthStats().rejections).toBe(before);
  });
  it('preserves policy and explicit allow-long exceptions without exempting all writes', async () => {
    const body = 'a'.repeat(801);
    expect((await writeNodeValidatedAsync(node('preferences', body, { tags: ['context:policy'] }), vault)).success).toBe(true);
    expect((await writeNodeValidatedAsync(node('preferences', body), vault, { allowLong: true })).success).toBe(true);
    expect((await writeNodeValidatedAsync(node('facts', body), vault)).success).toBe(true);
    expect((await writeNodeValidatedAsync(node('preferences', body), vault)).success).toBe(false);
  });
  it('guards raw HTTP operation envelopes and ignores a forged envelope exception', async () => {
    const app = express().use(express.json()).use(ssssRouter);
    const content = safeStringify('a'.repeat(801), { type: 'rule', name: 'guarded', title: 'Guarded' });
    const res = await request(app).post('/api/v1/ssss').send(envelope(content, { allowLong: true }));
    expect(res.status).toBe(400);
    expect(res.body.validation.errors.join(' ')).toContain('limit 800');
    expect(fs.existsSync(path.join(vault, 'invariants/guarded.md'))).toBe(false);
  });
  it('guards raw body patches and category changes while preserving committed bytes', async () => {
    const content = safeStringify('Short rule.', { type: 'rule', name: 'guarded', title: 'Guarded' });
    expect((await processOperationAsync(envelope(content), vault)).success).toBe(true);
    const file = path.join(vault, 'invariants/guarded.md'), before = fs.readFileSync(file, 'utf8');
    const result = await processOperationAsync(envelope(undefined, { type: 'patch', patches: { __body__: 'a'.repeat(801) } }), vault);
    expect(result.success).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
    expect((await writeNodeValidatedAsync(node('facts', 'a'.repeat(801)), vault)).success).toBe(true);
    const changed = await processOperationAsync(envelope(undefined, { type: 'patch', path: 'facts/guarded.md', patches: { category: 'preferences' } }), vault);
    expect(changed.success).toBe(false);
  });
  it('keeps accepted patch retries idempotent', async () => {
    const content = safeStringify('Short rule.', { type: 'rule', name: 'guarded', title: 'Guarded' });
    await processOperationAsync(envelope(content), vault);
    const patch = envelope(undefined, { type: 'patch', patches: { __body__: 'Another short rule.' } });
    expect((await processOperationAsync(patch, vault)).success).toBe(true);
    expect((await processOperationAsync(patch, vault)).success).toBe(true);
  });
  it('guards remember and preserves its allow-long flag', async () => {
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('CLI exit'); });
    await expect(remember(['preference', 'a'.repeat(801), '--project', '--slug', 'cli-rule'])).rejects.toThrow('CLI exit');
    expect(fs.existsSync(path.join(vault, 'preferences/cli-rule.md'))).toBe(false);
    await remember(['preference', 'a'.repeat(801), '--project', '--slug', 'cli-rule', '--allow-long']);
    expect(fs.existsSync(path.join(vault, 'preferences/cli-rule.md'))).toBe(true);
  });
  it('rejects an edit without changing the existing rule', async () => {
    await writeNodeValidatedAsync(node('preferences', 'Short rule.'), vault);
    const file = path.join(vault, 'preferences/guarded.md'), before = fs.readFileSync(file, 'utf8');
    await edit(['guarded', 'a'.repeat(801), '--project', '--no-compile']);
    expect(process.exitCode).toBe(1);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });
  it('rejects imported long rules through the same write path', async () => {
    const file = path.join(temp, 'RULES.md'); fs.writeFileSync(file, 'a'.repeat(801));
    const result = await importRuleFiles([{ absolutePath: file, filename: 'RULES.md', slug: 'imported', ide: 'generic' }], { vaultDir: vault });
    expect(result.imported).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toContain('limit 800');
    expect(fs.existsSync(path.join(vault, 'preferences/imported.md'))).toBe(false);
  });
});
