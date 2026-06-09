import express from 'express';
import { requireAuth, requireScope } from '../auth.mjs';
import { listQueue, addToQueue, updateQueueItem, removeFromQueue } from '../../core/research-queue.mjs';
import { logger } from '../../core/logger.mjs';

function badRequest(res, msg) {
  return res.status(400).json({ error: msg });
}

function notFound(res, msg) {
  return res.status(404).json({ error: msg || 'Not found' });
}

function serverError(res, err) {
  logger.error('research', 'Internal server error', { error: err.message, stack: err.stack });
  return res.status(500).json({ error: 'Internal server error' });
}

export const researchRouter = express.Router();

// ─── Research Queue ───────────────────────────────────────────────────────────
// Thin REST wrappers over src/core/research-queue.mjs

researchRouter.get('/api/research', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const { status, query, limit, offset } = req.query;
    res.json(listQueue({ status, query, limit, offset }));
  } catch (err) { serverError(res, err); }
});

researchRouter.post('/api/research', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    const { topic, priority, notes } = req.body || {};
    if (!topic) return badRequest(res, 'topic is required');
    res.status(201).json(addToQueue({ topic, priority, notes }));
  } catch (err) { serverError(res, err); }
});

researchRouter.patch('/api/research/:id', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    res.json(updateQueueItem(req.params.id, req.body || {}));
  } catch (err) {
    if (err.status === 404) return notFound(res, err.message);
    serverError(res, err);
  }
});

researchRouter.delete('/api/research/:id', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    res.json(removeFromQueue(req.params.id));
  } catch (err) {
    if (err.status === 404) return notFound(res, err.message);
    serverError(res, err);
  }
});
