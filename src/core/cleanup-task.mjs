import { generateMemoryCleanupProposals, dedupeProposals, evaluateProposalGate } from './optimizer.mjs';
import { writeNode } from './vault.mjs';

/** Compaction uses the same gate, identity and review path as dream cleanup. */
export async function fileCleanupProposals(vaultDir, { generate = generateMemoryCleanupProposals,
  dedupe = dedupeProposals, gate = evaluateProposalGate, write = writeNode } = {}) {
  const { kept, suppressed } = dedupe(await generate(vaultDir), vaultDir);
  let persisted = 0;
  for (const proposal of kept) {
    await gate(proposal, null, vaultDir);
    await write(proposal, vaultDir);
    persisted++;
  }
  return { success: true, persisted, suppressed, output: `Compaction filed ${persisted} cleanup proposals`, executor: 'compaction' };
}
