import { describe, it, expect } from 'vitest';
import matter from './frontmatter.mjs';

describe('data-only frontmatter', () => {
  it('rejects executable metadata before any code runs', () => {
    for (const language of ['js', 'javascript']) {
      delete globalThis.__frontmatterAttack;
      expect(() => matter(`---${language}\n(globalThis.__frontmatterAttack = true, { title: 'attack' })\n---\nbody`))
        .toThrow('Executable JavaScript frontmatter is not allowed');
      expect(globalThis.__frontmatterAttack).toBeUndefined();
    }
  });
  it('keeps dates, CRLF and body delimiters as data and rejects YAML code tags', () => {
    const parsed = matter('---\r\ncreated: 2026-10-07T00:00:00Z\r\n---\r\nbody\r\n---\r\nend');
    expect(parsed.data.created.toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(parsed.content).toBe('body\r\n---\r\nend');
    expect(() => matter('---\nvalue: !!js/function function () {}\n---\nbody')).toThrow();
  });
  it('preserves YAML and JSON metadata and stringify round trips', () => {
    const data = { title: 'Safe', tags: ['one', 'two'], active: true };
    expect(matter(matter.stringify('body', data)).data).toEqual(data);
    expect(matter('---json\n{"title":"Safe"}\n---\nbody').data).toEqual({ title: 'Safe' });
  });
});
