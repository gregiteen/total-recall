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
    expect(context).toContain('two_qubit_gate_fidelity');
    expect(context).toContain('99.99 %');
    expect(context).toContain('Room-Temperature Superconductivity Test');
  });

  it('returns empty string when no plugins or matching nodes are found', async () => {
    const context = await assemblePluginContexts({
      projectRoot: '/nonexistent/directory/path',
      nodes: []
    });
    expect(context).toBe('');
  });
});
