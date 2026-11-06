import { describe, it, expect, vi } from 'vitest';
import runChat from './chat.mjs';

describe('chat.mjs', () => {
  it('exports default', () => {
    expect(runChat).toBeDefined();
  });

  it('prints help instead of starting a conversation', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runChat(['--help']);
      const printed = log.mock.calls.flat().join('\n');
      expect(printed).toContain('total-recall chat');
      expect(printed).not.toContain('initialized');
    } finally { log.mockRestore(); }
  });
});
