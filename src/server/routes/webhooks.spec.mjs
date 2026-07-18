import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'node:crypto';
import webhooksRouter from './webhooks.mjs';
import * as secretsStore from '../../core/secrets-store.mjs';
import * as operations from '../../core/ssss-operation-service.mjs';
import * as vfs from '../../core/vfs-documents.mjs';

vi.mock('../auth.mjs', () => ({
  requireAuth: (req, _res, next) => { req.auth = { scopes: ['*'] }; next(); },
  requireScope: () => (_req, _res, next) => next(),
}));
vi.mock('../../core/secrets-store.mjs', () => ({ getSecret: vi.fn(), setSecret: vi.fn() }));
vi.mock('../../core/vfs-documents.mjs', () => ({
  listVfsDocumentsUnder: vi.fn(),
  findVfsDocumentByPath: vi.fn(),
}));
vi.mock('../../core/ssss-operation-service.mjs', () => ({
  appendVfsEvent: vi.fn(),
  deleteVfsDocument: vi.fn(),
  listVfsEvents: vi.fn(),
  patchVfsDocument: vi.fn(),
  writeVfsDocument: vi.fn(),
}));
vi.mock('../../core/webhook-handlers.mjs', () => ({ handleWebhook: vi.fn(async () => ({ handled: true })) }));

function makeApp() {
  const app = express();
  app.use(express.json({
    verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); },
  }));
  app.use(webhooksRouter);
  return app;
}

function mockActiveConfig(provider = 'github', events = []) {
  vi.mocked(vfs.findVfsDocumentByPath).mockReturnValue({
    vfs_path: `system/webhook-configs/${provider}.md`,
    frontmatter: {
      type: 'webhook_config',
      provider,
      status: 'active',
      events,
      secret_ref: `${provider.toUpperCase()}_WEBHOOK_SECRET`,
    },
  });
}

describe('Webhooks API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vfs.listVfsDocumentsUnder).mockReturnValue([]);
    vi.mocked(vfs.findVfsDocumentByPath).mockReturnValue(null);
    vi.mocked(operations.listVfsEvents).mockResolvedValue([]);
    vi.mocked(operations.appendVfsEvent).mockResolvedValue({ success: true });
    vi.mocked(operations.writeVfsDocument).mockResolvedValue({ success: true });
    vi.mocked(secretsStore.getSecret).mockResolvedValue({ found: true, value: 'gh_secret' });
  });

  it('validates GitHub signatures against the raw body', async () => {
    mockActiveConfig();
    const payload = JSON.stringify({ action: 'push' });
    const signature = `sha256=${crypto.createHmac('sha256', 'gh_secret').update(payload).digest('hex')}`;
    const res = await request(makeApp())
      .post('/api/webhooks/github')
      .set('x-hub-signature-256', signature)
      .set('x-github-event', 'push')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body.event).toBe('github.push');
    expect(operations.appendVfsEvent).toHaveBeenCalled();
  });

  it('fails closed when no signing secret is configured', async () => {
    mockActiveConfig();
    vi.mocked(secretsStore.getSecret).mockResolvedValue({ found: false });
    const res = await request(makeApp()).post('/api/webhooks/github').send({ action: 'push' });
    expect(res.status).toBe(503);
  });

  it('rejects invalid signatures and unsupported providers', async () => {
    mockActiveConfig();
    const invalid = await request(makeApp())
      .post('/api/webhooks/github')
      .set('x-hub-signature-256', 'sha256=invalid')
      .send({ action: 'push' });
    expect(invalid.status).toBe(401);
    expect((await request(makeApp()).post('/api/webhooks/custom').send({})).status).toBe(404);
  });

  it('never returns stored webhook secrets from config reads', async () => {
    vi.mocked(vfs.listVfsDocumentsUnder).mockReturnValue([{
      type: 'webhook_config',
      frontmatter: {
        type: 'webhook_config', provider: 'github', status: 'active',
        secret_ref: 'GITHUB_WEBHOOK_SECRET', secret: 'must-not-leak', events: ['push'],
      },
    }]);
    const res = await request(makeApp()).get('/api/webhooks/configs');
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ provider: 'github', has_secret: true });
    expect(JSON.stringify(res.body)).not.toContain('must-not-leak');
  });

  it('stores new signing secrets in the encrypted store and config metadata in VFS', async () => {
    const res = await request(makeApp()).post('/api/webhooks/configs').send({
      provider: 'github', secret: 'new-secret', events: ['push'],
    });
    expect(res.status).toBe(201);
    expect(secretsStore.setSecret).toHaveBeenCalledWith(expect.any(String), 'GITHUB_WEBHOOK_SECRET', 'new-secret', expect.any(Object));
    expect(operations.writeVfsDocument).toHaveBeenCalled();
    expect(JSON.stringify(operations.writeVfsDocument.mock.calls[0])).not.toContain('new-secret');
  });

  it('disables undocumented npm ingress automation', async () => {
    const res = await request(makeApp()).post('/api/webhooks/npm').send({ event: 'package-publish' });
    expect(res.status).toBe(501);
  });

  it('redacts sensitive payload fields and suppresses duplicate deliveries', async () => {
    mockActiveConfig();
    const payload = JSON.stringify({ action: 'push', access_token: 'must-not-persist' });
    const signature = `sha256=${crypto.createHmac('sha256', 'gh_secret').update(payload).digest('hex')}`;
    const first = await request(makeApp())
      .post('/api/webhooks/github')
      .set('x-hub-signature-256', signature)
      .set('x-github-event', 'push')
      .set('x-github-delivery', 'delivery-1')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(first.status).toBe(200);
    expect(JSON.stringify(operations.appendVfsEvent.mock.calls[0])).not.toContain('must-not-persist');
    expect(operations.appendVfsEvent.mock.calls[0][2]).toMatchObject({ workspaceId: 'webhooks' });

    vi.mocked(operations.listVfsEvents).mockResolvedValue([{
      payload: { kind: 'webhook_event', provider: 'github', delivery_id: 'delivery-1' },
    }]);
    const duplicate = await request(makeApp())
      .post('/api/webhooks/github')
      .set('x-hub-signature-256', signature)
      .set('x-github-event', 'push')
      .set('x-github-delivery', 'delivery-1')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(duplicate.body).toMatchObject({ success: true, duplicate: true });
    expect(operations.appendVfsEvent).toHaveBeenCalledTimes(1);
    expect(operations.listVfsEvents).toHaveBeenCalledWith({ workspaceId: 'webhooks' });
  });

  it('re-delivers a stored webhook event via handleWebhook', async () => {
    const { handleWebhook } = await import('../../core/webhook-handlers.mjs');
    vi.mocked(operations.listVfsEvents).mockResolvedValue([{
      event_id: 'evt-1',
      payload: {
        kind: 'webhook_event',
        provider: 'github',
        event_type: 'push',
        payload: { action: 'push' },
        delivery_id: 'd1',
      },
    }]);
    const res = await request(makeApp()).post('/api/webhooks/events/evt-1/redeliver');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, handled: true, parent_event_id: 'evt-1' });
    expect(handleWebhook).toHaveBeenCalledWith('github', 'push', { action: 'push' });
    expect(operations.appendVfsEvent).toHaveBeenCalled();
    expect(operations.appendVfsEvent.mock.calls.at(-1)?.[2]).toMatchObject({ workspaceId: 'webhooks' });
  });

  it('rejects attempts to configure disabled npm ingress', async () => {
    const res = await request(makeApp()).post('/api/webhooks/configs').send({
      provider: 'npm', secret: 'not-used', events: ['package-publish'],
    });
    expect(res.status).toBe(422);
    expect(secretsStore.setSecret).not.toHaveBeenCalled();
  });
});
