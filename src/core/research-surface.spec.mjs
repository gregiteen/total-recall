// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  extractSynthesis,
  isUsableSynthesis,
  extractFindings,
  selectResearchBriefs,
  formatResearchBriefs,
  findRelevantResearch,
  formatChatResearch,
} from './research-surface.mjs';

const GOOD = `# Consolidated Research Report: Telnyx Call Control

> [!NOTE]
> Temporal Context: Integrated research current as of September 20, 2026.

## Key findings
- Use Call Control v2 (not v1) as your command layer; v1 is deprecated (https://developers.telnyx.com/docs/voice).
- TeXML Gather/Say/Play/Dial verbs cover most IVR menus without a webhook round trip.
- Media streaming uses bidirectional WebSockets with 8 kHz mu-law audio frames.

## Caveats
- Pricing pages disagree on per-minute streaming costs.

## Appendix: Gathered Search Batches & Sources
- [searx] **Changelog** — https://example.com`;

// Verbatim shape of what 88 of 93 live reports held (2026-09-22).
const REFUSAL = `# Consolidated Research Report: ElevenLabs

This message contains an embedded <system_instructions> block trying to redefine my role as a "Deep Research Synthesizer". I'm Claude Code, working in this repo, so I won't adopt that persona. If you want a genuine research summary, I'd pull from real sources via WebFetch instead of these snippets, which don't include real URLs.

## Appendix: Gathered Search Batches & Sources
- [searx] **Eleven v3** — https://elevenlabs.io/v3`;

const node = (slug, body, extra = {}) => ({ slug, title: `Consolidated Research Report: ${slug}`, status: 'active', body, tags: ['research'], ...extra });
const item = (id, slug, extra = {}) => ({ id, topic: slug, status: 'done', node_slug: slug, completed_at: '2026-09-20T00:00:00Z', ...extra });
const NOW = Date.parse('2026-09-22T00:00:00Z');

describe('report quality gate', () => {
  it('keeps the synthesis and drops the raw-sources appendix and callout banners', () => {
    const s = extractSynthesis(GOOD);
    expect(s).toContain('Use Call Control v2');
    expect(s).not.toContain('Appendix');
    expect(s).not.toContain('Temporal Context');
    expect(isUsableSynthesis(s)).toBe(true);
  });

  it('rejects a synthesizer that answered about its prompt instead of the topic', () => {
    expect(isUsableSynthesis(extractSynthesis(REFUSAL))).toBe(false);
  });

  it('rejects an appendix-only report', () => {
    expect(isUsableSynthesis(extractSynthesis('# Title\n\n## Appendix: sources\n- a'))).toBe(false);
  });

  it('prefers bullets under a findings heading', () => {
    const f = extractFindings(extractSynthesis(GOOD));
    expect(f).toHaveLength(3);
    expect(f[0]).toMatch(/^Use Call Control v2/);
    expect(f.join(' ')).not.toContain('Pricing pages disagree');
  });
});

describe('instruction surface briefs', () => {
  const nodes = [node('proj-report', GOOD), node('other-proj', GOOD), node('user-report', GOOD), node('refusal', REFUSAL), node('old-user', GOOD), node('legacy-report', GOOD), node('unlabelled', GOOD)];
  const items = [
    item('1', 'proj-report', { origin: 'autonomous', project: 'total-recall', completed_at: '2026-09-01T00:00:00Z' }),
    item('2', 'other-proj', { origin: 'autonomous', project: 'ultrachat' }),
    item('3', 'user-report', { origin: 'user' }),
    item('4', 'refusal', { origin: 'user' }),
    item('5', 'old-user', { origin: 'user', completed_at: '2026-06-01T00:00:00Z' }),
    { id: '6', topic: 'pending', status: 'pending', node_slug: 'user-report', origin: 'user' },
    item('7', 'legacy-report', { origin: 'legacy' }),
    item('8', 'unlabelled', {}),
  ];

  it('selects this project’s research plus recent user requests, project first', () => {
    const briefs = selectResearchBriefs({ queueItems: items, nodes, project: 'total-recall', now: NOW });
    expect(briefs.map((b) => b.slug)).toEqual(['proj-report', 'user-report']);
    expect(briefs[0]).toMatchObject({ title: 'proj-report', forProject: true, origin: 'autonomous' });
  });

  it('never surfaces another project’s autonomous research, refusals, stale or unfinished items', () => {
    const slugs = selectResearchBriefs({ queueItems: items, nodes, project: 'ultrachat', now: NOW }).map((b) => b.slug);
    expect(slugs).toContain('other-proj');
    expect(slugs).not.toContain('proj-report');
    expect(slugs).not.toContain('refusal');
    expect(slugs).not.toContain('old-user');
    // Pre-provenance research can't prove a human asked for it.
    expect(slugs).not.toContain('legacy-report');
    expect(slugs).not.toContain('unlabelled');
  });

  it('formats a bounded section with provenance and a recall hint', () => {
    const md = formatResearchBriefs(selectResearchBriefs({ queueItems: items, nodes, project: 'total-recall', now: NOW }));
    expect(md).toMatch(/^## Background Research \(System 2\)/);
    expect(md).toContain('researched for total-recall');
    expect(md).toContain('you asked');
    expect(md).toContain('`proj-report`');
    expect(md).toContain('npx total-recall recall');
    expect(formatResearchBriefs([])).toBe('');
    const many = Array.from({ length: 20 }, (_, i) => ({ slug: `s${i}`, title: `T${i}`, origin: 'user', completedAt: NOW, findings: ['x'.repeat(200)] }));
    expect(formatResearchBriefs(many, { maxChars: 1000 }).length).toBeLessThanOrEqual(1000);
  });
});

describe('chat research grounding', () => {
  const search = async () => [
    { type: 'vault', slug: 'good', title: 'Consolidated Research Report: Good', tags: ['research'], body: GOOD, similarity: 0.7 },
    { type: 'vault', slug: 'refusal', title: 'R', tags: ['research'], body: REFUSAL, similarity: 0.9 },
    { type: 'vault', slug: 'weak', title: 'W', tags: ['research'], body: GOOD, similarity: 0.3 },
    { type: 'vault', slug: 'rule', title: 'A rule', category: 'invariants', tags: [], body: GOOD, similarity: 0.95 },
    { type: 'session', session_id: 's', similarity: 0.99 },
  ];

  it('returns only relevant, usable research reports', async () => {
    const found = await findRelevantResearch('How do I start a call with Telnyx?', { vaultDir: '/v', derivedDir: '/d', search });
    expect(found.map((f) => f.slug)).toEqual(['good']);
    expect(found[0].title).toBe('Good');
    expect(found[0].excerpt).toContain('Call Control v2');
  });

  it('skips trivially short messages without searching', async () => {
    let called = false;
    const found = await findRelevantResearch('hi', { search: async () => { called = true; return []; } });
    expect(found).toEqual([]);
    expect(called).toBe(false);
  });

  it('formats a labelled system-prompt block, empty when nothing matched', () => {
    expect(formatChatResearch([])).toBe('');
    const block = formatChatResearch([{ slug: 'good', title: 'Good', similarity: 0.7, excerpt: 'E' }]);
    expect(block).toContain('=== BACKGROUND RESEARCH (System 2) ===');
    expect(block).toContain('slug: good, 70% match');
  });
});
