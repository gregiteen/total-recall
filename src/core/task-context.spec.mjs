import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { retrieveTaskKnowledge, extractTaskPassage } from './task-context.mjs';
import { retrievePluginContext } from './context-providers.mjs';
import { nodeToEmbedText } from './embeddings.mjs';
import { compileContext } from './context-compiler.mjs';
import { compactRules } from './context-compactor.mjs';
vi.mock('./cli-semantic-index.mjs', () => ({ queryCliSemanticIndex: async () => [] }));

const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const fact = (slug, body, extra = {}) => ({ slug, title: slug, category: 'facts', status: 'active', body, ...extra });
const noProviders = async () => ({ candidates: [], diagnostics: [], coverage: [] });
const options = { providers: noProviders, embedding: async () => [1, 0], derivedDir: '/fixture/index' };
const freshIndex = (nodes, vectors = {}) => Object.fromEntries(nodes.map(node => [node.slug,
  { embedding: vectors[node.slug] || [1, 0], content_sha256: sha(nodeToEmbedText(node)) }]));

describe('TASK-CONTEXT-01 task evidence', () => {
  it('retrieves semantically related memory without literal query terms and keeps layer identity', async () => {
    const nodes = [fact('session-renewal', 'Credentials are renewed periodically.'), fact('gardening', 'Water the roses.')];
    const result = await retrieveTaskKnowledge({ ...options, query: 'password rotation', nodes,
      loadIndex: () => freshIndex(nodes, { gardening: [0, 1] }) });
    expect(result.summary.mode).toBe('hybrid');
    expect(result.summary.selected).toBe(1);
    expect(result.contributions.map(row => row.text).join('\n')).toContain('Credentials are renewed periodically.');
    expect(result.contributions.map(row => row.text).join('\n')).not.toContain('Water the roses');
    expect(result.summary.sources[0]).toMatchObject({ kind: 'vault', layer: 'project', slug: 'session-renewal' });
  });

  it('selects a relevant late passage and a bounded explicit neighbor, excluding rules and other repos', async () => {
    const nodes = [fact('renewal', `${'unrelated preface\n'.repeat(220)}Rotate the password before expiry.\nThe operator owns renewal.`, { related: ['rollback', 'foreign-rule', 'foreign-repo'] }),
      fact('rollback', 'Revoke the retired credential after acceptance.'),
      fact('foreign-rule', 'An unrelated constraint.', { category: 'invariants' }),
      fact('foreign-repo', 'Private foreign material.', { project: 'another-workspace' })];
    const result = await retrieveTaskKnowledge({ ...options, query: 'password expiry', nodes, semantic: false, loadIndex: () => ({}) });
    const text = result.contributions.map(row => row.text).join('\n');
    expect(text).toContain('Rotate the password before expiry.');
    expect(text).toContain('Revoke the retired credential');
    expect(text).not.toContain('An unrelated constraint');
    expect(text).not.toContain('Private foreign material');
    expect(text.length).toBeLessThan(3000);
    expect(result.summary.sources.find(row => row.slug === 'renewal').startLine).toBeGreaterThan(200);
    expect(result.summary.sources.find(row => row.slug === 'rollback').relatedTo).toBe('renewal');
  });

  it('ignores a stale vector, reports provider failure and falls back honestly', async () => {
    const nodes = [fact('password', 'Current password policy.')];
    const result = await retrieveTaskKnowledge({ ...options, query: 'password', nodes,
      loadIndex: () => ({ password: { embedding: [1, 0], content_sha256: 'retired' } }),
      providers: async () => { throw new Error('provider is offline'); } });
    expect(result.summary.mode).toBe('lexical');
    expect(result.summary.diagnostics.join(' ')).toMatch(/stale vault vectors ignored/);
    expect(result.summary.diagnostics.join(' ')).toMatch(/provider is offline/);
    expect(result.summary.coverage[0]).toMatchObject({ compatibleVectors: 0, repositoryFilesIndexed: false });
  });

  it('keeps selected evidence through complete rule compaction and refuses an insufficient budget', async () => {
    const nodes = [fact('password', 'Password resets require an authenticated request.')];
    const knowledge = await retrieveTaskKnowledge({ ...options, query: 'password reset', nodes, loadIndex: () => freshIndex(nodes) });
    const rules = Array.from({ length: 20 }, (_, i) => ({ slug: `r-${i}`, body: `Rule ${i} must hold. ${'Additional explanation. '.repeat(100)}`,
      text: `[r-${i}] Rule ${i} must hold. ${'Additional explanation. '.repeat(100)}`, priority: i < 2 ? 'absolute' : 'normal', score: i }));
    const run = budget => compactRules(rules, { budget, complete: true, supplemental: knowledge.contributions, header: () => 'ready:true compacted:true' });
    const result = run(1800);
    expect(result.tokens).toBeLessThanOrEqual(1800);
    expect(result.counts.omitted).toBe(0);
    expect(result.context).toContain('Password resets require an authenticated request.');
    for (const rule of rules) expect(result.context).toContain(rule.slug);
    expect(() => run(30)).toThrow(/minimum/);
  });

  it('provides supporting memory by default and permits an explicit rules-only compiler consumer', async () => {
    const nodes = [fact('password', 'Rotate password credentials.'), { slug: 'required', category: 'invariants', status: 'active', body: 'Keep every required instruction.' }];
    const knowledgeOptions = { ...options, loadIndex: () => freshIndex(nodes) };
    const result = await compileContext({ query: 'password', nodes, knowledgeOptions });
    expect(result.context).toContain('Rotate password credentials.');
    expect(result.context).toContain('Keep every required instruction.');
    const rulesOnly = await compileContext({ query: 'password', nodes, includeKnowledge: false });
    expect(rulesOnly.context).not.toContain('Rotate password credentials.');
  });

  it('does not create a missing index while assembling a task', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-context-readonly-'));
    try {
      await retrieveTaskKnowledge({ query: 'password', nodes: [fact('password', 'Password policy.')], derivedDir: directory,
        embedding: async () => { throw new Error('no provider'); }, providers: noProviders });
      expect(fs.readdirSync(directory)).toEqual([]);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('preserves a match late in one oversized line', () => {
    const result = extractTaskPassage(`${'preface '.repeat(800)}CRYSTALRESET is the required operation.`, 'CRYSTALRESET', { maxChars: 200 });
    expect(result.text).toContain('CRYSTALRESET');
    expect(result.text.length).toBeLessThanOrEqual(200);
  });
});

describe('generic native context providers', () => {
  it('loads declared modules, bounds output, rejects escapes and reports errors', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-context-provider-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-context-outside-'));
    try {
      fs.writeFileSync(path.join(root, 'provider.mjs'), 'export const retrieveContext = () => null;');
      fs.writeFileSync(path.join(root, 'source.md'), 'Current source evidence.');
      fs.writeFileSync(path.join(outside, 'private.md'), 'Outside evidence.');
      const owner = { id: 'example-context', valid: true, dir: root, manifest: { runtime: { modules: { 'context-provider': 'provider.mjs' } } } };
      const row = file => ({ id: file, title: 'Evidence', text: 'Current source evidence.', score: .8,
        source: { path: file, hash: sha('Current source evidence.'), startLine: 1, endLine: 1, stale: false } });
      const result = await retrievePluginContext({ task: 'source', projectRoot: root, plugins: [owner],
        loadModule: async () => ({ retrieveContext: async () => ({ candidates: [row(path.join(root, 'source.md')), row(path.join(outside, 'private.md'))], coverage: { ranking: 'lexical' } }) }) });
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].id).toMatch(/^plugin:example-context:/);
      expect(result.diagnostics.join(' ')).toMatch(/escapes/);
      const failed = await retrievePluginContext({ task: 'source', projectRoot: root, plugins: [owner], loadModule: async () => { throw new Error('module unavailable'); } });
      expect(failed.candidates).toEqual([]);
      expect(failed.diagnostics.join(' ')).toMatch(/module unavailable/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
  });
});
