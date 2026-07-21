import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseArgs } from './update.mjs';

describe('update CLI', () => {
  it('parseArgs defaults', () => {
    expect(parseArgs([])).toEqual({
      apply: false,
      force: false,
      dryRun: false,
      help: false,
      repos: [],
    });
  });

  it('parseArgs apply/force/repo/help', () => {
    const o = parseArgs(['--apply', '--force', '--repo', '/tmp/app', '--help']);
    expect(o.apply).toBe(true);
    expect(o.force).toBe(true);
    expect(o.repos).toEqual(['/tmp/app']);
    expect(o.help).toBe(true);
  });

  it('parseArgs --install alias and dry-run', () => {
    const o = parseArgs(['--install', '--dry-run', '--repo', '/a', '--repo', '/b']);
    expect(o.apply).toBe(true);
    expect(o.dryRun).toBe(true);
    expect(o.repos).toEqual(['/a', '/b']);
  });

  it('default export is a function', async () => {
    const mod = await import('./update.mjs');
    expect(typeof mod.default).toBe('function');
  });
});
