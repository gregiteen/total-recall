import { describe, it, expect } from 'vitest';
import { discoverPlugins, assemblePluginContexts } from './plugin-context.mjs';

describe('Plugin Evolving Context Injections', () => {
  it('discovers installed plugins with valid manifests', () => {
    // Should discover plugins in keen-hertz project root
    const plugins = discoverPlugins('/Users/greg/Documents/antigravity/keen-hertz');
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
      projectRoot: '/Users/greg/Documents/antigravity/keen-hertz',
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
