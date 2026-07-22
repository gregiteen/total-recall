import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import { createProposal, generateMemoryCleanupProposals, generateSkillImprovementProposals, generateWorkflowRepairProposals, generateModelRoutingProposals, generateStaleKnowledgeRefreshProposals, evaluateProposalGate, runSmartDecay } from './optimizer.mjs';

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
