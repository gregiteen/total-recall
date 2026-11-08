import { Router } from 'express';
import { getUiChunk, searchUiChunks, UiChunkInputError } from '../../core/ui-chunks.mjs';
import { chooseUiComposition } from '../../core/ui-chunk-choice.mjs';
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

router.post('/api/ui-chunks/suggest', requireAuth, requireScope('config:write'), async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (!req.is('application/json')) return res.status(415).json({ error: 'Use JSON to request a block suggestion.' });
  const { plugin, query } = req.body ?? {};
  if (typeof plugin !== 'string' || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'Choose a plugin and describe what you want to do.' });
  }
  try {
    const { chunks } = searchUiChunks({ plugin, surface: 'page', query, limit: 20 });
    const selection = await chooseUiComposition(chunks, query.trim());
    return res.json({ chunks, selection });
  } catch (error) {
    if (error instanceof UiChunkInputError) return res.status(400).json({ error: error.message });
    return res.status(500).json({ error: 'Could not suggest a page block.' });
  }
});

export default router;
