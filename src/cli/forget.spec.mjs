import { describe, it, expect, vi, afterEach } from 'vitest';
const remove = vi.hoisted(() => vi.fn());
vi.mock('../core/ssss-operation-service.mjs', () => ({ deleteVfsDocument: remove }));
import forget from './forget.mjs';

afterEach(() => { vi.restoreAllMocks(); remove.mockClear(); });

describe('forget.mjs', () => {
  it('exports default', () => {
    expect(forget).toBeDefined();
  });
  it.each(['--help', '-h'])('prints help and deletes nothing for a slug followed by %s', async flag => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await forget(['some-slug', flag]);
    expect(log.mock.calls.flat().join('\n')).toContain('Delete a memory node by slug');
    expect(remove).not.toHaveBeenCalled();
  });
});
