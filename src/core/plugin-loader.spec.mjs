import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
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
    // Self-contained fixture. These tests used to read a developer's private
    // project (`/Users/greg/Documents/antigravity/keen-hertz`), so they could
    // only ever pass on one machine — and the plugin they depended on is gone
    // even there. Build the manifest we assert against instead.
    let fixtureRoot;

    beforeAll(() => {
      fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-plugin-loader-'));
      const pluginDir = path.join(fixtureRoot, '.agent', 'plugins', 'scientific-frontiers');
      fs.mkdirSync(path.join(pluginDir, 'watched'), { recursive: true });
      fs.writeFileSync(
        path.join(pluginDir, 'plugin.json'),
        JSON.stringify({
          id: 'scientific-frontiers',
          name: 'Scientific Frontiers Engine',
          version: '1.0.0',
          description: 'Fixture plugin used by the plugin-loader tests.',
          ssss_schemas: {
            categories: [
              { name: 'research' },
              { name: 'benchmarks' },
              { name: 'user-projects' },
            ],
          },
          // getPluginWatchPaths only returns paths that exist on disk.
          compile: { watch: ['watched'] },
        }),
      );
    });

    afterAll(() => {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    });

    it('discovers plugins in project root', () => {
      const plugins = discoverPlugins(fixtureRoot);
      const sf = plugins.find(p => p.id === 'scientific-frontiers');
      expect(sf).toBeDefined();
      expect(sf.valid).toBe(true);
      expect(sf.manifest.name).toBe('Scientific Frontiers Engine');
    });

    it('retrieves specific plugin with getPlugin', () => {
      const plugin = getPlugin('scientific-frontiers', fixtureRoot);
      expect(plugin).toBeDefined();
      expect(plugin.id).toBe('scientific-frontiers');
    });

    it('returns null for nonexistent plugin', () => {
      const plugin = getPlugin('nonexistent-plugin', fixtureRoot);
      expect(plugin).toBeNull();
    });

    it('extracts all SSSS categories declared by active plugins', () => {
      const categories = getPluginCategories(fixtureRoot);
      const names = categories.map(c => c.name);
      expect(names).toContain('research');
      expect(names).toContain('benchmarks');
      expect(names).toContain('user-projects');
    });

    it('collects watch paths for compiler', () => {
      const watchPaths = getPluginWatchPaths(fixtureRoot);
      expect(watchPaths.length).toBeGreaterThan(0);
    });
  });
});
