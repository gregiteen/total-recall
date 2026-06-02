import { describe, it, expect } from 'vitest';
import { replaceFirstManagedInjectionBlock, heuristicCompact, buildRulesBlock } from './surface.mjs';

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
    // Since the body starts with the title, it should not repeat it
    expect(compactedRedundant).toBe('Always use single quotes');
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
});
