import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./vfs-documents.mjs', () => ({
  listVfsDocumentsUnder: vi.fn(),
  findVfsDocumentByPath: vi.fn(),
}));

vi.mock('./ssss-operation-service.mjs', () => ({
  writeVfsDocument: vi.fn(),
  deleteVfsDocument: vi.fn(),
  appendVfsEvent: vi.fn(),
  listVfsEvents: vi.fn(),
}));

vi.mock('./logger.mjs', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  createNotificationRule,
  deleteNotificationRule,
  listNotificationHistory,
  listNotificationRules,
  sendSystemNotification,
  sendTestNotification,
} from './notifications.mjs';
import * as vfs from './vfs-documents.mjs';
import * as ops from './ssss-operation-service.mjs';

describe('notifications.mjs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vfs.listVfsDocumentsUnder).mockReturnValue([]);
    vi.mocked(vfs.findVfsDocumentByPath).mockReturnValue(null);
    vi.mocked(ops.listVfsEvents).mockResolvedValue([]);
    vi.mocked(ops.writeVfsDocument).mockResolvedValue({ success: true });
    vi.mocked(ops.deleteVfsDocument).mockResolvedValue({ success: true });
    vi.mocked(ops.appendVfsEvent).mockResolvedValue({ success: true });
  });

  it('exports sendSystemNotification', () => {
    expect(sendSystemNotification).toBeDefined();
  });

  it('lists rules from VFS notification_rule docs', () => {
    vi.mocked(vfs.listVfsDocumentsUnder).mockReturnValue([
      {
        type: 'notification_rule',
        frontmatter: {
          type: 'notification_rule',
          id: 'abc',
          event: 'node_offline',
          channel: 'desktop',
          priority: 'critical',
          enabled: true,
          quietHours: false,
        },
      },
    ]);
    expect(listNotificationRules()).toEqual([
      {
        id: 'abc',
        event: 'node_offline',
        channel: 'desktop',
        priority: 'critical',
        enabled: true,
        quietHours: false,
      },
    ]);
  });

  it('creates a rule via writeVfsDocument', async () => {
    const rule = await createNotificationRule({
      event: 'leader_change',
      channel: 'webhook',
      priority: 'low',
      quietHours: true,
    });
    expect(rule.event).toBe('leader_change');
    expect(rule.channel).toBe('webhook');
    expect(rule.quietHours).toBe(true);
    expect(ops.writeVfsDocument).toHaveBeenCalled();
    const [path, fm] = vi.mocked(ops.writeVfsDocument).mock.calls[0];
    expect(path).toMatch(/^system\/notification-rules\/.+\.md$/);
    expect(fm.type).toBe('notification_rule');
  });

  it('rejects invalid events', async () => {
    await expect(createNotificationRule({ event: 'not-real', channel: 'desktop', priority: 'high' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('deletes an existing rule', async () => {
    vi.mocked(vfs.findVfsDocumentByPath).mockReturnValue({ vfs_path: 'system/notification-rules/x.md' });
    await expect(deleteNotificationRule('x')).resolves.toEqual({ success: true, id: 'x' });
    expect(ops.deleteVfsDocument).toHaveBeenCalled();
  });

  it('lists history from notifications event workspace', async () => {
    vi.mocked(ops.listVfsEvents).mockResolvedValue([
      {
        event_id: 'ev1',
        payload: {
          kind: 'notification_delivery',
          id: 'h1',
          title: 'Hello',
          message: 'World',
          channel: 'desktop',
          status: 'delivered',
          timestamp: '2026-07-19T12:00:00.000Z',
        },
      },
    ]);
    const history = await listNotificationHistory();
    expect(history).toHaveLength(1);
    expect(history[0].title).toBe('Hello');
    expect(ops.listVfsEvents).toHaveBeenCalledWith({ workspaceId: 'notifications' });
  });

  it('sendTestNotification records delivery history', async () => {
    const entry = await sendTestNotification();
    expect(entry.title).toBe('Total Recall');
    expect(entry.status).toBe('delivered');
    expect(ops.appendVfsEvent).toHaveBeenCalled();
  });
});
