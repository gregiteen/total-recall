import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
vi.mock('./agent-dir.mjs', () => ({
  parseLayerFlag: args => ({ layer: 'project', remainingArgs: args }),
  getBothBrains: () => ({ project: { brainDir: '/fixture/brain' } }),
}));
vi.mock('../core/vault-cache.mjs', () => ({ getNodes: () => Array.from({ length: 40 }, (_, i) => ({
  slug: `rule-${i}`, category: 'invariants', status: 'active', priority: i < 5 ? 'absolute' : 'normal',
  body: `Rule ${i} must hold. ${`filler${i} `.repeat(120)}`,
})) }));
vi.mock('../core/surface.mjs', () => ({ mergeGlobalRuleNodes: nodes => nodes, legacyRuleContributions: () => [] }));
vi.mock('../core/brain-registry.mjs', () => ({ isBrainEnabled: () => true }));
vi.mock('../core/command-surface.mjs', () => ({ surfaceInputsHash: () => 'fixture' }));
vi.mock('./config.mjs', () => ({ readConfigValue: () => 20000 }));
vi.mock('../core/context-providers.mjs', () => ({ retrievePluginContext: async () => ({ candidates: [], diagnostics: [], coverage: [] }) }));
import context, { CAPSULE_LIMIT } from './context.mjs';
import { estimateTokens } from '../core/context-policy.mjs';

const originalExitCode = process.exitCode;
beforeAll(() => { process.env.TR_EMBEDDINGS_DISABLED = '1'; });
afterEach(() => { vi.restoreAllMocks(); process.exitCode = originalExitCode; });
const run = async (...args) => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  await context(args);
  return log.mock.calls.at(-1)[0];
};

describe('context automatic compaction', () => {
  it('compacts over budget and keeps every rule accounted for', async () => {
    const output = await run('rule 7', '--budget', '2000');
    expect(output).toMatch(/^ready:true compacted:true tokens:\d+ budget:2000 version:[0-9a-f]+ rules:40 /);
    expect(estimateTokens(`${output}\n`)).toBeLessThanOrEqual(2000);
    for (let i = 0; i < 5; i++) expect(output).toContain(`Rule ${i} must hold.`);
    for (let i = 0; i < 40; i++) expect(output).toContain(`rule-${i}`);
    expect(process.exitCode).toBe(originalExitCode);
  });
  it('caps a larger configured budget, and an explicit one prints the full capsule', async () => {
    expect(CAPSULE_LIMIT).toBe(7000);
    expect(await run('rule 7')).toMatch(/budget:7000 /);
    const full = await run('rule 7', '--budget', '60000');
    expect(full).toMatch(/^ready:true tokens:/);
    expect(full).not.toContain('compacted:true');
  });
  it('stays within budget in JSON and reports what it kept', async () => {
    const output = await run('rule 7', '--budget', '2000', '--format', 'json');
    const parsed = JSON.parse(output);
    expect(parsed).toMatchObject({ ready: true, compacted: true });
    expect(parsed.counts.omitted).toBe(0);
    expect(estimateTokens(`${output}\n`)).toBeLessThanOrEqual(2000);
  });
  it('exits 2 with a required budget that then succeeds', async () => {
    for (const format of ['text', 'json']) {
      const failed = await run('rule 7', '--budget', '100', '--format', format);
      expect(process.exitCode).toBe(2);
      process.exitCode = originalExitCode;
      const required = format === 'json' ? JSON.parse(failed).stats.required_budget : Number(failed.match(/required_budget:(\d+)/)[1]);
      expect(required).toBeGreaterThan(100);
      const admitted = await run('rule 7', '--budget', String(required), '--format', format);
      expect(admitted).toMatch(/ready"?:true/);
      expect(process.exitCode).toBe(originalExitCode);
    }
  });
});
