import { describe, it, expect } from 'vitest';
import { replaceFirstManagedInjectionBlock, routeNodesToSkills } from './surface.mjs';

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
});
