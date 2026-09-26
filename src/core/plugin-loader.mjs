import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const USE_CASE_PATTERN = /^[a-z][a-z0-9-]{1,47}$/;
const CRON_FIELD_PATTERN = /^[\d*,/-]+$/;

/** Root of the installed total-recall package (holds `plugins/` with the bundled sources). */
export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Where plugins live. Everything a brain owns sits under `skills/total-recall/`
 * — `.agent/` itself holds only `skills/` and `secrets.enc`.
 */
export function projectPluginsDir(projectRoot = process.cwd()) {
  return path.join(projectRoot, '.agent', 'skills', 'total-recall', 'plugins');
}

export function globalPluginsDir() {
  const agentDir = process.env.AGENT_DIR || process.env._TR_TEST_AGENT_DIR || path.join(os.homedir(), '.agent');
  return path.join(agentDir, 'skills', 'total-recall', 'plugins');
}

export function bundledPluginsDir() {
  return path.join(PACKAGE_ROOT, 'plugins');
}

/** The vault that owns records for plugins installed in `pluginsDir` (`<brain>/plugins` → `<brain>/memory-vault`). */
export function vaultForPluginsDir(pluginsDir) {
  return path.join(path.dirname(pluginsDir), 'memory-vault');
}

/**
 * The project a vault belongs to. A brain vault sits at
 * `<project>/.agent/skills/total-recall/memory-vault`, four levels below the
 * project root. Only used when the caller did not pass an explicit root.
 */
export function resolveProjectRoot(projectRoot, vaultDir) {
  if (!vaultDir || (projectRoot && projectRoot !== process.cwd())) return projectRoot || process.cwd();
  const parent = path.resolve(vaultDir, '..', '..', '..', '..');
  return fs.existsSync(path.join(parent, '.agent')) ? parent : (projectRoot || process.cwd());
}

/** True when a 5-field cron expression is syntactically plausible. Semantics are checked by plugin-tasks. */
export function isCronExpression(expr) {
  if (typeof expr !== 'string') return false;
  const fields = expr.trim().split(/\s+/);
  return fields.length === 5 && fields.every((f) => CRON_FIELD_PATTERN.test(f));
}

/**
 * Validates that a path is relative, normalized, and cannot traverse above its root.
 * Rejects absolute paths, null bytes, and any use of parent directory traversal ('..').
 */
export function isSafeRelativePath(p) {
  if (typeof p !== 'string' || !p.trim()) return false;
  if (p.includes('\0')) return false;
  if (path.isAbsolute(p) || p.startsWith('/') || p.startsWith('\\')) return false;
  const normalized = path.normalize(p);
  if (normalized === '..' || normalized.startsWith('..' + path.sep) || normalized.includes(path.sep + '..' + path.sep) || normalized.endsWith(path.sep + '..')) return false;
  return true;
}

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

  if (manifest.use_cases !== undefined) {
    if (!Array.isArray(manifest.use_cases)) {
      errors.push("'use_cases' must be an array of kebab-case strings");
    } else {
      for (const u of manifest.use_cases) {
        if (typeof u !== 'string' || !USE_CASE_PATTERN.test(u)) {
          errors.push(`Invalid use case '${u}': must be kebab-case`);
        }
      }
    }
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
        if (!t || !t.intent || !t.schedule) {
          errors.push("Each task must define 'intent' and 'schedule'");
          continue;
        }
        if (!isCronExpression(t.schedule)) {
          errors.push(`Task '${t.intent}' has an invalid schedule '${t.schedule}': expected 5-field cron`);
        }
        // A task is a plugin CLI subcommand run on a schedule. Without a
        // command and a handler there is nothing to run, and a task that is
        // displayed but never executes is worse than no task.
        if (!t.command || typeof t.command !== 'string') {
          errors.push(`Task '${t.intent}' must define 'command' (the plugin CLI subcommand to run)`);
        }
        if (!manifest.cli?.handler) {
          errors.push(`Task '${t.intent}' requires 'cli.handler' to run its command`);
        }
      }
    }
  }

  if (manifest.cli?.handler && !isSafeRelativePath(manifest.cli.handler)) {
    errors.push("cli.handler must be a safe relative path without directory traversal");
  }

  if (manifest.compile?.generator && !isSafeRelativePath(manifest.compile.generator)) {
    errors.push("compile.generator must be a safe relative path without directory traversal");
  }

  if (manifest.deploy !== undefined) {
    if (typeof manifest.deploy !== 'object' || manifest.deploy === null) {
      errors.push("'deploy' must be an object");
    } else {
      if (manifest.deploy.targets !== undefined) {
        if (!Array.isArray(manifest.deploy.targets) || manifest.deploy.targets.length === 0) {
          errors.push("'deploy.targets' must be a non-empty array of target names");
        } else {
          for (const t of manifest.deploy.targets) {
            if (typeof t !== 'string' || !t.trim()) {
              errors.push(`Invalid deploy target '${t}': must be a non-empty string`);
            }
          }
        }
      }
      if (manifest.deploy.required_ssss_version !== undefined) {
        if (typeof manifest.deploy.required_ssss_version !== 'string' || !manifest.deploy.required_ssss_version.trim()) {
          errors.push("'deploy.required_ssss_version' must be a non-empty string");
        }
      }
      if (manifest.deploy.access_grants !== undefined) {
        if (!Array.isArray(manifest.deploy.access_grants)) {
          errors.push("'deploy.access_grants' must be an array of permission strings");
        } else {
          const GRANT_PATTERN = /^[a-z0-9_-]+(:[a-z0-9_*-]+)*$/;
          for (const g of manifest.deploy.access_grants) {
            if (typeof g !== 'string' || !GRANT_PATTERN.test(g)) {
              errors.push(`Invalid access grant '${g}': must follow format domain:action (e.g. ssss:vault:read)`);
            }
          }
        }
      }
      if (manifest.deploy.adapter !== undefined) {
        if (typeof manifest.deploy.adapter !== 'string' || !manifest.deploy.adapter.trim()) {
          errors.push("'deploy.adapter' must be a non-empty string");
        }
      }
      if (manifest.deploy.resources !== undefined) {
        if (typeof manifest.deploy.resources !== 'object' || manifest.deploy.resources === null) {
          errors.push("'deploy.resources' must be an object");
        }
      }
    }
  }

  if (manifest.skills !== undefined) {
    if (!Array.isArray(manifest.skills)) {
      errors.push("'skills' must be an array");
    } else {
      for (const s of manifest.skills) {
        if (!s || typeof s !== 'object') {
          errors.push("Each entry in 'skills' must be an object");
          continue;
        }
        if (!s.id || typeof s.id !== 'string') {
          errors.push("Each skill entry must have a string 'id'");
        }
        if (!s.path || !isSafeRelativePath(s.path)) {
          errors.push(`Skill '${s.id || 'unknown'}' has invalid or unsafe 'path': must be safe relative path`);
        }
      }
    }
  }

  if (manifest.commands !== undefined) {
    if (!Array.isArray(manifest.commands)) {
      errors.push("'commands' must be an array");
    } else {
      for (const c of manifest.commands) {
        if (!c || typeof c !== 'object') {
          errors.push("Each entry in 'commands' must be an object");
          continue;
        }
        if (!c.name || typeof c.name !== 'string') {
          errors.push("Each command entry must have a string 'name'");
        }
        if (!c.handler || !isSafeRelativePath(c.handler)) {
          errors.push(`Command '${c.name || 'unknown'}' has invalid or unsafe 'handler': must be safe relative path`);
        }
      }
    }
  }

  if (manifest.ui !== undefined) {
    if (typeof manifest.ui !== 'object' || manifest.ui === null) {
      errors.push("'ui' must be an object");
    } else {
      if (manifest.ui.design_tokens !== undefined && !isSafeRelativePath(manifest.ui.design_tokens)) {
        errors.push("'ui.design_tokens' must be a safe relative path");
      }
      if (manifest.ui.elements !== undefined && !Array.isArray(manifest.ui.elements)) {
        errors.push("'ui.elements' must be an array");
      }
    }
  }

  if (manifest.openwiki_hubs !== undefined) {
    if (!Array.isArray(manifest.openwiki_hubs)) {
      errors.push("'openwiki_hubs' must be an array");
    } else {
      for (const hub of manifest.openwiki_hubs) {
        if (!hub || !hub.path || !isSafeRelativePath(hub.path)) {
          errors.push("Each entry in 'openwiki_hubs' must have a safe relative 'path'");
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/** Read and validate every `<dir>/<name>/plugin.json` under one plugins directory. */
export function readPluginsDir(dir, scope) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    // Staging directories from an in-flight install are never plugins.
    if (entry.name.startsWith('.')) continue;
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const pluginDir = path.join(dir, entry.name);
    const manifestPath = path.join(pluginDir, 'plugin.json');
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const validation = validatePluginManifest(manifest);
      out.push({
        id: manifest.id || entry.name,
        manifest,
        dir: pluginDir,
        pluginsDir: dir,
        manifestPath,
        scope,
        linked: entry.isSymbolicLink(),
        valid: validation.valid,
        errors: validation.errors
      });
    } catch (err) {
      out.push({
        id: entry.name,
        manifest: {},
        dir: pluginDir,
        pluginsDir: dir,
        manifestPath,
        scope,
        linked: entry.isSymbolicLink(),
        valid: false,
        errors: [`JSON parse error: ${err.message}`]
      });
    }
  }
  return out;
}

/**
 * Discover installed plugins across project and global directories.
 * A project plugin shadows a global plugin with the same id.
 * @param {string} [projectRoot] - Current project root directory
 */
export function discoverPlugins(projectRoot = process.cwd()) {
  const seen = new Set();
  const plugins = [];
  const sources = [
    [projectPluginsDir(projectRoot), 'project'],
    [globalPluginsDir(), 'global']
  ];
  const visited = new Set();
  for (const [dir, scope] of sources) {
    const resolved = path.resolve(dir);
    // When the project *is* the home brain the two directories coincide.
    if (visited.has(resolved)) continue;
    visited.add(resolved);
    for (const p of readPluginsDir(dir, scope)) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      plugins.push(p);
    }
  }
  return plugins;
}

/** Plugins shipped inside the total-recall package, installable on any node. */
export function listBundledPlugins() {
  return readPluginsDir(bundledPluginsDir(), 'bundled');
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
  const resolvedProjectRoot = resolveProjectRoot(projectRoot, vaultDir);
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
