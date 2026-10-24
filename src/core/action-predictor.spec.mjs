import { describe, it, expect, vi } from 'vitest';
import { buildActionQuestions, shortlistActions, predictNextAction } from './action-predictor.mjs';

vi.mock('./cli-semantic-index.mjs', () => ({
  queryCliSemanticIndex: vi.fn(async () => [
    { id: 'core:push', verb: 'total-recall push', usage: 'total-recall push', name: 'push', description: 'Push the tree', score: 0.9 },
    { id: 'core:status', verb: 'total-recall status', usage: 'total-recall status', name: 'status', description: 'Health', score: 0.7 },
  ]),
}));

/** A stand-in Decision, matching the shape the real client returns. */
const decisionOf = (answers) => ({
  choice: (k, d = '') => answers[k]?.value ?? d,
  noul: (k, d = false) => answers[k]?.value ?? d,
  confidence: (k) => answers[k]?.confidence ?? 1,
  modelVersion: 'typesafe/jev-1.14-20261014',
  endpointUsed: 'https://openrouter.ai/api/alpha/decisions',
  cost: 0.00002,
  latencyMs: 250,
});

describe('action predictor', () => {
  it('builds a choice question whose options are the retrieved commands', () => {
    const candidates = [
      { usage: 'total-recall push', name: 'push', description: 'Push the tree' },
      { usage: 'total-recall status', name: 'status', description: 'Health' },
    ];
    const q = buildActionQuestions(candidates, { intent: 'publish work' });
    expect(q.next_action.type).toBe('choice');
    expect(Object.keys(q.next_action.criteria)).toEqual(['total-recall push', 'total-recall status', 'none']);
    // The description is the routing signal, so it must reach the criteria.
    expect(q.next_action.criteria['total-recall push']).toContain('Push the tree');
    expect(q.next_action.instructions).toContain('publish work');
    expect(q.actionable.type).toBe('noul');
  });

  it('can omit the "none" escape hatch when the caller demands a command', () => {
    const q = buildActionQuestions([{ usage: 'x', name: 'x' }], { allowNone: false });
    expect(Object.keys(q.next_action.criteria)).toEqual(['x']);
    expect(q.actionable).toBeUndefined();
  });

  it('returns a chosen action with its confidence and alternatives', async () => {
    const requestDecision = async () => decisionOf({
      next_action: { value: 'total-recall push', confidence: 0.92 },
      actionable: { value: true, confidence: 0.9 },
    });
    const r = await predictNextAction('publish work', { requestDecision, derivedDir: '/x' });
    expect(r.ok).toBe(true);
    expect(r.abstained).toBe(false);
    expect(r.action.usage).toBe('total-recall push');
    expect(r.confidence).toBe(0.92);
    expect(r.alternatives.map(a => a.usage)).toEqual(['total-recall status']);
  });

  it('abstains rather than acting below the confidence gate', async () => {
    // The point of returning confidence is that a low one is usable advice and
    // not an action.
    const requestDecision = async () => decisionOf({ next_action: { value: 'total-recall push', confidence: 0.31 } });
    const r = await predictNextAction('publish work', { requestDecision, derivedDir: '/x', minConfidence: 0.5 });
    expect(r.abstained).toBe(true);
    expect(r.reason).toBe('low-confidence');
    expect(r.candidate.usage).toBe('total-recall push');
    expect(r.minConfidence).toBe(0.5);
  });

  it('abstains when the model names an option that was never offered', async () => {
    const requestDecision = async () => decisionOf({ next_action: { value: 'total-recall rm -rf /', confidence: 0.99 } });
    const r = await predictNextAction('publish work', { requestDecision, derivedDir: '/x' });
    expect(r.abstained).toBe(true);
    expect(r.reason).toBe('no-command-fits');
    expect(r.action).toBeUndefined();
  });

  it('abstains when the model reports the state is insufficient', async () => {
    const requestDecision = async () => decisionOf({
      next_action: { value: 'total-recall push', confidence: 0.88 },
      actionable: { value: false, confidence: 0.9 },
    });
    const r = await predictNextAction('publish work', { requestDecision, derivedDir: '/x' });
    expect(r.abstained).toBe(true);
    expect(r.reason).toBe('model-reports-insufficient-state');
  });

  it('reports a provider failure instead of inventing an action', async () => {
    const r = await predictNextAction('publish work', { requestDecision: async () => null, derivedDir: '/x' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-decision');
    expect(r.action).toBeUndefined();
  });

  it('reports an empty shortlist without calling the provider', async () => {
    const { queryCliSemanticIndex } = await import('./cli-semantic-index.mjs');
    queryCliSemanticIndex.mockResolvedValueOnce([]);
    const requestDecision = vi.fn();
    const r = await predictNextAction('nothing matches', { requestDecision, derivedDir: '/x' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-candidates');
    expect(requestDecision).not.toHaveBeenCalled();
  });

  it('narrows the catalog before the model sees it', async () => {
    // 352 commands must never be an option set; retrieval does the narrowing
    // and it is deterministic and free.
    const candidates = await shortlistActions('anything', { derivedDir: '/x', limit: 20 });
    expect(candidates.length).toBeLessThanOrEqual(20);
    expect(candidates[0]).toHaveProperty('usage');
  });
});
