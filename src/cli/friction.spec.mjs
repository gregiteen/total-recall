import { describe, it, expect, vi } from 'vitest';
import runFriction from './friction.mjs';

describe('friction', () => {
  it('prints help instead of reading --help as a log file', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runFriction(['--help']);
      const printed = log.mock.calls.flat().join('\n');
      expect(printed).toContain('log-file');
      expect(printed).not.toContain('Analyzing logs');
    } finally { log.mockRestore(); }
  });
});
