// @vitest-environment node
/**
 * The dangerous mistake this guards against is treating a name collision as
 * drift. A store entry is bound to one repo; when another product's .env uses
 * the same variable name for its own account, "fixing the drift" by exporting
 * overwrites a live credential with a different product's. Those two cases must
 * never collapse into one number.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { classify, isPlaceholderValue, repoOfEnvFile } from './secrets-env-diff.mjs';

describe('isPlaceholderValue', () => {
  it('recognises template values', () => {
    for (const v of ['your_key_here', 'YOUR-API-KEY', 'changeme', 'xxxx', 'TODO',
      'sk-your-key', '<paste>', 'PUT_KEY_HERE', '']) {
      expect(isPlaceholderValue(v), v).toBe(true);
    }
  });

  it('does not flag real credentials', () => {
    for (const v of ['sk-ant-abc123', 'BSACxyz', 'rk_live_51abc', 'dop_v1_9f']) {
      expect(isPlaceholderValue(v), v).toBe(false);
    }
  });
});

describe('classify', () => {
  it('matches identical values', () => {
    expect(classify('abc', 'abc', true)).toBe('match');
  });

  it('reports a differing value as drift', () => {
    expect(classify('abc', 'xyz', true)).toBe('drift');
  });

  it('reports a key the store lacks as only_env', () => {
    expect(classify('abc', undefined, false)).toBe('only_env');
  });

  it('screens placeholders before anything else', () => {
    expect(classify('your_key_here', 'real', true)).toBe('placeholder');
  });
});

describe('repoOfEnvFile', () => {
  it('names the product repo, not a nested app directory', () => {
    const base = path.join(path.sep, 'Users', 'x', 'Github');
    expect(repoOfEnvFile(path.join(base, 'ultrachat-ai-powered', '.env')))
      .toBe('ultrachat-ai-powered');
    expect(repoOfEnvFile(path.join(base, 'ultrachat-ai-powered', 'server', '.env')))
      .toBe('ultrachat-ai-powered');
  });
});
