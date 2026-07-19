import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import notificationsRouter from './notifications.mjs';
import * as notifications from '../../core/notifications.mjs';

vi.mock('../auth.mjs', () => ({
  requireAuth: (req, _res, next) => {
    req.auth = { scopes: ['*'] };
    next();
  },
  requireScope: () => (_req, _res, next) => next(),
}));

vi.mock('../../core/notifications.mjs', () => ({
  listNotificationRules: vi.fn(),
  createNotificationRule: vi.fn(),
  deleteNotificationRule: vi.fn(),
  listNotificationHistory: vi.fn(),
  sendTestNotification: vi.fn(),
}));

vi.mock('../../core/logger.mjs', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(notificationsRouter);
  return app;
}

describe('Notifications API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(notifications.listNotificationRules).mockReturnValue([]);
    vi.mocked(notifications.listNotificationHistory).mockResolvedValue([]);
  });

  it('GET /api/notifications/rules returns rule array', async () => {
    vi.mocked(notifications.listNotificationRules).mockReturnValue([
      {
        id: 'rule-1',
        event: 'node_offline',
        channel: 'desktop',
        priority: 'critical',
        enabled: true,
        quietHours: false,
      },
    ]);
    const res = await request(makeApp()).get('/api/notifications/rules');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 'rule-1',
        event: 'node_offline',
        channel: 'desktop',
        priority: 'critical',
        enabled: true,
        quietHours: false,
      },
    ]);
  });

  it('POST /api/notifications/rules creates a rule', async () => {
    vi.mocked(notifications.createNotificationRule).mockResolvedValue({
      id: 'new-id',
      event: 'leader_change',
      channel: 'desktop',
      priority: 'high',
      enabled: true,
      quietHours: true,
    });
    const res = await request(makeApp())
      .post('/api/notifications/rules')
      .send({
        event: 'leader_change',
        channel: 'desktop',
        priority: 'high',
        enabled: true,
        quietHours: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('new-id');
    expect(notifications.createNotificationRule).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'leader_change', quietHours: true }),
    );
  });

  it('DELETE /api/notifications/rules/:id removes a rule', async () => {
    vi.mocked(notifications.deleteNotificationRule).mockResolvedValue({ success: true, id: 'rule-1' });
    const res = await request(makeApp()).delete('/api/notifications/rules/rule-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(notifications.deleteNotificationRule).toHaveBeenCalledWith('rule-1');
  });

  it('GET /api/notifications/history returns delivery entries', async () => {
    vi.mocked(notifications.listNotificationHistory).mockResolvedValue([
      {
        id: 'e1',
        title: 'Test',
        message: 'Hello',
        channel: 'desktop',
        status: 'delivered',
        timestamp: '2026-07-19T00:00:00.000Z',
      },
    ]);
    const res = await request(makeApp()).get('/api/notifications/history');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Test');
  });

  it('POST /api/notifications/test sends a test notification', async () => {
    vi.mocked(notifications.sendTestNotification).mockResolvedValue({
      id: 't1',
      title: 'Total Recall',
      message: 'Test notification from the dashboard',
      channel: 'desktop',
      status: 'delivered',
      timestamp: '2026-07-19T00:00:00.000Z',
    });
    const res = await request(makeApp()).post('/api/notifications/test').send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(notifications.sendTestNotification).toHaveBeenCalled();
  });

  it('POST /api/notifications/rules returns 400 for invalid event', async () => {
    vi.mocked(notifications.createNotificationRule).mockRejectedValue(
      Object.assign(new Error('Unsupported event: nope'), { status: 400 }),
    );
    const res = await request(makeApp())
      .post('/api/notifications/rules')
      .send({ event: 'nope', channel: 'desktop', priority: 'high' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unsupported event/);
  });
});
