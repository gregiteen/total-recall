import { describe, it, expect, vi, afterEach } from 'vitest';
const embedding = vi.hoisted(() => ({ value: [1, 0] }));
vi.mock('./agent-dir.mjs', () => ({
  parseLayerFlag: args => ({ layer: 'project', remainingArgs: args }),
  getBothBrains: () => ({ project: { brainDir: '/fixture/brain' } }),
}));
vi.mock('../core/vault-cache.mjs', () => ({ getNodes: () => [
  { slug: 'mail-rule', title: 'Mail', category: 'invariants', status: 'active', body: 'Verify the mailbox before declaring mail fixed.' },
  { slug: 'deploy-rule', title: 'Deploy', category: 'invariants', status: 'active', body: 'Deploy with zero downtime through the mesh.' },
  { slug: 'a-fact', title: 'Fact', category: 'facts', status: 'active', body: 'Not a rule.' },
] }));
vi.mock('../core/surface.mjs', () => ({ mergeGlobalRuleNodes: nodes => nodes, legacyRuleContributions: () => [] }));
vi.mock('../core/brain-registry.mjs', () => ({ isBrainEnabled: () => true }));
vi.mock('../core/command-surface.mjs', () => ({ surfaceInputsHash: () => 'fixture' }));
vi.mock('../core/embeddings.mjs', async importOriginal => ({
  ...(await importOriginal()),
  getEmbedding: async () => { if (!embedding.value) throw new Error('no provider'); return embedding.value; },
  loadEmbeddingsIndex: () => ({ 'mail-rule': { embedding: [0, 1] }, 'deploy-rule': { embedding: [1, 0] } }),
}));
import compact from './compact.mjs';

const originalExitCode = process.exitCode;
afterEach(() => { vi.restoreAllMocks(); process.exitCode = originalExitCode; embedding.value = [1, 0]; });
const run = async args => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  await compact(args);
  return log.mock.calls.at(-1)[0];
};

describe('compact CLI', () => {
  it('ranks rules semantically and labels the output as partial', async () => {
    const output = await run(['ship it', '--format', 'json', '--budget', '60']);
    const parsed = JSON.parse(output);
    expect(parsed.ranking).toBe('semantic');
    expect(parsed.compacted).toBe(true);
    expect(parsed.tokens).toBeLessThanOrEqual(60);
    expect(parsed.counts.rules).toBe(2);
    expect(Object.keys(parsed.tiers)).not.toContain('a-fact');
    const text = await run(['ship it']);
    expect(text.indexOf('deploy-rule')).toBeLessThan(text.indexOf('mail-rule'));
    expect(text).toMatch(/^compacted:true tokens:\d+ budget:4000 rules:2 /);
    expect(text.split('\n')[1]).toMatch(/^PARTIAL: .*--expand.*total-recall context/);
  });
  it('falls back to lexical ranking and says so', async () => {
    embedding.value = null;
    const text = await run(['verify the mailbox']);
    expect(text).toContain('ranking:lexical');
    expect(text.indexOf('mail-rule')).toBeLessThan(text.indexOf('deploy-rule'));
    expect(process.exitCode).toBe(originalExitCode);
  });
  it('exits 2 with the minimum when the budget cannot hold the header', async () => {
    const text = await run(['task', '--budget', '3']);
    expect(text).toMatch(/^compacted:false reason:budget-too-small budget:3 required_budget:\d+/);
    expect(process.exitCode).toBe(2);
  });
  it('exits 2 on an expansion that is not in the capsule', async () => {
    expect(await run(['task', '--expand', 'nope'])).toContain('nope');
    expect(process.exitCode).toBe(2);
  });
  it('rejects bad options', async () => {
    await expect(compact(['task', '--budget', 'lots'])).rejects.toThrow(/--budget/);
    await expect(compact(['task', '--nope', 'x'])).rejects.toThrow(/Unknown compact option/);
  });
  it('prints usage on --help', async () => expect(await run(['--help'])).toContain('total-recall compact'));
});
