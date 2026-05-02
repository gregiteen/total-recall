/**
 * notify.mjs — Agent Notification Queue (Phase 11 + C4)
 *
 * Directory-based notification queue at ~/.total-recall/notifications/.
 * Each notification is a single JSON file — no race conditions.
 *
 * Multi-channel delivery:
 *   1. All configured channels: macOS, Slack, Discord, Email (user-facing)
 *   2. ACTIVE CONTEXT injection (agent-facing, next cycle)
 *
 * Staleness: notifications older than 30 minutes are auto-purged.
 *
 * CLI: tr-notify "title" "message" [--type tip|caution|important|note] [--channel slack]
 * API: import { enqueue, drain, purgeStale } from './notify.mjs'
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── CONSTANTS ──────────────────────────────────────────────────────────────────

const NOTIFY_DIR = path.join(os.homedir(), '.total-recall', 'notifications');
const STALENESS_MS = 30 * 60 * 1000; // 30 minutes

// ─── ENSURE DIRECTORY ───────────────────────────────────────────────────────────

function ensureDir() {
  fs.mkdirSync(NOTIFY_DIR, { recursive: true, mode: 0o700 });
}

// ─── ENQUEUE ────────────────────────────────────────────────────────────────────

/**
 * Enqueue a notification into the directory-based queue.
 * Also dispatches to all configured notification channels.
 *
 * @param {Object} notification
 * @param {string} notification.title - Notification title
 * @param {string} notification.message - Notification body
 * @param {string} [notification.type='note'] - Alert type: tip|caution|important|note
 * @param {boolean} [notification.desktop=true] - Send to user-facing channels
 * @param {string[]} [notification.channels] - Override: only send to these channels
 * @returns {{ filePath: string, channels: { sent: string[], failed: string[] } }}
 */
export function enqueue({ title, message, type = 'note', desktop = true, channels }) {
  ensureDir();

  const timestamp = Date.now();
  const id = `${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
  const filePath = path.join(NOTIFY_DIR, `${id}.json`);

  const payload = {
    id,
    title,
    message,
    type,
    timestamp: new Date(timestamp).toISOString(),
    read: false,
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));

  // Dispatch to all configured channels (fire-and-forget, non-blocking)
  let channelResult = { sent: [], failed: [] };
  if (desktop) {
    // Lazy-load dispatcher to avoid circular deps
    import('../notifications/dispatcher.mjs')
      .then(({ dispatch }) => dispatch(title, message, { type, channels, silent: !desktop }))
      .then(result => { channelResult = result; })
      .catch(() => { /* best effort */ });
  }

  return { filePath, channels: channelResult };
}

// ─── DRAIN ──────────────────────────────────────────────────────────────────────

/**
 * Read and remove all unread notifications from the queue.
 * Returns them sorted by timestamp (oldest first) as context items
 * ready for ACTIVE CONTEXT injection.
 *
 * @returns {Object[]} Context items: { type, label, text }
 */
export function drain() {
  ensureDir();

  const files = fs.readdirSync(NOTIFY_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) return [];

  const items = [];

  for (const file of files) {
    const filePath = path.join(NOTIFY_DIR, file);
    try {
      const payload = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      items.push({
        type: payload.type || 'note',
        label: payload.title,
        text: payload.message,
        timestamp: payload.timestamp,
      });
      // Remove after reading
      fs.unlinkSync(filePath);
    } catch {
      // Skip corrupt files
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    }
  }

  // Sort oldest first
  items.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return items;
}

// ─── PURGE STALE ────────────────────────────────────────────────────────────────

/**
 * Remove notifications older than the staleness threshold (30 min).
 * @returns {number} Number of purged notifications
 */
export function purgeStale() {
  ensureDir();

  const files = fs.readdirSync(NOTIFY_DIR).filter(f => f.endsWith('.json'));
  const now = Date.now();
  let purged = 0;

  for (const file of files) {
    const filePath = path.join(NOTIFY_DIR, file);
    try {
      const payload = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const age = now - new Date(payload.timestamp).getTime();
      if (age > STALENESS_MS) {
        fs.unlinkSync(filePath);
        purged++;
      }
    } catch {
      // Remove corrupt files
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      purged++;
    }
  }

  return purged;
}

// ─── LIST (NON-DESTRUCTIVE) ─────────────────────────────────────────────────────

/**
 * List all pending notifications without removing them.
 * @returns {Object[]}
 */
export function list() {
  ensureDir();

  const files = fs.readdirSync(NOTIFY_DIR).filter(f => f.endsWith('.json'));
  const items = [];

  for (const file of files) {
    try {
      const payload = JSON.parse(fs.readFileSync(path.join(NOTIFY_DIR, file), 'utf-8'));
      items.push(payload);
    } catch { /* skip */ }
  }

  items.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return items;
}

// ─── CLI ENTRY POINT ────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith('notify.mjs')) {
  const args = process.argv.slice(2);

  if (args[0] === '--list') {
    const items = list();
    if (items.length === 0) {
      console.log('📭 No pending notifications');
    } else {
      console.log(`📬 ${items.length} pending notification(s):\n`);
      for (const item of items) {
        console.log(`  [${item.type.toUpperCase()}] ${item.title}`);
        console.log(`    ${item.message}`);
        console.log(`    ${item.timestamp}\n`);
      }
    }
    process.exit(0);
  }

  if (args[0] === '--drain') {
    const items = drain();
    console.log(`📬 Drained ${items.length} notification(s)`);
    for (const item of items) {
      console.log(`  [${item.type.toUpperCase()}] ${item.label}: ${item.text}`);
    }
    process.exit(0);
  }

  if (args[0] === '--purge') {
    const purged = purgeStale();
    console.log(`🗑️  Purged ${purged} stale notification(s)`);
    process.exit(0);
  }

  // Default: enqueue a notification
  const title = args[0] || 'Total Recall';
  const message = args[1] || 'Notification';
  let type = 'note';
  const typeIdx = args.indexOf('--type');
  if (typeIdx !== -1 && args[typeIdx + 1]) type = args[typeIdx + 1];

  const result = enqueue({ title, message, type });
  console.log(`✅ Notification queued${result.desktopSent ? ' + desktop sent' : ''}`);
}
