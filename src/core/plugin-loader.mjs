import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * Validates a plugin manifest object against Total Recall plugin standards.
 * @param {object} manifest - Parsed plugin.json object
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePluginManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be a non-null object'] };
  }

  if (!manifest.id || typeof manifest.id !== 'string') {
    errors.push("Missing required field 'id'");
  } else if (!ID_PATTERN.test(manifest.id)) {
    errors.push(`Invalid id '${manifest.id}': must be lowercase kebab-case (^[a-z][a-z0-9-]{1,63}$)`);
  }

  if (!manifest.name || typeof manifest.name !== 'string' || manifest.name.trim().length === 0) {
    errors.push("Missing required field 'name'");
  }

  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push("Missing required field 'version'");
  } else if (!VERSION_PATTERN.test(manifest.version)) {
    errors.push(`Invalid version '${manifest.version}': must follow semantic versioning (e.g. 1.0.0)`);
  }

  if (!manifest.description || typeof manifest.description !== 'string' || manifest.description.trim().length < 5) {
    errors.push("Missing required field 'description' (minimum 5 characters)");
  }

  if (manifest.ssss_schemas?.categories) {
    if (!Array.isArray(manifest.ssss_schemas.categories)) {
      errors.push("'ssss_schemas.categories' must be an array");
    } else {
      for (const cat of manifest.ssss_schemas.categories) {
        if (!cat.name || typeof cat.name !== 'string') {
          errors.push("Each category in 'ssss_schemas.categories' must have a string 'name'");
        }
      }
    }
  }

  if (manifest.tasks) {
    if (!Array.isArray(manifest.tasks)) {
      errors.push("'tasks' must be an array");
    } else {
      for (const t of manifest.tasks) {
        if (!t.intent || !t.schedule) {
          errors.push("Each task must define 'intent' and 'schedule'");
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Discover installed plugins across project and global directories.
 * Each plugin directory contains a `plugin.json` manifest.
 * @param {string} [projectRoot] - Current project root directory
 * @returns {Array<{ id: string, manifest: object, dir: string, manifestPath: string, valid: boolean, errors: string[] }>}
 */
export function discoverPlugins(projectRoot = process.cwd()) {
  const plugins = [];
  const searchDirs = [
    path.join(projectRoot, '.agent', 'plugins'),
    path.join(os.homedir(), '.agent', 'plugins')
  ];

  const seenIds = new Set();

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const pluginDir = path.join(dir, entry.name);
      const manifestPath = path.join(pluginDir, 'plugin.json');

      if (fs.existsSync(manifestPath)) {
        try {
          const raw = fs.readFileSync(manifestPath, 'utf8');
          const manifest = JSON.parse(raw);
          const validation = validatePluginManifest(manifest);
          const id = manifest.id || entry.name;

          if (!seenIds.has(id)) {
            seenIds.add(id);
            plugins.push({
              id,
              manifest,
              dir: pluginDir,
              manifestPath,
              valid: validation.valid,
              errors: validation.errors
            });
          }
        } catch (err) {
          // Record unparseable manifest
          const id = entry.name;
          if (!seenIds.has(id)) {
            seenIds.add(id);
            plugins.push({
              id,
              manifest: {},
              dir: pluginDir,
              manifestPath,
              valid: false,
              errors: [`JSON parse error: ${err.message}`]
            });
          }
        }
      }
    }
  }

  return plugins;
}

/**
 * Retrieve a specific plugin by id.
 */
export function getPlugin(id, projectRoot = process.cwd()) {
  const plugins = discoverPlugins(projectRoot);
  return plugins.find(p => p.id === id) || null;
}

export const getPluginById = getPlugin;

/**
 * Collect all SSSS categories declared across all active, valid plugins.
 */
export function getPluginCategories(projectRoot = process.cwd()) {
  const plugins = discoverPlugins(projectRoot);
  const categories = [];

  for (const p of plugins) {
    if (!p.valid) continue;
    const cats = p.manifest.ssss_schemas?.categories || [];
    for (const c of cats) {
      categories.push({
        pluginId: p.id,
        name: c.name,
        description: c.description || '',
        node_type: c.node_type || 'memory',
        template: c.template ? path.resolve(p.dir, c.template) : null
      });
    }
  }

  return categories;
}

/**
 * Collect all filesystem paths watched by installed plugins for plugin-directed compilation.
 */
export function getPluginWatchPaths(projectRoot = process.cwd(), vaultDir) {
  let resolvedProjectRoot = projectRoot;
  if (vaultDir && (!resolvedProjectRoot || resolvedProjectRoot === process.cwd())) {
    try {
      const parent = path.resolve(vaultDir, '..', '..', '..');
      if (fs.existsSync(path.join(parent, '.agent'))) {
        resolvedProjectRoot = parent;
      }
    } catch {}
  }

  const plugins = discoverPlugins(resolvedProjectRoot);
  const paths = new Set();

  for (const plugin of plugins) {
    if (!plugin.valid) continue;
    const { manifest, dir } = plugin;
    if (manifest.compile?.watch && Array.isArray(manifest.compile.watch)) {
      for (const item of manifest.compile.watch) {
        // Resolve relative to plugin dir or project root
        const p1 = path.resolve(dir, item);
        if (fs.existsSync(p1)) {
          paths.add(p1);
        } else {
          const p2 = path.resolve(resolvedProjectRoot, item);
          if (fs.existsSync(p2)) {
            paths.add(p2);
          }
        }
      }
    }
  }

  return Array.from(paths);
}
