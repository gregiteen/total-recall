import { describe, it, expect, vi } from 'vitest';
import { run } from './index.mjs';

describe('index.mjs', () => {
  it('exports run function', () => {
    expect(run).toBeDefined();
    expect(typeof run).toBe('function');
  });
  it('prints refresh help without running the instruction compiler', async () => {
    const store = await import('../../core/plugin-store.mjs');
    const compile = vi.spyOn(store, 'recompileAfterPluginMutation');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await run(['refresh', '--help']);
      expect(log).toHaveBeenCalledWith('Usage: total-recall plugin refresh [--global]');
      expect(compile).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      compile.mockRestore();
    }
  });
});
