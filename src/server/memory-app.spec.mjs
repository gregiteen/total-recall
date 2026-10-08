// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

describe('memory-only HTTP lifecycle with real auth and vault operations', () => {
  let root, app, writer, reader, stop;
  const previousAgentDir = process.env.AGENT_DIR;
  const previousTestDir = process.env._TR_TEST_AGENT_DIR;

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-memory-host-'));
    const vault = path.join(root, 'skills', 'total-recall', 'memory-vault');
    fs.mkdirSync(vault, { recursive: true });
    process.env.AGENT_DIR = root;
    process.env._TR_TEST_AGENT_DIR = root;
    vi.resetModules();
    const { createMemoryApp } = await import('./memory-app.mjs');
    const { issueKey } = await import('./keys.mjs');
    ({ stopMemoryMaintenance: stop } = await import('./routes/memory.mjs'));
    app = createMemoryApp();
    writer = issueKey({ name: 'Writer fixture', scopes: ['memory:read', 'memory:write'] }).token;
    reader = issueKey({ name: 'Reader fixture', scopes: ['memory:read'] }).token;
  });
  afterAll(() => {
    stop?.();
    fs.rmSync(root, { recursive: true, force: true });
    if (previousAgentDir === undefined) delete process.env.AGENT_DIR;
    else process.env.AGENT_DIR = previousAgentDir;
    if (previousTestDir === undefined) delete process.env._TR_TEST_AGENT_DIR;
    else process.env._TR_TEST_AGENT_DIR = previousTestDir;
  });

  it('has no feature routers or worker startup and uses only its selected vault', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ runtime: 'memory', memory: { initialized: true, nodes: 0 } });
    for (const url of ['/api/research', '/api/tasks', '/api/sandbox', '/api/plugins/reviews']) {
      expect((await request(app).get(url)).status).toBe(404);
    }
    expect(fs.existsSync(path.join(root, 'skills', 'total-recall', 'daemon.pid'))).toBe(false);
  });

  it('requires authentication for memory and rules, and rejects a read-only mutation', async () => {
    expect((await request(app).get('/api/memory')).status).toBe(401);
    expect((await request(app).get('/api/rules')).status).toBe(401);
    const res = await request(app).post('/api/memory').auth(reader, { type: 'bearer' }).send({
      slug: 'denied', title: 'Denied', category: 'facts', content: 'Must not persist',
    });
    expect(res.status).toBe(403);
    const passwordChange = await request(app).post('/auth/change-password').auth(reader, { type: 'bearer' })
      .send({ newPassword: 'Must not replace dashboard password' });
    expect(passwordChange.status).toBe(403);
    expect(fs.existsSync(path.join(root, 'skills', 'total-recall', 'config', 'security.yml'))).toBe(false);
  });

  it('creates, reads, replaces and deletes actual canonical memory', async () => {
    const payload = { slug: 'lifecycle-fixture', title: 'Memory lifecycle', category: 'facts', content: 'Original value' };
    const created = await request(app).post('/api/memory').auth(writer, { type: 'bearer' }).send(payload);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const read = await request(app).get('/api/memory/lifecycle-fixture').auth(reader, { type: 'bearer' });
    expect(read.body.content).toBe('Original value');
    const replaced = await request(app).put('/api/memory/lifecycle-fixture').auth(writer, { type: 'bearer' })
      .send({ ...payload, content: 'Replacement value' });
    expect(replaced.status, JSON.stringify(replaced.body)).toBe(200);
    expect((await request(app).get('/api/memory/lifecycle-fixture').auth(reader, { type: 'bearer' })).body.content).toBe('Replacement value');
    expect((await request(app).delete('/api/memory/lifecycle-fixture').auth(writer, { type: 'bearer' })).status).toBe(200);
    expect((await request(app).get('/api/memory/lifecycle-fixture').auth(reader, { type: 'bearer' })).status).toBe(404);
  });

  it('keeps a registered project brain separate and never broadens a selected slug lookup', async () => {
    const globalBrain = path.join(root, 'skills', 'total-recall');
    const projectBrain = path.join(root, 'project-fixture', '.agent', 'skills', 'total-recall');
    fs.mkdirSync(path.join(projectBrain, 'memory-vault'), { recursive: true });
    fs.writeFileSync(path.join(globalBrain, 'config', 'project-registry.json'), JSON.stringify([
      { name: 'isolated-project', brainDir: projectBrain },
    ]));
    const node = { slug: 'project-only', title: 'Project fact', category: 'facts', content: 'Only this project owns this value' };
    const created = await request(app).post('/api/memory?brain=project:isolated-project')
      .auth(writer, { type: 'bearer' }).send(node);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect((await request(app).get('/api/memory/project-only').auth(reader, { type: 'bearer' })).status).toBe(404);
    expect((await request(app).get('/api/memory/project-only?brain=project:isolated-project')
      .auth(reader, { type: 'bearer' })).body.content).toBe(node.content);
    expect((await request(app).delete('/api/memory/project-only?brain=project:isolated-project')
      .auth(writer, { type: 'bearer' })).status).toBe(200);
  });

  it('rate limits public authentication independently of the API limiter', async () => {
    let response;
    for (let i = 0; i < 21; i++) response = await request(app).post('/auth/login').send({ password: 'synthetic invalid password' });
    expect(response.status).toBe(429);
  });
});
