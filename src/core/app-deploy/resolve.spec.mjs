import { describe, it, expect } from 'vitest';
import {
  resolveCapabilityGraph,
  IncompatibleAdapterError,
  IncompatibleSsssVersionError,
  DependencyCycleError,
  OwnershipCollisionError,
  satisfiesVersionConstraint
} from './resolve.mjs';

describe('Capability Graph & Dependency Resolver (app-deploy/resolve.mjs)', () => {
  function makePluginDescriptor(id, version, overrides = {}) {
    return {
      id,
      version,
      sha256: 'a'.repeat(64),
      manifest: {
        id,
        name: `Plugin ${id}`,
        version,
        description: `Description for ${id}`,
        deploy: {
          targets: ['ssss-app', 'nextjs', 'flask'],
          required_ssss_version: '>=0.9.3',
          access_grants: [`ssss:vault:${id}`],
          resources: { [`res_${id}`]: 'mock' }
        },
        ...overrides
      },
      files: [
        { path: `skills/${id}/SKILL.md`, size: 100 },
        { path: `lib/${id}.mjs`, size: 200 }
      ]
    };
  }

  describe('Semver Constraints', () => {
    it('evaluates >= constraints accurately', () => {
      expect(satisfiesVersionConstraint('0.9.6', '>=0.9.3')).toBe(true);
      expect(satisfiesVersionConstraint('1.0.0', '>=0.9.3')).toBe(true);
      expect(satisfiesVersionConstraint('0.9.2', '>=0.9.3')).toBe(false);
      expect(satisfiesVersionConstraint('0.8.0', '>=0.9.3')).toBe(false);
    });

    it('evaluates ^ constraints accurately', () => {
      expect(satisfiesVersionConstraint('0.9.6', '^0.9.0')).toBe(true);
      expect(satisfiesVersionConstraint('0.9.0', '^0.9.0')).toBe(true);
      expect(satisfiesVersionConstraint('1.0.0', '^0.9.0')).toBe(false);
    });
  });

  describe('Adapter & Environment Compatibility', () => {
    it('accepts compatible adapter', async () => {
      const root = makePluginDescriptor('root', '1.0.0');
      const res = await resolveCapabilityGraph(root, { adapter: 'nextjs' });
      expect(res.adapter).toBe('nextjs');
      expect(res.orderedPlugins.length).toBe(1);
    });

    it('rejects unsupported adapter with IncompatibleAdapterError', async () => {
      const root = makePluginDescriptor('root', '1.0.0', {
        deploy: { targets: ['flask'] }
      });
      await expect(resolveCapabilityGraph(root, { adapter: 'react' })).rejects.toThrow(
        IncompatibleAdapterError
      );
    });

    it('rejects incompatible SSSS target version with IncompatibleSsssVersionError', async () => {
      const root = makePluginDescriptor('root', '1.0.0', {
        deploy: { required_ssss_version: '>=1.0.0' }
      });
      await expect(
        resolveCapabilityGraph(root, { targetApp: { ssssVersion: '0.9.6' } })
      ).rejects.toThrow(IncompatibleSsssVersionError);
    });
  });

  describe('DAG Topological Sort & Transitive Dependencies', () => {
    it('orders dependencies before dependents', async () => {
      const leaf = makePluginDescriptor('leaf', '1.0.0');
      const mid = makePluginDescriptor('mid', '1.0.0', {
        dependencies: { leaf: '^1.0.0' }
      });
      const root = makePluginDescriptor('root', '1.0.0', {
        dependencies: { mid: '^1.0.0' }
      });

      const catalog = { leaf, mid };
      const resolver = async (id) => catalog[id];

      const res = await resolveCapabilityGraph(root, { pluginResolver: resolver });
      const order = res.orderedPlugins.map((p) => p.id);
      expect(order).toEqual(['leaf', 'mid', 'root']);
      expect(res.totalGrants).toEqual(['ssss:vault:leaf', 'ssss:vault:mid', 'ssss:vault:root']);
      expect(res.totalResources).toEqual({
        res_leaf: 'mock',
        res_mid: 'mock',
        res_root: 'mock'
      });
    });

    it('detects and rejects dependency cycles with DependencyCycleError', async () => {
      const a = makePluginDescriptor('a', '1.0.0', { dependencies: { b: '^1.0.0' } });
      const b = makePluginDescriptor('b', '1.0.0', { dependencies: { a: '^1.0.0' } });

      const catalog = { a, b };
      const resolver = async (id) => catalog[id];

      await expect(resolveCapabilityGraph(a, { pluginResolver: resolver })).rejects.toThrow(
        DependencyCycleError
      );
    });
  });

  describe('Collision Detection', () => {
    it('detects file collisions between two plugins in graph', async () => {
      const dep = makePluginDescriptor('dep', '1.0.0');
      const root = makePluginDescriptor('root', '1.0.0', {
        dependencies: { dep: '^1.0.0' }
      });
      // Force file collision: both claim 'lib/common.mjs'
      dep.files.push({ path: 'lib/common.mjs', size: 50 });
      root.files.push({ path: 'lib/common.mjs', size: 75 });

      const resolver = async (id) => (id === 'dep' ? dep : null);

      await expect(resolveCapabilityGraph(root, { pluginResolver: resolver })).rejects.toThrow(
        OwnershipCollisionError
      );
    });

    it('detects SSSS category collisions', async () => {
      const dep = makePluginDescriptor('dep', '1.0.0', {
        ssss_schemas: { categories: [{ name: 'shared-cat' }] }
      });
      const root = makePluginDescriptor('root', '1.0.0', {
        dependencies: { dep: '^1.0.0' },
        ssss_schemas: { categories: [{ name: 'shared-cat' }] }
      });

      const resolver = async (id) => (id === 'dep' ? dep : null);

      await expect(resolveCapabilityGraph(root, { pluginResolver: resolver })).rejects.toThrow(
        OwnershipCollisionError
      );
    });
  });
});
