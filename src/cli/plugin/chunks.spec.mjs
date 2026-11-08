import { expect, it } from 'vitest';
import { chooseUiChunk, chooseUiComposition } from '../../core/ui-chunk-choice.mjs';

const candidates = [
  { key: 'example:overview', title: 'Overview', description: 'General activity', intents: ['see activity'] },
  { key: 'example:alerts', title: 'Alerts', description: 'Recent failures', intents: ['find errors'] },
];

it('bounds the Decision request to eligible metadata and rejects an invented choice', async () => {
  const picked = await chooseUiChunk(candidates, 'recent errors', 'page', async (state, questions) => {
    expect(state).toEqual({ intent: 'recent errors', surface: 'page' });
    expect(Object.keys(questions.selected_chunk.criteria)).toEqual(['example:overview', 'example:alerts', 'none']);
    return { ok: true, answers: { selected_chunk: { act: true, confidence: 0.99, choice: 'outside:private' } } };
  });
  expect(picked).toEqual({ source: 'decision', key: null, reason: 'invalid-choice' });
});

it('assembles ordered blocks and drops low-confidence secondary choices', async () => {
  const third = { key: 'example:guide', title: 'Guide', description: 'Reference', intents: ['read guidance'] };
  const picked = await chooseUiComposition([...candidates, third], 'review alerts', async (_state, questions) => {
    expect(Object.keys(questions)).toEqual(['selected_chunk', 'supporting_chunk', 'reference_chunk']);
    return { ok: true, answers: {
      selected_chunk: { act: true, confidence: 0.91, choice: 'example:alerts' },
      supporting_chunk: { act: true, confidence: 0.83, choice: 'example:overview' },
      reference_chunk: { act: true, confidence: 0.28, choice: 'example:guide' },
    } };
  });
  expect(picked.keys).toEqual(['example:alerts', 'example:overview']);
});
