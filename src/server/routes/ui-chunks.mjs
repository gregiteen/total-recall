import { Router } from 'express';
import { getUiChunk, searchUiChunks, UiChunkInputError } from '../../core/ui-chunks.mjs';
import { requireAuth, requireScope } from '../auth.mjs';

const router = Router();

function sendChunkData(res, read) {
  res.set('Cache-Control', 'private, no-store').set('X-Content-Type-Options', 'nosniff');
  try {
    const result = read();
    if (!result) return res.status(404).json({ error: 'UI chunk unavailable' });
    return res.json(result);
  } catch (error) {
    if (error instanceof UiChunkInputError) return res.status(400).json({ error: error.message });
    return res.status(500).json({ error: 'Could not read the UI chunk catalog' });
  }
}

router.get('/api/ui-chunks', requireAuth, requireScope('config:read'), (req, res) => {
  const { plugin, surface, q, limit } = req.query;
  return sendChunkData(res, () => {
    if (limit !== undefined && (typeof limit !== 'string' || !/^\d{1,3}$/.test(limit))) {
      throw new UiChunkInputError('Limit must be between 1 and 200.');
    }
    return searchUiChunks({ plugin, surface, query: q, limit: limit === undefined ? undefined : Number(limit) });
  });
});

router.get('/api/ui-chunks/:plugin/:id', requireAuth, requireScope('config:read'), (req, res) =>
  sendChunkData(res, () => {
    const chunk = getUiChunk(req.params.plugin, req.params.id, { surface: req.query.surface });
    return chunk ? { chunk } : null;
  }));

export default router;
