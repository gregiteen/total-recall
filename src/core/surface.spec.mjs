import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import { replaceFirstManagedInjectionBlock, heuristicCompact, buildRulesBlock, extractWikilinks, mergeGlobalRuleNodes } from './surface.mjs';

describe('Surface Routing Accuracy', () => {

  it('does not replace injected-memory examples inside fenced code blocks', () => {
    const raw = [
      '# Skill',
      '<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->',
      'old live block',
      '<!-- END INJECTED MEMORY -->',
      '',
      '```markdown',
      '<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->',
      'example block',
      '<!-- END INJECTED MEMORY -->',
      '```',
      ''
    ].join('\n');

    const updated = replaceFirstManagedInjectionBlock(raw, 'new live block');

    expect(updated).toContain('new live block');
    expect(updated).toContain('example block');
  });

  it('heuristically compacts nodes to be within 180 characters and non-redundant', () => {
    const node = {
      title: 'Never run tsc directly',
      body: 'Always use the start-here script that handles environment variables and configures paths correctly.'
    };
    const compacted = heuristicCompact(node);
    expect(compacted).toBe('Never run tsc directly — Always use the start-here script that handles environment variables and configures paths correctly.');
    expect(compacted.length).toBeLessThanOrEqual(180);

    const redundantNode = {
      title: 'Always use single quotes',
      body: 'Always use single quotes in JavaScript files to maintain consistency across the codebase.'
    };
    const compactedRedundant = heuristicCompact(redundantNode);
    // Since the body starts with the title, titleIsEcho fires and uses body directly (more info for agents)
    expect(compactedRedundant).toBe('Always use single quotes in JavaScript files to maintain consistency across the codebase.');

    // Categorized nodes get modality markers
    const invariantNode = {
      title: 'Never run tsc',
      body: 'Use start-here scripts.',
      category: 'invariants',
      modality: 'must'
    };
    const compactedInvariant = heuristicCompact(invariantNode);
    expect(compactedInvariant).toBe('[MUST] Never run tsc: Use start-here scripts.');
  });

  it('compiles only invariants, preferences, and anti-patterns (category partitioning)', async () => {
    const nodes = [
      { slug: 'rule1', category: 'invariants', title: 'Always run tests', body: 'Must run tests.', status: 'active' },
      { slug: 'rule2', category: 'preferences', title: 'Single quotes', body: 'Use single quotes.', status: 'active' },
      { slug: 'rule3', category: 'anti-patterns', title: 'No global variables', body: 'Avoid globals.', status: 'active' },
      { slug: 'fact1', category: 'facts', title: 'Server port', body: 'Port is 3000.', status: 'active' }
    ];

    const block = await buildRulesBlock(null, nodes);
    expect(block).toContain('Always run tests');
    expect(block).toContain('Single quotes');
    expect(block).toContain('No global variables');
    expect(block).not.toContain('Server port'); // facts should be excluded (category partitioning)
  });

  describe('extractWikilinks', () => {
    it('extracts standard wikilinks correctly', () => {
      const body = 'Check out [[some-slug]] and [[another-slug|with alias]].';
      const links = extractWikilinks(body);
      expect(links).toEqual(['some-slug', 'another-slug']);
    });

    it('extracts relative Markdown link targets and excludes absolute URLs', () => {
      const body = 'See [also](./patterns/atomic-writes.md) or visit [Google](https://google.com).';
      const links = extractWikilinks(body);
      expect(links).toEqual(['atomic-writes']);
    });

    it('returns empty array when no links are present', () => {
      const body = 'Plain text without any links.';
      const links = extractWikilinks(body);
      expect(links).toEqual([]);
    });
  });
});

describe('mergeGlobalRuleNodes', () => {
  const rule = (slug, category, body = slug) => ({ slug, category, status: 'active', importance: 5, title: slug, body });

  it('adds global rules to a project that lacks them', () => {
    const merged = mergeGlobalRuleNodes([rule('own', 'invariants')], [rule('shared', 'anti-patterns')]);
    expect(merged.map((n) => n.slug)).toEqual(['own', 'shared']);
    expect(merged[1]._layer).toBe('global');
  });

  it('lets a project node override a global rule with the same slug', () => {
    const merged = mergeGlobalRuleNodes([rule('same', 'invariants', 'project wording')], [rule('same', 'invariants', 'global wording')]);
    expect(merged).toHaveLength(1);
    expect(merged[0].body).toBe('project wording');
  });

  it('keeps global facts and concepts out of the surfaces', () => {
    const merged = mergeGlobalRuleNodes([], [rule('a-fact', 'facts'), rule('a-pref', 'preferences')]);
    expect(merged.map((n) => n.slug)).toEqual(['a-pref']);
  });

  it('does not mutate the cached global nodes', () => {
    const globalNode = rule('shared', 'invariants');
    mergeGlobalRuleNodes([], [globalNode]);
    expect(globalNode._layer).toBeUndefined();
  });

  it('renders an inherited global rule in the project rules block', async () => {
    const merged = mergeGlobalRuleNodes([], [{ ...rule('global-rule', 'anti-patterns'), title: 'Global correction', modality: 'must' }]);
    const block = await buildRulesBlock(null, merged);
    expect(block).toContain('1 corrections');
    expect(block).toContain('Global correction');
  });
});
