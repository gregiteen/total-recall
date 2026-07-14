/**
 * System Routes
 *
 * GET  /api/logs/:type           — Read last 200 lines of server or daemon log
 * POST /api/diagnostics/agents   — Run upgrade --agents diagnostics
 * POST /api/diagnostics/agents   — Run upgrade --agents diagnostics
 * GET  /api/tasks/failed         — List failed tasks from the DLQ
 * POST /api/tasks/:id/retry      — Re-queue a failed task
 * GET  /api/usage                — Usage ledger + cost summary
 */

import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { requireAuth, requireScope } from '../auth.mjs';
import { BRAIN_DIR, serverError } from './_shared.mjs';
import { logger } from '../../core/logger.mjs';

// Resolve package root (src/server/routes/ → go up 3 levels)
import { fileURLToPath } from 'node:url';
const ROOT = process.env.TR_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const QUEUE_DIR = path.join(BRAIN_DIR, 'scheduler', 'queue');

const router = Router();

// ─── Pricing map cache (shared by /api/usage) ────────────────────────────────

let cachedPricingMap = null;
let lastPricingFetch = 0;

async function getPricingMap() {
  if (cachedPricingMap && Date.now() - lastPricingFetch < 1000 * 60 * 60) {
    return cachedPricingMap;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch('https://openrouter.ai/api/v1/models', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.ok) {
      const data = await response.json();
      const map = {};
      for (const m of (data.data || [])) {
        const parts = m.id.split('/');
        const baseId = parts[parts.length - 1];
        map[baseId] = m.pricing;
        map[m.id] = m.pricing;
      }
      cachedPricingMap = map;
      lastPricingFetch = Date.now();
      return map;
    }
  } catch (e) {}
  return {};
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/logs/:type
 * Returns last 200 lines of the server or daemon log.
 */
router.get('/api/logs/:type', requireAuth, requireScope('health:read'), (req, res) => {
  try {
    const { type } = req.params;
    if (type !== 'server' && type !== 'daemon') {
      return res.status(400).json({ error: 'Invalid log type. Must be "server" or "daemon"' });
    }
    const logPath = path.join(BRAIN_DIR, 'logs', `${type}.log`);
    if (!fs.existsSync(logPath)) {
      return res.json({ content: '(no logs yet)' });
    }

    const stat = fs.statSync(logPath);
    const maxReadBytes = 50000;
    let content = '';

    if (stat.size > maxReadBytes) {
      const fd = fs.openSync(logPath, 'r');
      const buffer = Buffer.alloc(maxReadBytes);
      fs.readSync(fd, buffer, 0, maxReadBytes, stat.size - maxReadBytes);
      fs.closeSync(fd);
      content = buffer.toString('utf8');
    } else {
      content = fs.readFileSync(logPath, 'utf8');
    }

    const lines = content.split('\n');
    const lastLines = lines.slice(-200).join('\n');
    res.json({ content: lastLines });
  } catch (err) { serverError(res, err); }
});

/**
 * POST /api/diagnostics/agents
 * Run `upgrade --agents` diagnostics checks and return the console text output.
 */
router.post('/api/diagnostics/agents', requireAuth, requireScope('health:read'), async (req, res) => {
  try {
    const result = spawnSync('node', [path.join(ROOT, 'bin', 'total-recall.mjs'), 'upgrade', '--agents'], {
      encoding: 'utf8',
      cwd: ROOT,
      env: { ...process.env }
    });
    const output = (result.stdout || '') + (result.stderr || '');
    res.json({ success: result.status === 0, output });
  } catch (err) {
    serverError(res, err);
  }
});



/**
 * GET /api/tasks/failed
 * List failed tasks from the scheduler DLQ.
 */
router.get('/api/tasks/failed', requireAuth, async (req, res) => {
  try {
    const { loadPendingTasks } = await import('../../core/scheduler.mjs');
    const allTasks = loadPendingTasks(QUEUE_DIR);
    const failed = allTasks.filter(t => t.status === 'failed');
    res.json({ total: failed.length, tasks: failed });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/tasks/:id/retry
 * Re-queue a failed task.
 */
router.post('/api/tasks/:id/retry', requireAuth, async (req, res) => {
  try {
    const taskId = req.params.id;
    const { loadPendingTasks, updateTaskStatus } = await import('../../core/scheduler.mjs');
    const allTasks = loadPendingTasks(QUEUE_DIR);
    const task = allTasks.find(t => t.slug === taskId);
    if (!task) return res.status(404).json({ error: 'Task not found in queue' });
    if (task.status !== 'failed') return res.status(400).json({ error: 'Task is not in failed state' });
    updateTaskStatus(task, 'pending', QUEUE_DIR);
    res.json({ success: true, message: `Task ${taskId} re-queued` });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/usage
 * Return usage ledger synced against current pricing.
 */
router.get('/api/usage', requireAuth, async (req, res) => {
  try {
    const { syncUsageLedger, calculateCurrentCost } = await import('../../core/usage-tracker.mjs');

    // Sync the ledger first to capture new logs and lock in current prices
    const pricingMap = await getPricingMap();
    syncUsageLedger(pricingMap);

    res.json(calculateCurrentCost());
  } catch (err) { serverError(res, err); }
});

export default router;
export { router as systemRouter };
