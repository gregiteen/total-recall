// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpBrain = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-collab-spec-'));

vi.mock('../../core/config.mjs', () => ({ brainDir: tmpBrain }));

const OPEN = 1;
function fakeSocket() {
  return { readyState: OPEN, sent: [], send(p) { this.sent.push(JSON.parse(p)); } };
}

let collab;
const savedSecret = process.env.JWT_SECRET;

beforeAll(async () => {
  delete process.env.JWT_SECRET;
  collab = await import('./collab.mjs');
  fs.writeFileSync(path.join(tmpBrain, 'collab', 'groups.json'), JSON.stringify([
    { code: 'aaaa', name: 'A', members: ['alice', 'bob'] },
    { code: 'bbbb', name: 'B', members: ['mallory'] },
  ]));
});

afterAll(() => {
  if (savedSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = savedSecret;
  fs.rmSync(tmpBrain, { recursive: true, force: true });
});

describe('collab JWT secret', () => {
  it('never falls back to the old hardcoded secret', async () => {
    const secretFile = path.join(tmpBrain, 'collab', '.jwt-secret');
    const secret = fs.readFileSync(secretFile, 'utf8');
    expect(secret).not.toBe('total-recall-collab-secret-key-1234');
    expect(secret.length).toBeGreaterThanOrEqual(32);
    expect(fs.statSync(secretFile).mode & 0o777).toBe(0o600);
  });

  it('reuses the persisted secret and prefers JWT_SECRET from env', () => {
    const file = path.join(tmpBrain, 'secret-reuse');
    const first = collab.resolveJwtSecret({}, file);
    expect(collab.resolveJwtSecret({}, file)).toBe(first);
    expect(collab.resolveJwtSecret({ JWT_SECRET: 'from-env' }, file)).toBe('from-env');
  });

  it('rejects a token forged with the old default secret', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const express = (await import('express')).default;
    const request = (await import('supertest')).default;
    const app = express();
    app.use(express.json());
    app.use(collab.collabRouter);

    const forged = jwt.sign({ username: 'alice' }, 'total-recall-collab-secret-key-1234');
    const res = await request(app).get('/api/collab/groups').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });
});

describe('broadcastToUrl group scoping', () => {
  const url = 'https://example.com/page';

  it('delivers only to sockets whose user shares an audience group', () => {
    const alice = fakeSocket();
    const bob = fakeSocket();
    const mallory = fakeSocket();
    const elsewhere = fakeSocket();
    const registry = new Map([
      [alice, { username: 'alice', currentUrl: url }],
      [bob, { username: 'bob', currentUrl: url }],
      [mallory, { username: 'mallory', currentUrl: url }],
      [elsewhere, { username: 'bob', currentUrl: 'https://other.example' }],
    ]);

    collab.broadcastToUrl(`${url}#frag`, { type: 'CHAT_MESSAGE', text: 'secret' }, { audienceGroups: ['aaaa'] }, registry);

    expect(alice.sent).toHaveLength(1);
    expect(bob.sent).toHaveLength(1);
    expect(mallory.sent).toHaveLength(0);
    expect(elsewhere.sent).toHaveLength(0);
  });

  it('honours excludeWs and sends nothing for an empty audience', () => {
    const alice = fakeSocket();
    const bob = fakeSocket();
    const registry = new Map([
      [alice, { username: 'alice', currentUrl: url }],
      [bob, { username: 'bob', currentUrl: url }],
    ]);
    collab.broadcastToUrl(url, { type: 'USER_JOINED' }, { excludeWs: alice, audienceGroups: ['aaaa'] }, registry);
    expect(alice.sent).toHaveLength(0);
    expect(bob.sent).toHaveLength(1);

    collab.broadcastToUrl(url, { type: 'X' }, {}, registry);
    expect(bob.sent).toHaveLength(1);
  });
});
