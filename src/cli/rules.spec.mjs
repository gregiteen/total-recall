import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ruleFingerprint } from '../core/context-policy.mjs';

const nodes = [
  { slug: 'long-rule', category: 'invariants', status: 'active', body: 'Never deploy on Fridays. '.repeat(40), _layer: 'project' },
  { slug: 'short-rule', category: 'preferences', status: 'active', body: 'Keep copy plain.', _layer: 'project' },
  { slug: 'dup-rule', category: 'preferences', status: 'active', body: 'Keep copy plain.', _layer: 'project' },
];
const writes = [];
vi.mock('./agent-dir.mjs', () => ({ getBothBrains: () => ({ project: { brainDir: '/fixture/brain' } }) }));
vi.mock('../core/vault-cache.mjs', () => ({ getNodes: () => nodes }));
vi.mock('../core/surface.mjs', () => ({ mergeGlobalRuleNodes: n => n }));
vi.mock('../core/brain-registry.mjs', () => ({ isBrainEnabled: () => true }));
vi.mock('./remember.mjs', () => ({ default: async args => { writes.push(['remember', args]); } }));
vi.mock('./edit.mjs', () => ({ default: async args => { writes.push(['edit', args]); } }));
import rules, { validatePolicyFile } from './rules.mjs';

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rules-')), 'p.json');
afterEach(() => { vi.restoreAllMocks(); writes.length = 0; process.exitCode = undefined; });

describe('rules CLI', () => {
  it('drafts a scaffold with every rule, largest first, keeping the original text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = tmp();
    await rules(['draft', '--out', out]);
    const draft = JSON.parse(fs.readFileSync(out, 'utf8')).rules;
    expect(Object.keys(draft)[0]).toBe('project:long-rule');
    expect(draft['project:long-rule'].source_hash).toBe(ruleFingerprint(nodes[0]));
    expect(draft['project:long-rule'].directive).toContain('Never deploy on Fridays.');
  });

  it('rejects stale hashes, empty directives and reasonless exclusions without writing', async () => {
    const f = tmp();
    fs.writeFileSync(f, JSON.stringify({ rules: {
      'project:long-rule': { source_hash: 'old', actions: ['edit'], directive: 'x' },
      'project:short-rule': { source_hash: ruleFingerprint(nodes[1]), actions: ['edit'], directive: ' ' },
      'project:dup-rule': { source_hash: ruleFingerprint(nodes[2]), enabled: false },
    } }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(rules(['apply', f])).rejects.toThrow(/3 invalid entries/);
    expect(writes).toEqual([]);
  });

  it('applies a valid shortened policy by creating the single context:policy decision', async () => {
    const f = tmp();
    fs.writeFileSync(f, JSON.stringify({ rules: {
      'project:long-rule': { source_hash: ruleFingerprint(nodes[0]), actions: ['deploy'], directive: 'No Friday deploys.', original_tokens: 250, title: 't' },
    } }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await rules(['apply', f]);
    expect(writes).toHaveLength(1);
    const [kind, args] = writes[0];
    expect(kind).toBe('remember');
    expect(args).toContain('context:policy');
    const body = JSON.parse(args[1]);
    expect(body.rules['project:long-rule']).toEqual({ source_hash: ruleFingerprint(nodes[0]), actions: ['deploy'], directive: 'No Friday deploys.' });
  });

  it('validatePolicyFile warns when a directive is longer than the original', () => {
    const f = tmp();
    fs.writeFileSync(f, JSON.stringify({ rules: { 'project:short-rule': { source_hash: ruleFingerprint(nodes[1]), actions: ['edit'], directive: 'Keep copy plain, always, everywhere.' } } }));
    const state = { ids: new Map([['project:short-rule', nodes[1]]]) };
    expect(validatePolicyFile(f, state).warnings[0]).toMatch(/longer/);
  });

  it('verify exits 1 when the capsule is over budget', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await rules(['verify', '--budget', '10']);
    expect(process.exitCode).toBe(1);
    expect(log.mock.calls.flat().join('\n')).toMatch(/> 10/);
  });

  it('prune lists duplicates as archive candidates and writes nothing by default', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await rules(['prune']);
    expect(log.mock.calls.flat().join('\n')).toContain('dup-rule');
    expect(writes).toEqual([]);
  });
});
