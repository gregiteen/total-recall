// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

// Load it the way Chrome does: a classic script that attaches to `self`.
const sandbox = { URL };
sandbox.self = sandbox;
vm.runInNewContext(fs.readFileSync(new URL('./ui-helpers.js', import.meta.url), 'utf8'), sandbox);
const ui = sandbox.TRUi;

describe('escapeHtml / renderMarkdown', () => {
  it('escapes every HTML-significant character', () => {
    expect(ui.escapeHtml(`<img src=x onerror="alert('1')">&`)).toBe('&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;');
  });

  it('never lets raw HTML through', () => {
    const html = ui.renderMarkdown('hi <script>alert(1)</script> **b** <img src=x onerror=alert(1)>');
    expect(html).not.toMatch(/<script|<img/);
    expect(html).toContain('<strong>b</strong>');
  });

  it('only links http(s) targets', () => {
    expect(ui.renderMarkdown('[ok](https://example.com/a?b=1&c=2)')).toContain('<a href="https://example.com/a?b=1&amp;c=2"');
    const bad = ui.renderMarkdown('[bad](javascript:alert(1))');
    expect(bad).not.toContain('<a');
    expect(bad).toContain('bad');
  });

  it('renders code fences, lists and headings', () => {
    const html = ui.renderMarkdown('# Title\n\n- one\n- two\n\n1. a\n2. b\n\n```js\nconst x = "<b>";\n```');
    expect(html).toContain('<p class="md-heading">Title</p>');
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(html).toContain('<ol><li>a</li><li>b</li></ol>');
    expect(html).toContain('<pre><code>const x = &quot;&lt;b&gt;&quot;;</code></pre>');
  });
});

describe('filterRelated', () => {
  const results = [
    { type: 'session', session_id: 's', score: 0.9 },
    { type: 'vault', slug: 'noise', title: 'Unrelated', body: 'x', score: 0.49, similarity: 0.41 },
    { type: 'vault', slug: 'close', title: 'Close', content: '**Deploy** notes', score: 0.48, similarity: 0.7, category: 'facts' },
    { type: 'vault', slug: 'agree', title: 'Agree', body: 'y', score: 0.8 },
    { type: 'vault', slug: 'lexical-fluke', title: 'Fluke', body: 'z', score: 0.93, similarity: 0.38 },
    { type: 'vault', slug: 'self', title: 'This page', body: 'Source: https://a.test/p', score: 0.9, similarity: 0.9 },
  ];

  it('drops sessions, rank-only noise, lexical flukes and memories of the page itself', () => {
    const out = ui.filterRelated(results, { excludeUrl: 'https://a.test/p' });
    expect(out.map(r => r.slug)).toEqual(['close', 'agree']);
    expect(out[0]).toMatchObject({ title: 'Close', excerpt: 'Deploy notes', category: 'facts', similarity: 0.7 });
  });

  it('tolerates junk input', () => {
    expect(ui.filterRelated(undefined)).toEqual([]);
  });
});

describe('capture helpers', () => {
  it('quotes the selection and cites the source', () => {
    const body = ui.buildCaptureExcerpt({ url: 'https://a.test', selection: 'line one\nline two', note: 'why' });
    expect(body).toBe('why\n\n> line one\n> line two\n\nSource: https://a.test');
  });

  it('falls back to description plus leading text, clipped', () => {
    const text = 'Sentence one is here. '.repeat(200);
    const body = ui.buildCaptureExcerpt({ url: 'https://a.test', description: 'A page about things', text });
    expect(body.startsWith('A page about things\n\nSentence one')).toBe(true);
    expect(body.length).toBeLessThan(2000);
    expect(body.endsWith('Source: https://a.test')).toBe(true);
  });

  it('isBlocked matches hosts and subdomains, not substrings', () => {
    expect(ui.isBlocked('https://mail.google.com/x', ['google.com'])).toBe(true);
    expect(ui.isBlocked('https://notgoogle.com/', ['google.com'])).toBe(false);
    expect(ui.isBlocked('https://bank.example/', ['https://bank.example/login'])).toBe(true);
    expect(ui.isBlocked('https://example.com/', ['co'])).toBe(false);
  });

  it('isCapturableUrl accepts only web pages', () => {
    expect(ui.isCapturableUrl('https://x.y')).toBe(true);
    expect(ui.isCapturableUrl('chrome://extensions')).toBe(false);
    expect(ui.isCapturableUrl('file:///etc/hosts')).toBe(false);
  });

  it('timeAgo buckets', () => {
    const now = Date.parse('2026-09-22T12:00:00Z');
    expect(ui.timeAgo('2026-09-22T11:59:50Z', now)).toBe('just now');
    expect(ui.timeAgo('2026-09-22T11:30:00Z', now)).toBe('30m ago');
    expect(ui.timeAgo('2026-09-21T12:00:00Z', now)).toBe('1d ago');
    expect(ui.timeAgo('nonsense', now)).toBe('');
  });
});
