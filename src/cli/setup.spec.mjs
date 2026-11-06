import { describe, it, expect, vi } from 'vitest';
import setup from './setup.mjs';

describe('setup.mjs', () => {
  it('exports default', () => {
    expect(setup).toBeDefined();
  });

  it('prints help instead of starting the wizard', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await setup(['--help']);
      const printed = log.mock.calls.flat().join('\n');
      expect(printed).toContain('--dry-run');
      expect(printed).not.toContain('Where do you want to run');
    } finally { log.mockRestore(); }
  });
});
