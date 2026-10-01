import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { routeMetadata, validateDecisionConfig, loadDecisionClient } from './route.mjs';
import { auditSkillOwnership, skillDirectories, skillMetadata } from '../../src/core/skill-optimizer.mjs';

const decision = { plugin: 'decision', module: 'src/client.mjs', export: 'requestDecision', model: 'configured-model', endpoint: 'https://example.org/decisions', secretKey: 'ROUTING_KEY', confidence: 0.8, fit: 0.8, timeoutMs: 1000, maxBytes: 8000 };
const api = { auditSkillOwnership, skillDirectories, skillMetadata };
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-route-'));
  const global = path.join(root, 'global'), repo = path.join(root, 'repo'), foreign = path.join(root, 'foreign');
  for (const r of [global, repo, foreign]) fs.mkdirSync(r);
  for (const r of [repo, foreign]) fs.writeFileSync(path.join(r, 'package.json'), JSON.stringify({ name: path.basename(r) }));
  function skill(r, name, description, scoped = false, identity) {
    const dir = path.join(r, name); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\nrepo_scoped: ${scoped}\n${identity ? `repository_id: ${identity}\n` : ''}---\nPRIVATE BODY never sent`);
  }
  skill(global, 'mail', 'Send email messages');
  skill(repo, 'local-test', 'Run repository tests', true, 'repo');
  skill(foreign, 'foreign-test', 'Run repository tests', true, 'foreign');
  skill(global, 'invalid-owner', 'Run repository tests', true, 'foreign');
  const config = { roots: [{ path: global, scope: 'global' }, ...[repo, foreign].map(r => ({ path: r, scope: 'repository', repoRoot: r }))], decision };
  return { root, repo, config, clean: () => fs.rmSync(root, { recursive: true }) };
}
function client(calls) {
  return async request => {
    calls.push(request);
    if (request.questions.select) {
      const keys = Object.keys(request.questions.select.criteria), selected = keys.find(k => k !== 'none' && request.questions.select.criteria[k].includes('repository tests'));
      return { raw: { model: 'actual-version', answers: { select: { type: 'choice', choice: selected, confidence: 0.95, probabilities: Object.fromEntries(keys.map(k => [k, k === selected ? 1 : 0])) } } } };
    }
    return { raw: { model: 'actual-version', answers: { fits: { type: 'noul', noul: 0.95 } } } };
  };
}
describe('bounded decision navigation', () => {
  it('requires explicit provider contract and rejects insecure or escaping config', () => {
    expect(validateDecisionConfig(decision)).toEqual(decision);
    for (const patch of [{ confidence: undefined }, { fit: NaN }, { endpoint: 'http://example.org' }, { module: '../client.mjs' }, { secretKey: '' }]) expect(() => validateDecisionConfig({ ...decision, ...patch })).toThrow();
  });
  it('filters foreign owners before outbound metadata and caches exact inputs', async () => {
    const f = fixture(), calls = [];
    try {
      const first = await routeMetadata('Run repository tests', f.config, api, { repoRoot: f.repo, request: client(calls) });
      expect(first).toMatchObject({ advisory: true, method: 'decision', selected: 'local-test', model: 'actual-version' });
      expect(JSON.stringify(calls)).not.toMatch(/PRIVATE BODY|foreign-test|invalid-owner|tr-route-/);
      const next = await routeMetadata('Run repository tests', f.config, api, { repoRoot: f.repo, request: client(calls), previous: first });
      expect(next.cached).toBe(true); expect(calls).toHaveLength(2);
      fs.appendFileSync(path.join(f.repo, 'local-test', 'SKILL.md'), '\nchanged body');
      await routeMetadata('Run repository tests', f.config, api, { repoRoot: f.repo, request: client(calls), previous: first });
      expect(calls).toHaveLength(4);
    } finally { f.clean(); }
  });
  it('never defaults missing certainty to success; invalid distributions and no fit fall back', async () => {
    const f = fixture();
    try {
      for (const answer of [{ type: 'choice', choice: 's1' }, { type: 'choice', choice: 'unknown', confidence: 1, probabilities: { unknown: 1 } }, { type: 'choice', choice: 'none', confidence: 1, probabilities: { none: NaN } }]) {
        const out = await routeMetadata('Run repository tests', f.config, api, { repoRoot: f.repo, request: async () => ({ raw: { answers: { select: answer } } }) });
        expect(out.method).toBe('deterministic');
      }
      const calls = [], normal = client(calls);
      const out = await routeMetadata('Run repository tests', f.config, api, { repoRoot: f.repo, request: async req => req.questions.fits ? { raw: { answers: { fits: { type: 'noul', noul: 0.1 } } } } : normal(req) });
      expect(out).toMatchObject({ method: 'deterministic', reason: 'fit-abstained' });
    } finally { f.clean(); }
  });
  it('accepts a validated none answer without forcing a skill load', async () => {
    const f = fixture();
    try {
      const out = await routeMetadata('unrelated task', f.config, api, { repoRoot: f.repo, request: async req => ({ raw: { answers: { select: { type: 'choice', choice: 'none', confidence: 0.95, probabilities: Object.fromEntries(Object.keys(req.questions.select.criteria).map(id => [id, id === 'none' ? 1 : 0])) } } } }) });
      expect(out).toMatchObject({ method: 'abstained', selected: null });
    } finally { f.clean(); }
  });
  it('does not call a provider when unconfigured or over budget; timeout and errors fall back', async () => {
    const f = fixture(), request = vi.fn();
    try {
      expect((await routeMetadata('tests', { ...f.config, decision: undefined }, api, { repoRoot: f.repo, request })).reason).toBe('unconfigured');
      expect((await routeMetadata('tests', { ...f.config, decision: { ...decision, maxBytes: 100 } }, api, { repoRoot: f.repo, request })).reason).toBe('request-budget');
      expect(request).not.toHaveBeenCalled();
      expect((await routeMetadata('tests', f.config, api, { repoRoot: f.repo, request: async () => { throw Error('secret provider detail'); } })).reason).toBe('provider-error');
      expect((await routeMetadata('tests', { ...f.config, decision: { ...decision, timeoutMs: 10 } }, api, { repoRoot: f.repo, request: () => new Promise(() => {}) })).reason).toBe('provider-error');
    } finally { f.clean(); }
  });
  it('loads only a configured client contained inside an installed valid plugin', async () => {
    const f = fixture();
    try {
      fs.writeFileSync(path.join(f.root, 'client.mjs'), 'export async function requestDecision() { return null; }');
      const importModule = vi.fn(async () => ({ requestDecision: async () => null }));
      expect(typeof await loadDecisionClient({ ...decision, module: 'client.mjs' }, { valid: true, dir: f.root }, importModule)).toBe('function');
      expect(importModule).toHaveBeenCalledOnce();
      expect(await loadDecisionClient(decision, null)).toBeNull();
      fs.symlinkSync(path.join(f.root, 'client.mjs'), path.join(f.repo, 'escaped.mjs'));
      expect(await loadDecisionClient({ ...decision, module: 'escaped.mjs' }, { valid: true, dir: f.repo }, importModule)).toBeNull();
      expect(importModule).toHaveBeenCalledOnce();
    } finally { f.clean(); }
  });
});
