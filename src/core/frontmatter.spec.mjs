import { describe, it, expect } from 'vitest';
import * as yamlModule from 'js-yaml';
import matter from './frontmatter.mjs';

const yaml = yamlModule.default || yamlModule;

describe('data-only frontmatter', () => {
  it('rejects executable metadata before any code runs', () => {
    for (const language of ['js', 'javascript']) {
      delete globalThis.__frontmatterAttack;
      expect(() => matter(`---${language}\n(globalThis.__frontmatterAttack = true, { title: 'attack' })\n---\nbody`))
        .toThrow('Executable JavaScript frontmatter is not allowed');
      expect(globalThis.__frontmatterAttack).toBeUndefined();
    }
  });
  it('keeps timestamps as strings, CRLF and body delimiters as data and rejects YAML code tags', () => {
    const parsed = matter('---\r\ncreated: 2026-10-07T00:00:00Z\r\n---\r\nbody\r\n---\r\nend');
    expect(parsed.data.created).toBe('2026-10-07T00:00:00Z');
    expect(parsed.content).toBe('body\r\n---\r\nend');
    expect(() => matter('---\nvalue: !!js/function function () {}\n---\nbody')).toThrow();
  });
  it('preserves YAML and JSON metadata and stringify round trips', () => {
    const data = { title: 'Safe', tags: ['one', 'two'], active: true };
    expect(matter(matter.stringify('body', data)).data).toEqual(data);
    expect(matter('---json\n{"title":"Safe"}\n---\nbody').data).toEqual({ title: 'Safe' });
  });

  // The wrapper reads YAML with the SSSS parser. These are the shapes real vault
  // files contain; js-yaml (the previous reader) is the oracle for every one.
  it('reads the same data as js-yaml for the shapes vault files use', () => {
    const docs = [
      'allowed-tools: [Read, Bash]\ntype: memory',
      'x_citations: [{"source":"remember-cli","title":"a, b","url":"https://e.io/?q=1"}]',
      'decay: {"half_life_days":180,"access_count":1}\nsource: {"type":"remember-cli","evidence_count":1}',
      'tags:\n- context:universal\n- security\nrelated: ["a","b, c"]',
      'description: This is long\n  and wraps # not a comment',
      'description: A long value # trailing comment',
      'related:\n  - >-\n    folded\n    text\n  - plain',
      'head:\n  - - meta\n    - http-equiv: refresh\n      content: go',
      'users:\n  a@b.com:\n    n: 1\nlast*seen: x',
      'content: >\n  one\n    two\n\n  three',
      'content: |+\n\nnext: 1',
      'title: "\\U0001F534 hot"\nn: 12\nf: 1.5\nb: true\nz: null\nzero: 0',
      'items:\n  - name: x\n    sub:\n      a: 1\n    z: 2\n  - name: y'
    ];
    for (const doc of docs) {
      expect(matter(`---\n${doc}\n---\nbody`).data, doc).toEqual(yaml.load(doc, { schema: yaml.CORE_SCHEMA }));
    }
  });
  it('keeps leading-zero codes as strings and repairs one-line files', () => {
    expect(matter('---\nzip: 07885\n---\n').data.zip).toBe('07885');
    const flat = '---\\ntype: "memory"\\ntags: ["a"]\\n---\\nbody';
    expect(matter(flat).data).toEqual({ type: 'memory', tags: ['a'] });
  });
});
