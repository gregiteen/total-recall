import { describe, it, expect } from 'vitest';
import { replaceFirstManagedInjectionBlock, routeNodesToSkills } from './surface.mjs';

describe('Surface Routing Accuracy', () => {
  it('routes node to correctly matching skill based on TF-IDF', () => {
    const nodes = [
      {
        slug: 'node-1',
        title: 'How to use React hooks',
        tags: ['react', 'frontend'],
        body: 'Use useEffect for side effects and useState for state management.',
        status: 'active'
      }
    ];
    
    const skills = [
      {
        name: 'frontend-expert',
        description: 'React, Vue, and frontend state management.',
        body: 'React components use state management. hooks are good. useEffect.'
      },
      {
        name: 'backend-expert',
        description: 'Database, SQL, and API creation.',
        body: 'Postgres SQL queries, REST APIs, JSON parsing.'
      }
    ];

    const routes = routeNodesToSkills(nodes, skills);
    expect(routes.length).toBeGreaterThan(0);
    // Even if Z-normalization makes it close to 0, it should be above ROUTING_THRESHOLD?
    // Let's just expect frontend-expert to be selected
    expect(routes[0].skill).toBe('frontend-expert');
  });

  it('filters out inactive nodes', () => {
    const nodes = [
      {
        slug: 'node-1',
        title: 'How to use React hooks',
        tags: ['react', 'frontend'],
        body: 'Use useEffect for side effects and useState for state management.',
        status: 'deprecated'
      }
    ];
    const skills = [
      {
        name: 'frontend-expert',
        description: 'React, Vue, and frontend state management.',
        body: 'React components use state management. hooks are good. useEffect.'
      }
    ];
    const routes = routeNodesToSkills(nodes, skills);
    expect(routes.length).toBe(0);
  });

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
});
