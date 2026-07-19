import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import { logger } from './logger.mjs';
import { findVfsDocumentByPath, listVfsDocumentsUnder } from './vfs-documents.mjs';
import {
  appendVfsEvent,
  deleteVfsDocument,
  listVfsEvents,
  writeVfsDocument,
} from './ssss-operation-service.mjs';

const execFileAsync = promisify(execFile);

/** Supported mesh / system alert events (Agent Rules / dashboard selector). */
export const NOTIFICATION_EVENTS = new Set([
  'node_offline',
  'leader_change',
  'webhook_failed',
  'secret_sync_failed',
  'daemon_error',
  'research_complete',
  'test',
]);

export const NOTIFICATION_CHANNELS = new Set(['desktop', 'webhook', 'email']);
export const NOTIFICATION_PRIORITIES = new Set(['critical', 'high', 'low']);

const RULES_PREFIX = 'system/notification-rules';
const HISTORY_WORKSPACE = 'notifications';
const MAX_HISTORY = 100;

function rulePath(id) {
  return `${RULES_PREFIX}/${id}.md`;
}

function eventOpts(intent) {
  return {
    actorRole: 'system',
    intent,
    workspaceId: HISTORY_WORKSPACE,
  };
}

/**
 * Sends a macOS desktop notification using terminal-notifier if available,
 * falling back to osascript.
 *
 * @param {string} title
 * @param {string} message
 * @param {object} [options]
 * @returns {Promise<{ delivered: boolean, channel: string, error?: string }>}
 */
export async function sendSystemNotification(title, message, options = {}) {
  const isTest = process.env.VITEST || process.env._TR_TEST_AGENT_DIR || process.env.NODE_ENV === 'test';
  if (isTest) {
    logger.debug('notifications: bypassing system notification in test environment');
    return { delivered: true, channel: 'desktop', bypassed: true };
  }

  const {
    open,
    sound = 'default',
    subtitle = 'Total Recall',
    group = 'total-recall-system',
  } = options;

  const cleanMessage = String(message).replace(/[^ -~]/g, '').replace(/["'`$\\]/g, '').slice(0, 200);
  const cleanTitle = String(title).replace(/[^ -~]/g, '').replace(/["'`$\\]/g, '').slice(0, 100);
  const cleanSubtitle = subtitle
    ? String(subtitle).replace(/[^ -~]/g, '').replace(/["'`$\\]/g, '').slice(0, 100)
    : '';

  try {
    const args = ['-title', cleanTitle, '-message', cleanMessage, '-group', group];
    if (cleanSubtitle) args.push('-subtitle', cleanSubtitle);
    if (open) {
      const openTarget = open.startsWith('/') || open.startsWith('~') ? `file://${open}` : open;
      args.push('-open', openTarget, '-actions', 'Open');
    }
    if (sound && sound !== 'default') args.push('-sound', sound);

    await execFileAsync('terminal-notifier', args, { timeout: 3000 });
    logger.debug('notifications: sent via terminal-notifier', { title });
    return { delivered: true, channel: 'desktop' };
  } catch {
    try {
      const appleScriptParts = [
        `display notification "${cleanMessage.replace(/"/g, '\\"')}"`,
        `with title "${cleanTitle.replace(/"/g, '\\"')}"`,
      ];
      if (sound && sound !== 'default') {
        appleScriptParts.push(`sound name "${sound}"`);
      }
      await execFileAsync('osascript', ['-e', appleScriptParts.join(' ')], { timeout: 3000 });
      logger.debug('notifications: sent via osascript', { title });
      return { delivered: true, channel: 'desktop' };
    } catch (fallbackErr) {
      logger.debug('notifications: desktop delivery failed', { err: fallbackErr.message });
      return { delivered: false, channel: 'desktop', error: fallbackErr.message };
    }
  }
}

function publicRule(doc) {
  const fm = doc.frontmatter || doc;
  return {
    id: String(fm.id || doc.vfs_path?.replace(/^.*\//, '').replace(/\.md$/, '') || ''),
    event: String(fm.event || ''),
    channel: String(fm.channel || 'desktop'),
    priority: String(fm.priority || 'high'),
    enabled: fm.enabled !== false && fm.enabled !== 'false',
    quietHours: fm.quietHours === true || fm.quietHours === 'true',
  };
}

export function listNotificationRules() {
  return listVfsDocumentsUnder(RULES_PREFIX)
    .filter((doc) => (doc.type || doc.frontmatter?.type) === 'notification_rule' || doc.event || doc.frontmatter?.event)
    .map(publicRule)
    .filter((r) => r.id && r.event);
}

/**
 * @param {object} input
 * @param {string} input.event
 * @param {string} input.channel
 * @param {string} input.priority
 * @param {boolean} [input.enabled]
 * @param {boolean} [input.quietHours]
 */
export async function createNotificationRule(input = {}) {
  const event = String(input.event || '').trim();
  const channel = String(input.channel || 'desktop').trim();
  const priority = String(input.priority || 'high').trim();
  if (!NOTIFICATION_EVENTS.has(event) || event === 'test') {
    throw Object.assign(new Error(`Unsupported event: ${event}`), { status: 400 });
  }
  if (!NOTIFICATION_CHANNELS.has(channel)) {
    throw Object.assign(new Error(`Unsupported channel: ${channel}`), { status: 400 });
  }
  if (!NOTIFICATION_PRIORITIES.has(priority)) {
    throw Object.assign(new Error(`Unsupported priority: ${priority}`), { status: 400 });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const title = `Notify: ${event} → ${channel}`;
  const description = `Alert on ${event} via ${channel} (${priority})`;
  const frontmatter = {
    type: 'notification_rule',
    title,
    description,
    timestamp: now,
    id,
    event,
    channel,
    priority,
    enabled: input.enabled !== false,
    quietHours: !!input.quietHours,
    created: now,
    updated: now,
  };

  await writeVfsDocument(rulePath(id), frontmatter, description, {
    actorRole: 'admin',
    intent: 'Create notification rule',
  });

  return publicRule({ frontmatter });
}

export async function deleteNotificationRule(id) {
  const ruleId = String(id || '').trim();
  if (!ruleId) throw Object.assign(new Error('Rule id is required'), { status: 400 });
  const path = rulePath(ruleId);
  const existing = findVfsDocumentByPath(path);
  if (!existing) throw Object.assign(new Error('Notification rule not found'), { status: 404 });
  await deleteVfsDocument(path, {
    actorRole: 'admin',
    intent: 'Delete notification rule',
  });
  return { success: true, id: ruleId };
}

/**
 * @param {object} entry
 * @param {string} entry.title
 * @param {string} entry.message
 * @param {string} entry.channel
 * @param {'delivered'|'failed'} entry.status
 */
export async function recordNotificationDelivery(entry) {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const payload = {
    kind: 'notification_delivery',
    id,
    title: String(entry.title || 'Notification').slice(0, 200),
    message: String(entry.message || '').slice(0, 1000),
    channel: String(entry.channel || 'desktop'),
    status: entry.status === 'failed' ? 'failed' : 'delivered',
    timestamp,
  };
  await appendVfsEvent(`notifications/delivery/${id}`, payload, eventOpts('Record notification delivery'));
  return payload;
}

export async function listNotificationHistory({ limit = MAX_HISTORY } = {}) {
  const events = await listVfsEvents({ workspaceId: HISTORY_WORKSPACE });
  const entries = events
    .filter((event) => event.payload?.kind === 'notification_delivery')
    .map((event) => {
      const p = event.payload || {};
      return {
        id: p.id || event.event_id || crypto.randomUUID(),
        title: p.title || 'Notification',
        message: p.message || '',
        channel: p.channel || 'desktop',
        status: p.status === 'failed' ? 'failed' : 'delivered',
        timestamp: p.timestamp || event.timestamp || new Date().toISOString(),
      };
    })
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

  const n = Number(limit);
  return Number.isFinite(n) && n > 0 ? entries.slice(0, n) : entries.slice(0, MAX_HISTORY);
}

/**
 * Deliver a test notification on the desktop channel and record history.
 */
export async function sendTestNotification() {
  const title = 'Total Recall';
  const message = 'Test notification from the dashboard';
  const result = await sendSystemNotification(title, message, {
    subtitle: 'Notifications',
    group: 'total-recall-test',
  });
  const entry = await recordNotificationDelivery({
    title,
    message,
    channel: 'desktop',
    status: result.delivered ? 'delivered' : 'failed',
  });
  return { ...entry, delivery: result };
}
