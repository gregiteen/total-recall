/**
 * /api/notifications/* — alert rules + delivery history for the Notifications page.
 *
 * Rules: VFS docs at system/notification-rules/*.md
 * History: SSSS event workspace `notifications`
 */
import { Router } from 'express';
import { requireAuth, requireScope } from '../auth.mjs';
import {
  createNotificationRule,
  deleteNotificationRule,
  listNotificationHistory,
  listNotificationRules,
  sendTestNotification,
} from '../../core/notifications.mjs';
import { logger } from '../../core/logger.mjs';

const router = Router();

router.get(
  '/api/notifications/rules',
  requireAuth,
  requireScope('config:read'),
  async (_req, res) => {
    try {
      const rules = listNotificationRules();
      res.json(rules);
    } catch (err) {
      logger.error('notifications', 'list rules failed', { error: err.message });
      res.status(500).json({ error: err.message || 'Failed to list notification rules' });
    }
  },
);

router.post(
  '/api/notifications/rules',
  requireAuth,
  requireScope('config:write'),
  async (req, res) => {
    try {
      const rule = await createNotificationRule(req.body || {});
      res.status(201).json(rule);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) {
        logger.error('notifications', 'create rule failed', { error: err.message });
      }
      res.status(status).json({ error: err.message || 'Failed to create notification rule' });
    }
  },
);

router.delete(
  '/api/notifications/rules/:id',
  requireAuth,
  requireScope('config:write'),
  async (req, res) => {
    try {
      const result = await deleteNotificationRule(req.params.id);
      res.json(result);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) {
        logger.error('notifications', 'delete rule failed', { error: err.message });
      }
      res.status(status).json({ error: err.message || 'Failed to delete notification rule' });
    }
  },
);

router.get(
  '/api/notifications/history',
  requireAuth,
  requireScope('config:read'),
  async (req, res) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 100;
      const history = await listNotificationHistory({ limit });
      res.json(history);
    } catch (err) {
      logger.error('notifications', 'list history failed', { error: err.message });
      res.status(500).json({ error: err.message || 'Failed to list notification history' });
    }
  },
);

router.post(
  '/api/notifications/test',
  requireAuth,
  requireScope('config:write'),
  async (_req, res) => {
    try {
      const entry = await sendTestNotification();
      res.json({ success: true, entry });
    } catch (err) {
      logger.error('notifications', 'test notification failed', { error: err.message });
      res.status(500).json({ error: err.message || 'Failed to send test notification' });
    }
  },
);

export default router;
export { router as notificationsRouter };
