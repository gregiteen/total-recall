import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  validatePluginManifest,
  discoverPlugins,
  getPlugin,
  getPluginCategories,
  getPluginWatchPaths,
  projectPluginsDir,
  globalPluginsDir,
  bundledPluginsDir,
  listBundledPlugins
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
        use_cases: ['research'],
        cli: { command: 'my-plugin', handler: './cli.mjs' },
        tasks: [
          { intent: 'Run daily crawl', schedule: '0 0 * * *', command: 'crawl' }
        ]
      });
      expect(res.valid).toBe(true);
      expect(res.errors.length).toBe(0);
    });

    it('rejects a task that has nothing to run', () => {
      const base = { id: 'my-plugin', name: 'My Plugin', version: '1.0.0', description: 'Valid description' };
      const noCommand = validatePluginManifest({ ...base, tasks: [{ intent: 'x', schedule: '0 * * * *' }] });
      expect(noCommand.valid).toBe(false);
      expect(noCommand.errors.some(e => e.includes("must define 'command'"))).toBe(true);
      expect(noCommand.errors.some(e => e.includes("requires 'cli.handler'"))).toBe(true);
    });

    it('rejects malformed schedules and use cases', () => {
      const res = validatePluginManifest({
        id: 'my-plugin', name: 'My Plugin', version: '1.0.0', description: 'Valid description',
        use_cases: ['Not Kebab'],
        cli: { handler: './cli.mjs' },
        tasks: [{ intent: 'x', schedule: 'hourly', command: 'go' }]
      });
      expect(res.valid).toBe(false);
      expect(res.errors.some(e => e.includes('invalid schedule'))).toBe(true);
      expect(res.errors.some(e => e.includes('Invalid use case'))).toBe(true);
    });

    it('validates deploy contract correctly', () => {
      const validDeploy = {
        id: 'cap-plugin',
        name: 'Capability Plugin',
        version: '1.0.0',
        description: 'Valid capability plugin',
        deploy: {
          targets: ['ssss-app', 'flask', 'nextjs'],
          required_ssss_version: '>=0.9.3',
          access_grants: ['ssss:vault:read', 'ssss:events:append'],
          resources: { db: 'sqlite' }
        },
        skills: [{ id: 'cap-plugin', path: './skills/cap/SKILL.md' }],
        commands: [{ name: 'cap', handler: './cli.mjs' }]
      };
      expect(validatePluginManifest(validDeploy).valid).toBe(true);

      const invalidDeploy = {
        ...validDeploy,
        deploy: {
          targets: [],
          access_grants: ['invalid grant with spaces!']
        }
      };
      const invRes = validatePluginManifest(invalidDeploy);
      expect(invRes.valid).toBe(false);
      expect(invRes.errors.some(e => e.includes("'deploy.targets' must be a non-empty array"))).toBe(true);
      expect(invRes.errors.some(e => e.includes("Invalid access grant"))).toBe(true);
    });

    it('rejects path traversal in artifact paths', () => {
      const traversalManifest = {
        id: 'traversal-plugin',
        name: 'Traversal Plugin',
        version: '1.0.0',
        description: 'Tests security path boundary',
        cli: { command: 't', handler: '../../etc/passwd' },
        skills: [{ id: 's', path: '../secrets/SKILL.md' }],
        commands: [{ name: 'c', handler: '/absolute/path/cli.mjs' }],
        ui: { design_tokens: '../../tokens.yaml' }
      };
      const res = validatePluginManifest(traversalManifest);
      expect(res.valid).toBe(false);
      expect(res.errors.some(e => e.includes('cli.handler must be a safe relative path'))).toBe(true);
      expect(res.errors.some(e => e.includes('invalid or unsafe \'path\''))).toBe(true);
      expect(res.errors.some(e => e.includes('invalid or unsafe \'handler\''))).toBe(true);
      expect(res.errors.some(e => e.includes("'ui.design_tokens' must be a safe relative path"))).toBe(true);
    });
  });

  describe('plugin directories', () => {
    it('keeps plugins inside the brain directory, never directly under .agent/', () => {
      expect(projectPluginsDir('/p')).toBe(path.join('/p', '.agent', 'skills', 'total-recall', 'plugins'));
      expect(globalPluginsDir()).toMatch(/[\\/]skills[\\/]total-recall[\\/]plugins$/);
      expect(globalPluginsDir()).not.toMatch(/\.agent[\\/]plugins$/);
    });

    it('lists the bundled plugins shipped with the package, all valid', () => {
      const bundled = listBundledPlugins();
      expect(bundled.length).toBeGreaterThan(0);
      for (const p of bundled) {
        expect(p.errors).toEqual([]);
        expect(p.valid).toBe(true);
        expect(p.dir.startsWith(bundledPluginsDir())).toBe(true);
        expect(Array.isArray(p.manifest.use_cases)).toBe(true);
      }
    });

    it('ignores dot-prefixed staging directories', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-plugin-staging-'));
      try {
        const staging = path.join(projectPluginsDir(root), '.staging-x-1234');
        fs.mkdirSync(staging, { recursive: true });
        fs.writeFileSync(path.join(staging, 'plugin.json'), JSON.stringify({ id: 'x' }));
        expect(discoverPlugins(root).some(p => p.id === 'x')).toBe(false);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
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
      const pluginDir = path.join(fixtureRoot, '.agent', 'skills', 'total-recall', 'plugins', 'scientific-frontiers');
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
