import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('./agent-dir.mjs', () => ({
  parseLayerFlag: args => ({ layer: 'project', remainingArgs: args }),
  getBothBrains: () => ({ project: { brainDir: '/fixture/brain' } }),
}));
vi.mock('../core/vault-cache.mjs', () => ({ getNodes: () => [
  { slug: 'required', category: 'invariants', status: 'active', body: 'Preserve records.' },
  { slug: 'manual', category: 'facts', status: 'active', body: 'deployment '.repeat(500) },
] }));
vi.mock('../core/surface.mjs', () => ({ mergeGlobalRuleNodes: nodes => nodes, legacyRuleContributions: () => [] }));
vi.mock('../core/brain-registry.mjs', () => ({ isBrainEnabled: () => true }));
vi.mock('../core/command-surface.mjs', () => ({ surfaceInputsHash: () => 'fixture' }));
import context from './context.mjs';
const originalExitCode = process.exitCode;
afterEach(() => { vi.restoreAllMocks(); process.exitCode = originalExitCode; });
describe('context CLI', () => {
  it('emits only a budget diagnostic on failure, then all required instructions after explicit retry', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await context(['deployment', '--format', 'json', '--budget', '2']);
    const failed = JSON.parse(log.mock.calls.at(-1)[0]);
    expect(failed).toMatchObject({ ready: false, reason: 'budget-overflow', context: '' });
    expect(failed.stats.required_budget).toBeGreaterThan(2);
    expect(JSON.stringify(failed)).not.toContain('Preserve records.');
    expect(process.exitCode).toBe(2);
    process.exitCode = originalExitCode;
    await context(['deployment', '--format', 'json', '--budget', String(failed.stats.required_budget)]);
    const admitted = JSON.parse(log.mock.calls.at(-1)[0]);
    expect(admitted.ready).toBe(true);
    expect(admitted.context).toContain('Preserve records.');
    expect(process.exitCode).toBe(originalExitCode);
  });
  it('keeps default failed text bounded without emitting rule bodies', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await context(['deployment', '--budget', '2']);
    const text = log.mock.calls.at(-1)[0];
    expect(text).toMatch(/^ready:false reason:budget-overflow/);
    expect(text).toContain('required_budget:');
    expect(text).not.toContain('Preserve records.');
    expect(text.length).toBeLessThan(512);
  });
  it('provides a local action capsule entrypoint', () => expect(typeof context).toBe('function'));
  it('defaults to rules-only text and accounts for everything printed', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await context(['deployment', '--action', 'read']);
    const output = log.mock.calls.at(-1)[0];
    expect(output).toMatch(/^ready:true tokens:\d+ version:/);
    expect(output).toContain('Preserve records.');
    expect(output).not.toContain('manual');
    expect(Number(output.match(/tokens:(\d+)/)[1])).toBe(Math.ceil((output.length + 1) / 4));
  });
  it('accepts boolean flags without consuming the following option and preserves overflow', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await context(['deployment', '--knowledge', '--format', 'json', '--debug', '--action', 'read', '--budget', '2']);
    const output = JSON.parse(log.mock.calls.at(-1)[0]);
    expect(output.ready).toBe(false);
    expect(output.context).toContain('Preserve records.');
    expect(output.stats.curation_sources).toHaveLength(1);
    expect(process.exitCode).toBe(2);
  });
});
