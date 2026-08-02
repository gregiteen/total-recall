import express from 'express';
import { requireAuth, requireScope } from '../auth.mjs';
import { resolveVaultFromQuery } from './_shared.mjs';
import {
  listProposals,
  getProposal,
  applyProposal,
  setProposalStatus,
  revertProposal,
  AUTO_APPLICABLE_TOPICS,
  hasHandler,
} from '../../core/proposal-applier.mjs';
import { findStaleNodes } from '../../core/optimizer.mjs';
import { logger } from '../../core/logger.mjs';

/**
 * REST surface for optimizer proposals.
 *
 * Until now the only HTTP route mentioning proposals was a proxy to a *remote*
 * vault's admin API — the local queue had no endpoint at all, which is part of
 * why the dashboard never showed the 16k files piling up underneath it.
 */
export const proposalsRouter = express.Router();

function serverError(res, err, scope = 'proposals') {
  logger.error(scope, 'Internal server error', { error: err.message, stack: err.stack });
  return res.status(500).json({ error: 'Internal server error' });
}

function decorate(p) {
  return { ...p, auto_applicable: AUTO_APPLICABLE_TOPICS.has(p.topic) && hasHandler(p.topic) };
}

proposalsRouter.get('/api/proposals', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    const { status, topic } = req.query;
    const items = listProposals(vaultDir, {
      status: status === 'all' ? undefined : (status || ['draft', 'accepted']),
      topic: topic || undefined,
    }).map(decorate);

    // Counts always span every status, independent of the current filter — a
    // status breakdown that changes with the filter is useless as a dashboard.
    const counts = { draft: 0, accepted: 0, applied: 0, rejected: 0, superseded: 0 };
    for (const p of listProposals(vaultDir)) {
      if (counts[p.status] !== undefined) counts[p.status]++;
    }
    res.json({ counts, total: items.length, items });
  } catch (err) { serverError(res, err); }
});

proposalsRouter.get('/api/proposals/stale', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    const days = Number(req.query.days) || 30;
    const minImportance = Number(req.query.min_importance) || 4;
    const stale = findStaleNodes(vaultDir, { days, minImportance }).map(n => ({
      slug: n.slug,
      title: n.title,
      importance: n.importance,
      last_accessed: n.last_accessed,
      stale_days: Math.floor((Date.now() - new Date(n.last_accessed).getTime()) / 86400000),
    }));
    res.json({ total: stale.length, days, min_importance: minImportance, items: stale });
  } catch (err) { serverError(res, err); }
});

proposalsRouter.get('/api/proposals/:id', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const proposal = getProposal(resolveVaultFromQuery(req), req.params.id);
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    res.json(decorate(proposal));
  } catch (err) { serverError(res, err); }
});

proposalsRouter.post('/api/proposals/:id/apply', requireAuth, requireScope('memory:write'), async (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    const result = await applyProposal(vaultDir, req.params.id, {
      dryRun: Boolean(req.body?.dry_run),
      actor: req.body?.actor || 'api',
    });
    // A refused apply is a valid answer about the proposal, not a server fault —
    // 409 so callers can distinguish "won't" from "broke".
    res.status(result.ok ? 200 : 409).json(result);
  } catch (err) {
    if (/not found/i.test(err.message)) return res.status(404).json({ error: err.message });
    serverError(res, err);
  }
});

proposalsRouter.post('/api/proposals/:id/reject', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    const reason = req.body?.reason || 'Rejected via API.';
    res.json(setProposalStatus(vaultDir, req.params.id, 'rejected', {
      rejection_reason: reason,
      reviewed_by: req.body?.actor || 'api',
    }));
  } catch (err) {
    if (/not found/i.test(err.message)) return res.status(404).json({ error: err.message });
    serverError(res, err);
  }
});

proposalsRouter.post('/api/proposals/:id/revert', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    res.json(revertProposal(resolveVaultFromQuery(req), req.params.id));
  } catch (err) {
    if (/No undo snapshot|not found/i.test(err.message)) return res.status(404).json({ error: err.message });
    serverError(res, err);
  }
});

export default proposalsRouter;
