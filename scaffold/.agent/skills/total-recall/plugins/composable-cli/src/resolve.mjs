/**
 * Command Resolution — scope search, shadow detection, group scope
 *
 * Resolution order for `total-recall <verb>`:
 * 1. Built-in (provided by the total-recall core)
 * 2. Project custom commands (<repo>/.agent/commands/)
 * 3. Group commands (resolved through project_group membership, nearest first)
 * 4. Global custom commands (~/.agent/commands/)
 * 5. VFS integration (<agentDir>/skills/total-recall/integrations/)
 * 6. Plugin manifests whose cli.command matches
 *
 * This module provides:
 * - Shadow detection: refuse built-in names, warn on scope shadowing
 * - Group scope search through project_group membership
 * - Full resolution with provenance
 */
import fs from 'node:fs';
import path from 'node:path';
import { builtinCommandNames } from './command.mjs';
import { EXIT_CODES } from './contract.mjs';

/**
 * Find all commands directories for scoped resolution.
 * Returns an ordered array of { scope, dir } objects.
 *
 * @param {object} [options]
 * @param {string} [options.cwd] - Current working directory (default: process.cwd())
 * @param {string[]} [options.groupDirs] - Optional group command directories
 * @returns {{ scope: string, dir: string }[]}
 */
export function getCommandTargets(options = {}) {
  const cwd = options.cwd || process.cwd();
  const targets = [];

  // Project scope
  const projectDir = path.join(cwd, '.agent', 'commands');
  if (fs.existsSync(projectDir)) {
    targets.push({ scope: 'project', dir: projectDir });
  }

  // Group scope (resolved from project_group documents)
  const groupDirs = options.groupDirs || resolveGroupDirs(cwd);
  for (const gd of groupDirs) {
    if (fs.existsSync(gd)) {
      targets.push({ scope: 'group', dir: gd });
    }
  }

  // Global scope
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir) {
    const globalDir = path.join(homeDir, '.agent', 'commands');
    if (fs.existsSync(globalDir)) {
      targets.push({ scope: 'global', dir: globalDir });
    }
  }

  return targets;
}

/**
 * Resolve group command directories from project_group documents.
 * Reads groups from ~/.agent/skills/total-recall/groups/
 * and finds groups that contain this project.
 *
 * @param {string} cwd - Current working directory
 * @returns {string[]} Array of group command directory paths
 */
export function resolveGroupDirs(cwd) {
  const dirs = [];
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) return dirs;

  const groupsDir = path.join(homeDir, '.agent', 'skills', 'total-recall', 'groups');
  if (!fs.existsSync(groupsDir)) return dirs;

  try {
    const projectBrainPath = path.join(cwd, '.agent', 'skills', 'total-recall', 'config', 'brain.json');
    let projectId = null;
    if (fs.existsSync(projectBrainPath)) {
      try {
        const brain = JSON.parse(fs.readFileSync(projectBrainPath, 'utf8'));
        projectId = brain.project_id;
      } catch { /* ignore */ }
    }

    const groupFiles = fs.readdirSync(groupsDir).filter((f) => f.endsWith('.md'));
    for (const gf of groupFiles) {
      try {
        const content = fs.readFileSync(path.join(groupsDir, gf), 'utf8');
        const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
        if (!frontmatter) continue;
        const yaml = frontmatter[1];
        // Simple YAML-like parsing for members
        const membersMatch = yaml.match(/members:\s*\[([^\]]*)\]/);
        if (!membersMatch) continue;

        const membersStr = membersMatch[1];
        // Check if this project is a member
        const isMember = projectId && membersStr.includes(projectId);

        if (isMember) {
          const groupCommandsDir = path.join(homeDir, '.agent', 'commands',
            'groups', gf.replace(/\.md$/, ''));
          dirs.push(groupCommandsDir);
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  return dirs;
}

/**
 * Detect whether a name shadows another command in the resolution chain.
 *
 * @param {string} name - Command name to check
 * @param {object} [options]
 * @param {boolean} [options.throwOnBuiltin=true] - Throw if name is a built-in
 * @returns {{ shadows: string|null, level: string|null }}
 *   shadows: the scope whose command of the same name would be shadowed (or null)
 *   level: 'builtin' | 'project' | 'group' | 'global' | null
 */
export function detectShadow(name, options = {}) {
  const { throwOnBuiltin = true } = options;
  const builtins = builtinCommandNames();

  // Check built-in (absolute refusal)
  if (builtins.has(name)) {
    if (throwOnBuiltin) {
      const err = new Error(`'${name}' is a built-in Total Recall command; a custom command with that name could never run.`);
      err.exitCode = EXIT_CODES.USAGE;
      throw err;
    }
    return { shadows: name, level: 'builtin' };
  }

  // Check project over group/global
  const targets = getCommandTargets();
  for (let i = 0; i < targets.length; i++) {
    const cmdPath = path.join(targets[i].dir, `${name}.mjs`);
    if (fs.existsSync(cmdPath)) {
      // This scope already has the command; if we're creating at a higher
      // priority scope, it shadows the lower one
      if (i > 0) {
        return { shadows: name, level: targets[i].scope };
      }
      // Same scope — already exists error, not shadowing
      return { shadows: null, level: null };
    }
  }

  return { shadows: null, level: null };
}

/**
 * Check whether a name would shadow and return a warning if appropriate.
 * Does not throw for built-ins (use detectShadow for that).
 *
 * @param {string} name - Command name to check
 * @returns {string|null} Warning message or null
 */
export function shadowWarning(name) {
  // Refuse built-in names with a clear error
  const builtins = builtinCommandNames();
  if (builtins.has(name)) {
    return `'${name}' is a built-in Total Recall command; a custom command with that name could never run.`;
  }

  const targets = getCommandTargets();
  let found = false;
  for (const t of targets) {
    const cmdPath = path.join(t.dir, `${name}.mjs`);
    if (fs.existsSync(cmdPath)) {
      if (!found) {
        found = true; // First one wins — no warning
      } else {
        return `Warning: '${name}' exists in scope '${t.scope}' but will be shadowed by a higher-priority scope.`;
      }
    }
  }
  return null;
}

/**
 * Resolve a verb through the full scope chain and return its path and source.
 *
 * @param {string} verb - Command name
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @returns {{ path: string|null, scope: string|null }}
 */
export function resolveCommand(verb, options = {}) {
  const cwd = options.cwd || process.cwd();

  // 1. Project
  const projectPath = path.join(cwd, '.agent', 'commands', `${verb}.mjs`);
  if (fs.existsSync(projectPath)) {
    return { path: projectPath, scope: 'project' };
  }

  // 2. Group (through membership)
  const groupDirs = resolveGroupDirs(cwd);
  for (const gd of groupDirs) {
    const groupPath = path.join(gd, `${verb}.mjs`);
    if (fs.existsSync(groupPath)) {
      return { path: groupPath, scope: 'group' };
    }
  }

  // 3. Global
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir) {
    const globalPath = path.join(homeDir, '.agent', 'commands', `${verb}.mjs`);
    if (fs.existsSync(globalPath)) {
      return { path: globalPath, scope: 'global' };
    }
  }

  return { path: null, scope: null };
}