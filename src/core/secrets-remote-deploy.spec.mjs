import { describe, it, expect } from 'vitest';
import { resolveRemoteTargetsPath } from './secrets-remote-deploy.mjs';

describe('secrets-remote-deploy', () => {
  it('resolves remote targets path from brainDir', () => {
    const brainDir = '/mock/brain';
    const result = resolveRemoteTargetsPath(brainDir);
    expect(result).toMatch(/remote-targets\.json$/);
  });
});
