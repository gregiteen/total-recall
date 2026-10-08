import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discoverPlugins, assemblePluginContexts } from './plugin-context.mjs';

describe('Plugin Evolving Context Injections', () => {
  // Self-contained fixture — see plugin-loader.spec.mjs. These tests used to
  // point at a developer's private project root, so they could only pass on one
  // machine, and the plugin they expected is gone even there.
  let fixtureRoot;

  beforeAll(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-plugin-context-'));
    const pluginDir = path.join(fixtureRoot, '.agent', 'skills', 'total-recall', 'plugins', 'scientific-frontiers');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'scientific-frontiers',
        name: 'Scientific Frontiers Engine',
        version: '1.0.0',
        description: 'Fixture plugin used by the plugin-context tests.',
        ssss_schemas: {
          categories: [
            { name: 'research' },
            { name: 'benchmarks' },
            { name: 'user-projects' },
          ],
        },
      }),
    );
  });

  afterAll(() => {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('discovers installed plugins with valid manifests', () => {
    const plugins = discoverPlugins(fixtureRoot);
    expect(plugins.length).toBeGreaterThanOrEqual(1);
    const sf = plugins.find(p => p.id === 'scientific-frontiers');
    expect(sf).toBeDefined();
    expect(sf.manifest.name).toBe('Scientific Frontiers Engine');
  });

  it('assembles evolving context from matching vault nodes', async () => {
    const mockNodes = [
      {
        slug: 'test-benchmark',
        category: 'benchmarks',
        title: 'Quantum Gate Fidelity',
        status: 'active',
        source: {
          metric_name: 'two_qubit_gate_fidelity',
          current_record: 99.99,
          unit: '%',
          verification_status: 'peer_reviewed',
          doi: '10.1038/s41586-test'
        }
      },
      {
        slug: 'test-research',
        category: 'research',
        title: 'Room-Temperature Superconductivity Test',
        status: 'active',
        description: 'Synthetic diamond test case.',
        source: {
          epistemic_tier: 2,
          empirical_modality: 'empirical_experimental',
          doi: '10.1126/science.test'
        },
        enables: ['quantum-bus']
      },
      {
        slug: 'test-project',
        category: 'user-projects',
        title: 'Local Test Lab',
        status: 'active',
        description: 'Building custom laser tweezers.',
        source: {
          repo_path: '/path/to/repo'
        },
        enables: ['test-benchmark']
      }
    ];

    const context = await assemblePluginContexts({
      projectRoot: fixtureRoot,
      nodes: mockNodes
    });

    expect(context).toContain('## Evolving Plugin Context Surfaces');
    expect(context).toContain('### Active Plugin: Scientific Frontiers Engine');
    expect(context).toContain('Local Test Lab');
    expect(context).toContain('Quantum Gate Fidelity');
    expect(context).not.toContain('99.99 %');
    expect(context).toContain('Room-Temperature Superconductivity Test');
  });

  it('returns empty string when no plugins or matching nodes are found', async () => {
    const context = await assemblePluginContexts({
      projectRoot: '/nonexistent/directory/path',
      nodes: []
    });
    expect(context).toBe('');
  });

  it('does not execute invalid, escaped or project-root replacement generators', async () => {
    const pluginsRoot = path.join(fixtureRoot, '.agent', 'skills', 'total-recall', 'plugins');
    const outside = path.join(fixtureRoot, 'replacement.mjs');
    fs.writeFileSync(outside, 'export function generateContext() { return "ESCAPED_GENERATOR"; }');
    const variants = [
      ['invalid-context', { id: 'INVALID', compile: { generator: './replacement.mjs' } }],
      ['symlink-context', { compile: { generator: './replacement.mjs' } }],
      ['missing-context', { compile: { generator: './replacement.mjs' } }],
    ];
    try {
      for (const [id, extra] of variants) {
        const dir = path.join(pluginsRoot, id);
        fs.mkdirSync(dir);
        fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
          id, name: id, version: '1.0.0', description: 'Generator confinement test', ...extra,
        }));
        if (id !== 'missing-context') fs.symlinkSync(outside, path.join(dir, 'replacement.mjs'));
      }
      const context = await assemblePluginContexts({ projectRoot: fixtureRoot });
      expect(context).not.toContain('ESCAPED_GENERATOR');
      expect(context).not.toContain('invalid-context');
    } finally {
      for (const [id] of variants) fs.rmSync(path.join(pluginsRoot, id), { recursive: true, force: true });
      fs.rmSync(outside);
    }
  });

  it('does not read another plugin or shared derived context through a symlink', async () => {
    const dir = path.join(fixtureRoot, '.agent', 'skills', 'total-recall', 'plugins', 'scientific-frontiers');
    const derivedDir = path.join(fixtureRoot, 'derived');
    fs.mkdirSync(derivedDir);
    fs.writeFileSync(path.join(derivedDir, 'evolving-context.md'), 'UNOWNED_CONTEXT');
    fs.symlinkSync(path.join(derivedDir, 'evolving-context.md'), path.join(dir, 'context.md'));
    try {
      const context = await assemblePluginContexts({ projectRoot: fixtureRoot, derivedDir });
      expect(context).not.toContain('UNOWNED_CONTEXT');
    } finally {
      fs.rmSync(path.join(dir, 'context.md'));
      fs.rmSync(derivedDir, { recursive: true });
    }
  });
});
