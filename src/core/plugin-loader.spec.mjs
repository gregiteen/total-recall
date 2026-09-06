import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  validatePluginManifest,
  discoverPlugins,
  getPlugin,
  getPluginCategories,
  getPluginWatchPaths
} from './plugin-loader.mjs';

describe('Plugin Loader & Schema Validation', () => {
  describe('validatePluginManifest', () => {
    it('rejects invalid or empty manifests', () => {
      expect(validatePluginManifest(null).valid).toBe(false);
      expect(validatePluginManifest({}).valid).toBe(false);
    });

    it('rejects missing required fields', () => {
      const res = validatePluginManifest({
        id: 'test-plugin'
      });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("Missing required field 'name'");
      expect(res.errors).toContain("Missing required field 'version'");
      expect(res.errors).toContain("Missing required field 'description' (minimum 5 characters)");
    });

    it('enforces kebab-case id and semver version', () => {
      const res = validatePluginManifest({
        id: 'Invalid_ID!',
        name: 'Test',
        version: 'v1.0',
        description: 'Valid description text'
      });
      expect(res.valid).toBe(false);
      expect(res.errors.some(e => e.includes('Invalid id'))).toBe(true);
      expect(res.errors.some(e => e.includes('Invalid version'))).toBe(true);
    });

    it('accepts a fully conformant plugin manifest', () => {
      const res = validatePluginManifest({
        id: 'my-plugin',
        name: 'My Plugin',
        version: '1.2.3',
        description: 'Valid description of the plugin capability',
        ssss_schemas: {
          categories: [
            { name: 'custom-notes', description: 'Custom plugin notes', node_type: 'memory' }
          ]
        },
        tasks: [
          { intent: 'Run daily crawl', schedule: '0 0 * * *' }
        ]
      });
      expect(res.valid).toBe(true);
      expect(res.errors.length).toBe(0);
    });
  });

  describe('discoverPlugins & category extraction', () => {
    const keenHertzRoot = '/Users/greg/Documents/antigravity/keen-hertz';

    it('discovers plugins in project root', () => {
      const plugins = discoverPlugins(keenHertzRoot);
      const sf = plugins.find(p => p.id === 'scientific-frontiers');
      expect(sf).toBeDefined();
      expect(sf.valid).toBe(true);
      expect(sf.manifest.name).toBe('Scientific Frontiers Engine');
    });

    it('retrieves specific plugin with getPlugin', () => {
      const plugin = getPlugin('scientific-frontiers', keenHertzRoot);
      expect(plugin).toBeDefined();
      expect(plugin.id).toBe('scientific-frontiers');
    });

    it('returns null for nonexistent plugin', () => {
      const plugin = getPlugin('nonexistent-plugin', keenHertzRoot);
      expect(plugin).toBeNull();
    });

    it('extracts all SSSS categories declared by active plugins', () => {
      const categories = getPluginCategories(keenHertzRoot);
      const names = categories.map(c => c.name);
      expect(names).toContain('research');
      expect(names).toContain('benchmarks');
      expect(names).toContain('user-projects');
    });

    it('collects watch paths for compiler', () => {
      const watchPaths = getPluginWatchPaths(keenHertzRoot);
      expect(watchPaths.length).toBeGreaterThan(0);
    });
  });
});
