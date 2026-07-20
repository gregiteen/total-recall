import { describe, it, expect } from 'vitest';
import {
  defaultTitleFromBody,
  normalizeMemoryTitle,
  stripSelfCapturedTitlePrefix,
  isSelfCapturedEchoTitle,
} from './memory-title.mjs';

describe('memory-title', () => {
  it('strips legacy prefix', () => {
    expect(stripSelfCapturedTitlePrefix('Self-captured memory: Never run tsc.')).toBe(
      'Never run tsc.',
    );
  });

  it('builds title from first sentence without prefix', () => {
    const t = defaultTitleFromBody(
      'Never run tsc directly. Always use the code-quality scripts instead.',
    );
    expect(t).toBe('Never run tsc directly.');
    expect(t).not.toMatch(/Self-captured/i);
  });

  it('detects echo titles', () => {
    const body = 'If a task is deemed unnecessary, delete it entirely instead of moving it.';
    expect(
      isSelfCapturedEchoTitle(
        'Self-captured memory: If a task is deemed unnecessary, delete it entirel...',
        body,
      ),
    ).toBe(true);
  });

  it('normalizes legacy titles to clean first sentence', () => {
    const body =
      'If a task is deemed unnecessary, delete it entirely instead of moving it to the deferred backlog.';
    const n = normalizeMemoryTitle(
      'Self-captured memory: If a task is deemed unnecessary, delete it entirel...',
      body,
    );
    expect(n).toBe(
      'If a task is deemed unnecessary, delete it entirely instead of moving it to the deferred backlog.',
    );
    expect(n).not.toMatch(/Self-captured/i);
  });
});
