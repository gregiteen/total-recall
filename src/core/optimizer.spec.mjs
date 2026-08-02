import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createProposal, generateMemoryCleanupProposals, generateSkillImprovementProposals, generateWorkflowRepairProposals, generateModelRoutingProposals, generateStaleKnowledgeRefreshProposals, evaluateProposalGate, runSmartDecay, proposalKey, loadOpenProposalKeys, dedupeProposals } from './optimizer.mjs';

describe('optimizer.mjs', () => {
  it('exports createProposal', () => {
    expect(createProposal).toBeDefined();
  });
  it('exports generateMemoryCleanupProposals', () => {
    expect(generateMemoryCleanupProposals).toBeDefined();
  });
  it('exports generateSkillImprovementProposals', () => {
    expect(generateSkillImprovementProposals).toBeDefined();
  });
  it('exports generateWorkflowRepairProposals', () => {
    expect(generateWorkflowRepairProposals).toBeDefined();
  });
  it('exports generateModelRoutingProposals', () => {
    expect(generateModelRoutingProposals).toBeDefined();
  });
  it('exports generateStaleKnowledgeRefreshProposals', () => {
    expect(generateStaleKnowledgeRefreshProposals).toBeDefined();
  });
  it('exports evaluateProposalGate', () => {
    expect(evaluateProposalGate).toBeDefined();
  });
  it('exports runSmartDecay', () => {
    expect(runSmartDecay).toBeDefined();
  });
});

describe('optimizer proposal deduplication', () => {
  function makeVault(proposals = []) {
    const vaultDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-opt-')), 'memory-vault');
    fs.mkdirSync(path.join(vaultDir, 'proposals'), { recursive: true });
    proposals.forEach((p, i) => {
      fs.writeFileSync(
        path.join(vaultDir, 'proposals', `prop_${i}.md`),
        `---\ntype: proposal\nslug: prop_${i}\ncategory: proposals\nproposal_topic: ${p.topic}\ntarget_path: ${p.target}\nstatus: ${p.status}\n---\nbody\n`,
      );
    });
    return vaultDir;
  }

  it('treats the pre-write shape (topic in category) and the on-disk shape (topic in proposal_topic) as the same key', () => {
    const fresh = createProposal('stale-knowledge-refresh', 'summary', 'node-a', 'why');
    const persisted = { category: 'proposals', proposal_topic: 'stale-knowledge-refresh', target_path: 'node-a' };
    expect(proposalKey(fresh)).toBe(proposalKey(persisted));
  });

  it('distinguishes different targets and different topics', () => {
    expect(proposalKey({ category: 'a', target_path: 'x' })).not.toBe(proposalKey({ category: 'a', target_path: 'y' }));
    expect(proposalKey({ category: 'a', target_path: 'x' })).not.toBe(proposalKey({ category: 'b', target_path: 'x' }));
  });

  it('reads open proposals from disk — NOT via getNodes, which returns only type:memory', () => {
    // Regression: the first version of this gate used getNodes(), which never
    // returns proposals, so it always saw zero and suppressed nothing.
    const vaultDir = makeVault([{ topic: 'stale-knowledge-refresh', target: 'node-a', status: 'accepted' }]);
    expect(loadOpenProposalKeys(vaultDir).size).toBe(1);
  });

  it('counts accepted proposals as open, since nothing applies them', () => {
    const vaultDir = makeVault([{ topic: 't', target: 'node-a', status: 'accepted' }]);
    const { kept, suppressed } = dedupeProposals([createProposal('t', 's', 'node-a', 'r')], vaultDir);
    expect(kept).toHaveLength(0);
    expect(suppressed).toBe(1);
  });

  it('does NOT re-file a proposal the gate already rejected', () => {
    // The generators are pure functions of vault state, so a rejected proposal is
    // regenerated every cycle. Treating `rejected` as re-filable leaked 5 new
    // files per dream cycle, forever — a slower version of the original runaway.
    const vaultDir = makeVault([{ topic: 't', target: 'node-a', status: 'rejected' }]);
    expect(dedupeProposals([createProposal('t', 's', 'node-a', 'r')], vaultDir).kept).toHaveLength(0);
  });

  it('does NOT re-file an already-applied proposal', () => {
    const vaultDir = makeVault([{ topic: 't', target: 'node-a', status: 'applied' }]);
    expect(dedupeProposals([createProposal('t', 's', 'node-a', 'r')], vaultDir).kept).toHaveLength(0);
  });

  it('DOES re-file a superseded proposal — the world changed, not the answer', () => {
    const vaultDir = makeVault([{ topic: 't', target: 'node-a', status: 'superseded' }]);
    expect(dedupeProposals([createProposal('t', 's', 'node-a', 'r')], vaultDir).kept).toHaveLength(1);
  });

  it('dedupes within a single batch, not just against disk', () => {
    const vaultDir = makeVault([]);
    const dup = [createProposal('t', 's', 'node-a', 'r'), createProposal('t', 's', 'node-a', 'r')];
    expect(dedupeProposals(dup, vaultDir).kept).toHaveLength(1);
  });

  it('stays bounded when the same stale nodes are re-proposed every cycle', () => {
    // The actual runaway: generators are pure functions of vault state, so each
    // cycle yields identical proposals. Global reached 16,309 files for 594
    // targets. Simulate 10 cycles; disk must not grow past the first.
    const vaultDir = makeVault([]);
    let written = 0;
    for (let cycle = 0; cycle < 10; cycle++) {
      const batch = ['node-a', 'node-b', 'node-c'].map(t => createProposal('stale-knowledge-refresh', 's', t, 'r'));
      const { kept } = dedupeProposals(batch, vaultDir);
      kept.forEach((p) => {
        fs.writeFileSync(
          path.join(vaultDir, 'proposals', `${p.slug}.md`),
          `---\ntype: proposal\nslug: ${p.slug}\ncategory: proposals\nproposal_topic: ${p.category}\ntarget_path: ${p.target_path}\nstatus: accepted\n---\nbody\n`,
        );
        written++;
      });
    }
    expect(written).toBe(3);
    expect(fs.readdirSync(path.join(vaultDir, 'proposals'))).toHaveLength(3);
  });
});
