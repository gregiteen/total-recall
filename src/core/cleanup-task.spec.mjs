import { it, expect, vi } from 'vitest';
import { fileCleanupProposals } from './cleanup-task.mjs';
it('dedupes cleanup proposals, runs the existing gate and counts only persisted proposals', async () => {
  const proposal = { category: 'memory-cleanup', target_path: 'a,b' };
  const write = vi.fn(async () => {}), gate = vi.fn(async () => false);
  const result = await fileCleanupProposals('/vault', { generate: async () => [proposal, proposal],
    dedupe: () => ({ kept: [proposal], suppressed: 1 }), gate, write });
  expect(result).toMatchObject({ persisted: 1, suppressed: 1 });
  expect(gate).toHaveBeenCalledWith(proposal, null, '/vault');
  expect(write).toHaveBeenCalledWith(proposal, '/vault');
  write.mockRejectedValue(new Error('write refused'));
  await expect(fileCleanupProposals('/vault', { generate: async () => [proposal], dedupe: p => ({ kept: p, suppressed: 0 }), gate, write })).rejects.toThrow('write refused');
});
