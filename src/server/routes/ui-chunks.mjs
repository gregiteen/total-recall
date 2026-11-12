import { Router } from 'express';
import { addWorkspaceUiChunk, getUiChunk, readPluginDesign, searchUiChunks, UiChunkInputError } from '../../core/ui-chunks.mjs';
import { chooseUiComposition } from '../../core/ui-chunk-choice.mjs';
import {
  createWorkspacePage, listWorkspacePages, prepareWorkspacePage, publishWorkspaceComposition,
  readWorkspaceComposition, readWorkspacePage, saveWorkspaceCompositionPage,
  updateWorkspacePage,
} from '../../core/workspace-compositions.mjs';
import { requireAuth, requireScope } from '../auth.mjs';
import { resolvePluginBrainTargets } from '../plugin-brain-targets.mjs';
import { BRAIN_DIR } from './_shared.mjs';

const router = Router();

function workspaceTarget(req, brainId) {
  return brainId === undefined
    ? { brainDir: BRAIN_DIR, projectRoot: process.cwd() }
    : resolvePluginBrainTargets([brainId], req.auth)[0];
}

function sendScopeError(res, error) {
  if ([400, 403, 404, 409, 503].includes(error.status)) {
    res.status(error.status).json({ error: error.message });
    return true;
  }
  return false;
}

function sendWorkspaceData(res, read, resource = 'UI chunk') {
  res.set('Cache-Control', 'private, no-store').set('X-Content-Type-Options', 'nosniff');
  try {
    const result = read();
    if (!result) return res.status(404).json({ error: `${resource} unavailable` });
    return res.json(result);
  } catch (error) {
    if (error instanceof UiChunkInputError) return res.status(400).json({ error: error.message });
    if (sendScopeError(res, error)) return;
    return res.status(500).json({ error: resource === 'UI chunk' ? 'Could not read the UI chunk catalog' : 'Could not read saved pages' });
  }
}

router.get('/api/ui-chunks', requireAuth, requireScope('config:read'), (req, res) => {
  const { plugin, surface, q, limit, offset } = req.query;
  return sendWorkspaceData(res, () => {
    if (limit !== undefined && (typeof limit !== 'string' || !/^\d{1,3}$/.test(limit))) {
      throw new UiChunkInputError('Limit must be between 1 and 200.');
    }
    if (offset !== undefined && (typeof offset !== 'string' || !/^\d{1,16}$/.test(offset))) {
      throw new UiChunkInputError('Offset must be a nonnegative integer.');
    }
    return searchUiChunks({
      ...workspaceTarget(req, req.query.brain), plugin, surface, query: q,
      limit: limit === undefined ? undefined : Number(limit),
      offset: offset === undefined ? undefined : Number(offset),
    });
  });
});

router.get('/api/ui-chunks/:plugin/:id', requireAuth, requireScope('config:read'), (req, res) =>
  sendWorkspaceData(res, () => {
    const chunk = getUiChunk(req.params.plugin, req.params.id, { ...workspaceTarget(req, req.query.brain), surface: req.query.surface });
    return chunk ? { chunk } : null;
  }));

router.get('/api/ui-chunks/:plugin/design/revision', requireAuth, requireScope('config:read'), (req, res) =>
  sendWorkspaceData(res, () => {
    const { revision } = req.query;
    if (revision !== undefined && (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision))) {
      throw new UiChunkInputError('Invalid design revision.');
    }
    return readPluginDesign(req.params.plugin, { ...workspaceTarget(req, req.query.brain), revision });
  }));

router.get('/api/ui-chunks/:plugin/composition/current', requireAuth, requireScope('config:read'), (req, res) =>
  sendWorkspaceData(res, () => {
    const { brainDir, projectRoot } = workspaceTarget(req, req.query.brain);
    return readWorkspaceComposition(brainDir, req.params.plugin, projectRoot);
  }));

function workspacePagePath(id, brain) {
  return '/memory?' + new URLSearchParams({ page: id, brain });
}

router.get('/api/workspace/pages', requireAuth, requireScope('config:read'), (req, res) =>
  sendWorkspaceData(res, () => {
    const { brainDir } = resolvePluginBrainTargets([req.query.brain], req.auth)[0];
    return { pages: listWorkspacePages(brainDir) };
  }, 'Saved page'));

router.get('/api/workspace/pages/:id', requireAuth, requireScope('config:read'), (req, res) =>
  sendWorkspaceData(res, () => {
    const { brainDir, projectRoot } = resolvePluginBrainTargets([req.query.brain], req.auth)[0];
    return readWorkspacePage(brainDir, req.params.id, projectRoot);
  }, 'Saved page'));

router.post('/api/workspace/pages', requireAuth, requireScope('config:write'), async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (!req.is('application/json')) return res.status(415).json({ error: 'Use JSON to save a page.' });
  try {
    const { id, title, brainId, sourcePlugin, sourceVersion, keys } = req.body ?? {};
    const { brainDir, projectRoot } = resolvePluginBrainTargets([brainId], req.auth)[0];
    if (keys !== undefined && (sourcePlugin !== undefined || sourceVersion !== undefined)) {
      throw new UiChunkInputError('Supply either ordered block keys or a source Home revision.');
    }
    const page = keys === undefined
      ? await saveWorkspaceCompositionPage(brainDir, { id, title, sourcePlugin, sourceVersion }, projectRoot)
      : await createWorkspacePage(brainDir, { id, title, keys }, projectRoot);
    return res.status(201).json({ ...page, path: workspacePagePath(id, brainId) });
  } catch (error) {
    if (error instanceof UiChunkInputError) return res.status(400).json({ error: error.message });
    if (sendScopeError(res, error)) return;
    return res.status(500).json({ error: 'Could not save the page.' });
  }
});

router.put('/api/workspace/pages/:id', requireAuth, requireScope('config:write'), async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (!req.is('application/json')) return res.status(415).json({ error: 'Use JSON to edit a page.' });
  try {
    const { brainId, revision, keys } = req.body ?? {};
    const { id } = req.params;
    const { brainDir, projectRoot } = resolvePluginBrainTargets([brainId], req.auth)[0];
    const page = await updateWorkspacePage(brainDir, { id, revision, keys }, projectRoot);
    return res.json({ ...page, path: workspacePagePath(id, brainId) });
  } catch (error) {
    if (error instanceof UiChunkInputError) return res.status(400).json({ error: error.message });
    if (sendScopeError(res, error)) return;
    if (error.message.startsWith('Plugin state version conflict')) {
      return res.status(409).json({ error: 'The saved page changed. Read its current revision before editing.' });
    }
    return res.status(500).json({ error: 'Could not edit the saved page.' });
  }
});

router.post('/api/ui-chunks/pool', requireAuth, requireScope('config:write'), async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (!req.is('application/json')) return res.status(415).json({ error: 'Use JSON to add a block.' });
  try {
    const { brainDir, projectRoot } = workspaceTarget(req, req.body?.brainId);
    return res.status(201).json(await addWorkspaceUiChunk(brainDir, req.body ?? {}, projectRoot));
  } catch (error) {
    if (error instanceof UiChunkInputError) return res.status(400).json({ error: error.message });
    if (sendScopeError(res, error)) return;
    if (error.message.startsWith('Plugin state version conflict')) return res.status(409).json({ error: 'That workspace block ID already exists.' });
    return res.status(500).json({ error: 'Could not add the block to the pool.' });
  }
});

router.post(['/api/ui-chunks/suggest', '/api/ui-chunks/compose'], requireAuth, requireScope('config:write'), async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (!req.is('application/json')) return res.status(415).json({ error: 'Use JSON to request a block suggestion.' });
  const { plugin, query, brainId, pageId, pageTitle } = req.body ?? {};
  if (typeof plugin !== 'string' || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'Choose a plugin and describe what you want to do.' });
  }
  try {
    const publish = req.path === '/api/ui-chunks/compose';
    const named = pageId !== undefined || pageTitle !== undefined;
    if (named && !publish) throw new UiChunkInputError('Use compose to publish a saved page.');
    const resolveDestination = () => named
      ? resolvePluginBrainTargets([brainId], req.auth)[0]
      : workspaceTarget(req, brainId);
    const target = resolveDestination();
    if (named) prepareWorkspacePage(target.brainDir, pageId, pageTitle);
    const current = publish && !named ? readWorkspaceComposition(target.brainDir, plugin, target.projectRoot) : null;
    const { chunks } = searchUiChunks({ ...target, plugin: publish ? undefined : plugin, surface: 'page', query, limit: 20 });
    const selection = await chooseUiComposition(chunks, query.trim(), undefined, target);
    if (!publish) return res.json({ chunks, selection });
    if (selection.source !== 'decision' || !selection.keys.length) {
      return res.status(422).json({ error: 'Jev did not select a page to publish.', selection });
    }
    const destination = resolveDestination();
    if (target.brainDir !== destination.brainDir || target.projectRoot !== destination.projectRoot) {
      return res.status(409).json({ error: 'The destination brain changed while Jev was composing.' });
    }
    if (named) {
      const page = await createWorkspacePage(destination.brainDir, { id: pageId, title: pageTitle, keys: selection.keys }, destination.projectRoot);
      return res.json({ selection, version: page.version, path: workspacePagePath(pageId, brainId) });
    }
    const state = await publishWorkspaceComposition(target.brainDir, plugin, selection.keys, current.version, target.projectRoot);
    const params = new URLSearchParams({ plugin });
    if (destination.brainId) params.set('brain', destination.brainId);
    return res.json({ selection, version: state.version, path: '/memory?' + params });
  } catch (error) {
    if (error instanceof UiChunkInputError) return res.status(400).json({ error: error.message });
    if (sendScopeError(res, error)) return;
    if (error.message.startsWith('Plugin state version conflict')) return res.status(409).json({ error: 'The page changed while Jev was composing it.' });
    return res.status(500).json({ error: 'Could not suggest a page block.' });
  }
});

export default router;
