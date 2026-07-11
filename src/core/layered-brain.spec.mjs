/**
 * Tests for the layered brain architecture — merged vault compilation,
 * layer-aware resolution, and related utilities.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';

import { loadNodes, loadMergedNodes, writeNode, safeStringify } from '../core/vault.mjs';

function createTempBrain(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const vaultDir = path.join(dir, 'memory-vault');
  fs.mkdirSync(vaultDir, { recursive: true });
  return { brainDir: dir, vaultDir };
}

async function writeTestNode(vaultDir, slug, category, opts = {}) {
  const node = {
    type: 'memory',
    slug,
    category,
    title: opts.title || `Test: ${slug}`,
    body: opts.body || `Body for ${slug}`,
    status: opts.status || 'active',
    confidence: opts.confidence || 1.0,
    importance: opts.importance || 3,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    source: { type: 'test', session_id: 'test', evidence_count: 1 },
    schema_version: 2,
  };
  await writeNode(node, vaultDir);
  return node;
}

describe('Layered Brain: loadMergedNodes', () => {
  let globalBrain;
  let projectBrain;

  beforeEach(() => {
    globalBrain = createTempBrain('tr-global-');
    projectBrain = createTempBrain('tr-project-');
  });

  afterEach(() => {
    fs.rmSync(globalBrain.brainDir, { recursive: true, force: true });
    fs.rmSync(projectBrain.brainDir, { recursive: true, force: true });
  });

  it('returns global nodes when no project vault exists', async () => {
    await writeTestNode(globalBrain.vaultDir, 'global-rule', 'invariants');
    await writeTestNode(globalBrain.vaultDir, 'global-pref', 'preferences');

    const nodes = loadMergedNodes(globalBrain.vaultDir, null);
    expect(nodes).toHaveLength(2);
    expect(nodes.every(n => n._layer === 'global')).toBe(true);
  });

  it('returns global nodes when project path does not exist', async () => {
    await writeTestNode(globalBrain.vaultDir, 'test-node', 'facts');
    const nodes = loadMergedNodes(globalBrain.vaultDir, '/nonexistent/vault');
    expect(nodes).toHaveLength(1);
    expect(nodes[0]._layer).toBe('global');
  });

  it('returns both global and project nodes', async () => {
    await writeTestNode(globalBrain.vaultDir, 'global-only', 'invariants');
    await writeTestNode(projectBrain.vaultDir, 'project-only', 'facts');

    const nodes = loadMergedNodes(globalBrain.vaultDir, projectBrain.vaultDir);
    expect(nodes).toHaveLength(2);

    const slugs = new Set(nodes.map(n => n.slug));
    expect(slugs.has('global-only')).toBe(true);
    expect(slugs.has('project-only')).toBe(true);

    const globalNode = nodes.find(n => n.slug === 'global-only');
    const projectNode = nodes.find(n => n.slug === 'project-only');
    expect(globalNode._layer).toBe('global');
    expect(projectNode._layer).toBe('project');
  });

  it('project nodes override global nodes with same slug', async () => {
    await writeTestNode(globalBrain.vaultDir, 'shared-slug', 'facts', { title: 'Global Version' });
    await writeTestNode(projectBrain.vaultDir, 'shared-slug', 'facts', { title: 'Project Version' });

    const nodes = loadMergedNodes(globalBrain.vaultDir, projectBrain.vaultDir);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].title).toBe('Project Version');
    expect(nodes[0]._layer).toBe('project');
  });

  it('handles empty vaults gracefully', async () => {
    const nodes = loadMergedNodes(globalBrain.vaultDir, projectBrain.vaultDir);
    expect(nodes).toHaveLength(0);
  });

  it('merges many nodes from both layers correctly', async () => {
    // 3 global, 3 project, 1 overlap
    await writeTestNode(globalBrain.vaultDir, 'g1', 'invariants');
    await writeTestNode(globalBrain.vaultDir, 'g2', 'preferences');
    await writeTestNode(globalBrain.vaultDir, 'shared', 'facts', { title: 'Global Shared' });

    await writeTestNode(projectBrain.vaultDir, 'p1', 'facts');
    await writeTestNode(projectBrain.vaultDir, 'p2', 'decisions');
    await writeTestNode(projectBrain.vaultDir, 'shared', 'facts', { title: 'Project Shared' });

    const nodes = loadMergedNodes(globalBrain.vaultDir, projectBrain.vaultDir);
    // g1 + g2 + shared(project) + p1 + p2 = 5
    expect(nodes).toHaveLength(5);

    const shared = nodes.find(n => n.slug === 'shared');
    expect(shared._layer).toBe('project');
    expect(shared.title).toBe('Project Shared');

    // Verify layer counts
    const globalCount = nodes.filter(n => n._layer === 'global').length;
    const projectCount = nodes.filter(n => n._layer === 'project').length;
    expect(globalCount).toBe(2); // g1, g2
    expect(projectCount).toBe(3); // shared, p1, p2
  });
});

describe('Layered Brain: parseLayerFlag', () => {
  let parseLayerFlag;
  let defaultLayerForCategory;

  beforeEach(async () => {
    const mod = await import('../cli/agent-dir.mjs');
    parseLayerFlag = mod.parseLayerFlag;
    defaultLayerForCategory = mod.defaultLayerForCategory;
  });

  it('extracts --global flag', async () => {
    const { layer, remainingArgs } = parseLayerFlag(['invariant', 'test', '--global']);
    expect(layer).toBe('global');
    expect(remainingArgs).toEqual(['invariant', 'test']);
  });

  it('extracts --project flag', async () => {
    const { layer, remainingArgs } = parseLayerFlag(['--project', 'fact', 'test']);
    expect(layer).toBe('project');
    expect(remainingArgs).toEqual(['fact', 'test']);
  });

  it('returns auto when no flag specified', async () => {
    const { layer, remainingArgs } = parseLayerFlag(['fact', 'content', '--tags', 'x']);
    expect(layer).toBe('auto');
    expect(remainingArgs).toEqual(['fact', 'content', '--tags', 'x']);
  });

  it('handles empty args', async () => {
    const { layer, remainingArgs } = parseLayerFlag([]);
    expect(layer).toBe('auto');
    expect(remainingArgs).toEqual([]);
  });

  it('defaultLayerForCategory maps categories correctly', async () => {
    expect(defaultLayerForCategory('invariants')).toBe('project');
    expect(defaultLayerForCategory('preferences')).toBe('project');
    expect(defaultLayerForCategory('anti-patterns')).toBe('project');
    expect(defaultLayerForCategory('facts')).toBe('project');
    expect(defaultLayerForCategory('decisions')).toBe('project');
    expect(defaultLayerForCategory('lore')).toBe('project');
    expect(defaultLayerForCategory('patterns')).toBe('project');
    expect(defaultLayerForCategory('concepts')).toBe('project');
  });
});
