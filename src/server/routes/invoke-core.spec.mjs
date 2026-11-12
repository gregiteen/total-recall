// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInvokeRouter, OPERATIONS } from './invoke.mjs';
import { CORE_OPERATIONS } from '../invoke-core-operations.mjs';
import { executeInvokeChild } from '../invoke-execution.mjs';

let temp, brain, app, keys, execute, audits;
function makeApp(scopes = ['invoke:full', '*']) {
  keys = [{ id: 'fixture', scopes, issued_by: 'local-operator' }];
  const store = { loadKeys: () => keys, keyHasScope: (key, scope) => !key.revoked &&
    (!scope || key.scopes.includes('*') || key.scopes.includes(scope)) };
  app = express().use(express.json()).use(createInvokeRouter({
    auth: (req, _res, next) => { req.auth = { type: 'pat', id: 'fixture' }; next(); },
    store, execute, audit: event => audits.push(event), cwd: temp, serverBrain: brain, registryBrain: brain,
  }));
}
const post = (operation, params = {}) => request(app).post('/v1/invoke').send({ operation, params });
beforeEach(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'invoke-core-'));
  brain = path.join(temp, '.agent/skills/total-recall');
  fs.mkdirSync(path.join(brain, 'memory-vault'), { recursive: true });
  fs.mkdirSync(path.join(brain, 'config'), { recursive: true });
  fs.writeFileSync(path.join(brain, 'config/project-registry.json'), '[]');
  audits = [];
  execute = vi.fn(async () => ({ exit_code: 0, stdout: JSON.stringify({ ok: true, result: { fixture: true } }) }));
  makeApp();
});
afterEach(() => { fs.rmSync(temp, { recursive: true, force: true }); });

describe('one-off capabilities through invoke', () => {
  it('lists all operations with their required scopes in both discovery paths', async () => {
    for (const result of [(await post('capabilities')).body.result,
      (await request(app).get('/v1/invoke/capabilities')).body.result]) {
      const entries = Object.values(result.operations).flat();
      expect(entries.map(entry => entry.operation).sort()).toEqual(Object.keys(OPERATIONS).sort());
      for (const [operation, { scope }] of Object.entries(CORE_OPERATIONS)) {
        expect(entries).toContainEqual({ operation, scope });
      }
    }
  });
  it.each(Object.keys(CORE_OPERATIONS))('denies %s without its scope and denies restricted execution', async operation => {
    makeApp(['invoke:full']);
    expect((await post(operation)).body.error.code).toBe('insufficient-scope');
    makeApp(['invoke:restricted', '*']);
    expect((await post(operation)).body.error.code).toBe('unsupported-restricted-operation');
    expect(execute).not.toHaveBeenCalled();
  });
  it.each(Object.entries(CORE_OPERATIONS))('executes %s with exactly its scope in a bounded child', async (operation, def) => {
    makeApp(['invoke:full', def.scope]);
    const res = await post(operation, operation === 'context.stream' ? { query: 'fixture text' } : {});
    expect(res.body).toMatchObject({ ok: true, result: { fixture: true }, scope: def.scope });
    const options = execute.mock.calls[0][0];
    expect(options.entry).toMatch(/invoke-core-child\.mjs$/);
    expect(JSON.parse(options.input)).toMatchObject({ operation, brain, registryBrain: brain });
    expect(options.signal.aborted).toBe(false);
  });
  it('denies malformed parameters and revoked authority before starting work', async () => {
    expect((await post('context.stream', { query: '' })).status).toBe(400);
    expect((await post('context.stream', { query: 'x', concurrency: 1000 })).status).toBe(400);
    expect((await post('vault.hash', { brainId: '/foreign' })).status).toBe(400);
    expect((await post('vault.hash', { timeoutMs: -1 })).body.error.code).toBe('invalid-timeout');
    execute.mockClear();
    keys[0].revoked = true;
    expect((await post('tasks.cleanup')).status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });
  it.each(['timeout', 'output-limit', 'authority-ended'])('does not expose private child diagnostics on %s', async termination_reason => {
    execute.mockResolvedValue({ termination_reason, stdout: 'PRIVATE', stderr: 'PRIVATE' });
    const res = await post('vault.hash');
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe(termination_reason);
    expect(JSON.stringify(res.body)).not.toContain('PRIVATE');
  });
  it('sanitizes failed and malformed owner output', async () => {
    for (const output of [{ exit_code: 7, stdout: 'PRIVATE' }, { exit_code: 0, stdout: '[]' }]) {
      execute.mockResolvedValue(output);
      const res = await post('vault.hash');
      expect(res.body.ok).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain('PRIVATE');
    }
  });
  it('uses actual children for preview, stream, hash, sync and task effects in disposable brains', async () => {
    execute = options => executeInvokeChild({ ...options, env: { ...options.env, HOME: temp,
      TR_SECRETS_NO_KEYCHAIN: '1', TR_ENV_FILE: path.join(temp, 'absent.env'), TR_SECRETS_PASSWORD: '',
    } });
    makeApp();
    const queue = path.join(brain, 'scheduler/queue'); fs.mkdirSync(queue, { recursive: true });
    for (const status of ['completed', 'failed', 'pending']) {
      fs.writeFileSync(path.join(queue, `${status}.md`), `---\ntype: task\nslug: ${status}\nstatus: ${status}\n---\nFixture\n`);
    }
    fs.mkdirSync(path.join(brain, 'memory-derived'), { recursive: true });
    fs.writeFileSync(path.join(brain, 'memory-derived/vault-hash.txt'), 'fixture-hash\n');
    expect((await post('context.preview')).body).toMatchObject({ ok: true, result: { total_candidates: 0 } });
    expect((await post('context.stream', { query: 'empty fixture' })).body).toMatchObject({ ok: true, result: { context: '' } });
    expect((await post('context.flash.health')).body).toMatchObject({ ok: true, result: { status: 'unhealthy' } });
    expect((await post('vault.hash')).body).toMatchObject({ ok: true, result: { vault_hash: 'fixture-hash' } });
    expect((await post('brains.sync')).body).toMatchObject({ ok: true, result: { repos: [], totalIngested: 0 } });
    const repo = path.join(temp, 'sample');
    const projectBrain = path.join(repo, '.agent/skills/total-recall');
    fs.mkdirSync(path.join(projectBrain, 'memory-vault'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'notes.md'), '# Sample notes\n\nA recorded fixture observation.');
    fs.writeFileSync(path.join(brain, 'config/project-registry.json'), JSON.stringify([
      { name: 'sample', path: repo, brainDir: projectBrain },
    ]));
    expect((await post('brains.sync')).body).toMatchObject({ ok: true, result: { totalIngested: 1 } });
    expect(fs.existsSync(path.join(projectBrain, 'memory-vault/facts/repo-sample-notes.md'))).toBe(true);
    expect((await post('context.preview', { brainId: 'project:sample' })).body)
      .toMatchObject({ ok: true, result: { total_candidates: 1 } });
    expect((await post('tasks.failed')).body).toMatchObject({ ok: true, result: { total: 1, tasks: [{ slug: 'failed' }] } });
    expect((await post('tasks.cleanup')).body).toMatchObject({ ok: true, result: { deleted: 1 } });
    expect(fs.readdirSync(queue).sort()).toEqual(['failed.md', 'pending.md']);
    expect((await post('vault.hash', { brainId: 'project:missing' })).status).toBe(404);
    expect(JSON.stringify(audits)).not.toContain('empty fixture');
  }, 30000);
});
