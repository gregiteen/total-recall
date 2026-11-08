import { expect, it } from 'vitest';
import { chooseUiChunk } from './chunks.mjs';

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
