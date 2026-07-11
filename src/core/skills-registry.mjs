/**
 * Global skills registry + cross-repo install map.
 *
 * SSOT: <brain>/skills-registry/index.yaml
 * Deploy copies a registered skill into a target repo's .agent/skills/<id>/.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import YAML from 'yaml';
import matter from 'gray-matter';
import { ensureFullProjectBrain } from './project-brain.mjs';

export const REGISTRY_VERSION = 1;

/**
 * @param {string} brainDir
 * @returns {string}
 */
export function resolveRegistryDir(brainDir) {
  return path.join(brainDir, 'skills-registry');
}

/**
 * @param {string} brainDir
 * @returns {string}
 */
export function resolveRegistryPath(brainDir) {
  return path.join(resolveRegistryDir(brainDir), 'index.yaml');
}

/**
 * Empty registry document.
 */
export function emptyRegistry() {
  return {
    version: REGISTRY_VERSION,
    updated_at: new Date().toISOString(),
    skills: {},
    installs: [],
  };
}

/**
 * Load registry from disk (or empty).
 * @param {string} brainDir
 */
export function loadRegistry(brainDir) {
  const filePath = resolveRegistryPath(brainDir);
  if (!fs.existsSync(filePath)) {
    return emptyRegistry();
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = YAML.parse(raw) || {};
    return {
      version: data.version || REGISTRY_VERSION,
      updated_at: data.updated_at || null,
      skills: data.skills && typeof data.skills === 'object' ? data.skills : {},
      installs: Array.isArray(data.installs) ? data.installs : [],
    };
  } catch (err) {
    throw new Error(`Failed to load skills registry: ${err.message}`);
  }
}

/**
 * Persist registry atomically.
 * @param {string} brainDir
 * @param {object} registry
 */
export function saveRegistry(brainDir, registry) {
  const dir = resolveRegistryDir(brainDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = resolveRegistryPath(brainDir);
  const doc = {
    ...registry,
    version: REGISTRY_VERSION,
    updated_at: new Date().toISOString(),
  };
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, YAML.stringify(doc), 'utf8');
  fs.renameSync(tmp, filePath);
  return filePath;
}

/**
 * Hash SKILL.md (or whole skill marker file) for drift detection.
 */
export function hashSkillContent(skillDir) {
  const skillMd = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) return null;
  const buf = fs.readFileSync(skillMd);
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

/**
 * Read skill metadata from a local skill directory.
 */
export function readSkillMeta(skillDir) {
  const skillMd = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) {
    throw new Error(`No SKILL.md in ${skillDir}`);
  }
  const raw = fs.readFileSync(skillMd, 'utf8');
  const { data, content } = matter(raw);
  const id =
    data.name ||
    data.slug ||
    path.basename(path.resolve(skillDir));
  return {
    id: String(id).replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase(),
    title: data.title || data.name || id,
    description: data.description || content.slice(0, 200).trim(),
    version: String(data.version || data.schema_version || '0.0.0'),
    tags: Array.isArray(data.tags) ? data.tags : [],
    content_hash: hashSkillContent(skillDir),
    source_path: path.resolve(skillDir),
  };
}

/**
 * Register (or update) a skill in the global registry from a local path.
 *
 * @param {string} brainDir
 * @param {string} skillPath - path to skill folder containing SKILL.md
 * @param {object} [opts]
 * @param {string} [opts.source] - original package source string
 * @param {string} [opts.source_type] - local|registry|path
 * @param {string[]} [opts.tags]
 */
export function registerSkill(brainDir, skillPath, opts = {}) {
  const abs = path.resolve(skillPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error(`Skill path not found: ${abs}`);
  }
  const meta = readSkillMeta(abs);
  const registry = loadRegistry(brainDir);
  const prev = registry.skills[meta.id] || {};
  registry.skills[meta.id] = {
    id: meta.id,
    title: meta.title,
    description: meta.description,
    version: meta.version,
    tags: opts.tags || meta.tags || prev.tags || [],
    source: opts.source || prev.source || abs,
    source_type: opts.source_type || prev.source_type || 'local',
    source_path: abs,
    content_hash: meta.content_hash,
    registered_at: prev.registered_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  saveRegistry(brainDir, registry);
  return registry.skills[meta.id];
}

/**
 * Unregister a skill id (does not delete install copies).
 */
export function unregisterSkill(brainDir, skillId) {
  const registry = loadRegistry(brainDir);
  if (!registry.skills[skillId]) {
    return { success: false, error: `Skill not in registry: ${skillId}` };
  }
  delete registry.skills[skillId];
  registry.installs = registry.installs.filter((i) => i.skill_id !== skillId);
  saveRegistry(brainDir, registry);
  return { success: true, skillId };
}

/**
 * List registry skills (catalog), not filesystem installs.
 */
export function listRegistered(brainDir) {
  const registry = loadRegistry(brainDir);
  return Object.values(registry.skills).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * List install map entries, optionally filtered.
 */
export function listInstalls(brainDir, { skillId = null, repo = null } = {}) {
  const registry = loadRegistry(brainDir);
  let installs = [...registry.installs];
  if (skillId) installs = installs.filter((i) => i.skill_id === skillId);
  if (repo) {
    const r = path.resolve(repo);
    installs = installs.filter((i) => path.resolve(i.repo || i.path) === r || String(i.path).startsWith(r));
  }
  return installs;
}

/**
 * Recursive copy of skill directory (skip node_modules, .git).
 */
export function copySkillDir(src, dest) {
  if (!fs.existsSync(src)) throw new Error(`Source missing: ${src}`);
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === '.DS_Store') continue;
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      copySkillDir(from, to);
    } else if (ent.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

/**
 * Optional adapt: rewrite SKILL.md description using openwiki + package.json stack signals.
 */
export function adaptSkillDescription(skillDir, { repoRoot, openwikiDir } = {}) {
  const skillMd = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) return { adapted: false, reason: 'no SKILL.md' };

  const signals = [];
  const pkgPath = repoRoot ? path.join(repoRoot, 'package.json') : null;
  if (pkgPath && fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name) signals.push(`repo package: ${pkg.name}`);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const keys = Object.keys(deps || {}).slice(0, 12);
      if (keys.length) signals.push(`stack: ${keys.join(', ')}`);
    } catch {}
  }

  if (openwikiDir && fs.existsSync(openwikiDir)) {
    try {
      const pages = fs
        .readdirSync(openwikiDir)
        .filter((f) => f.endsWith('.md'))
        .slice(0, 5);
      if (pages.length) signals.push(`openwiki: ${pages.map((p) => p.replace(/\.md$/, '')).join(', ')}`);
    } catch {}
  }

  if (!signals.length) return { adapted: false, reason: 'no signals' };

  const raw = fs.readFileSync(skillMd, 'utf8');
  const { data, content } = matter(raw);
  const note = ` [Deployed for: ${signals.join(' | ')}]`;
  const desc = String(data.description || '');
  if (desc.includes('[Deployed for:')) {
    return { adapted: false, reason: 'already adapted' };
  }
  data.description = (desc + note).slice(0, 500);
  const out = matter.stringify(content, data);
  fs.writeFileSync(skillMd, out, 'utf8');
  return { adapted: true, signals };
}

/**
 * Resolve source skill directory from registry id or local path.
 */
export function resolveSkillSource(brainDir, skillIdOrPath, agentSkillsDir) {
  // Absolute or relative path with SKILL.md
  const asPath = path.resolve(skillIdOrPath);
  if (fs.existsSync(path.join(asPath, 'SKILL.md'))) {
    return { id: path.basename(asPath), sourcePath: asPath, from: 'path' };
  }

  // Local agent skills
  if (agentSkillsDir) {
    const local = path.join(agentSkillsDir, skillIdOrPath);
    if (fs.existsSync(path.join(local, 'SKILL.md'))) {
      return { id: skillIdOrPath, sourcePath: local, from: 'agent-skills' };
    }
  }

  // Registry entry
  const registry = loadRegistry(brainDir);
  const entry = registry.skills[skillIdOrPath];
  if (entry?.source_path && fs.existsSync(path.join(entry.source_path, 'SKILL.md'))) {
    return { id: entry.id, sourcePath: entry.source_path, from: 'registry', entry };
  }

  throw new Error(
    `Skill not found: ${skillIdOrPath}. Register with: total-recall skill register <path>`,
  );
}

/**
 * Deploy a skill into a target repo.
 *
 * @param {string} brainDir - brain holding the registry
 * @param {string} skillIdOrPath
 * @param {object} opts
 * @param {string} [opts.repo=process.cwd()] - target repository root
 * @param {string} [opts.agentSkillsDir] - source skills dir on current agent
 * @param {boolean} [opts.adapt=false]
 * @param {boolean} [opts.force=false]
 */
export function deploySkill(brainDir, skillIdOrPath, opts = {}) {
  const repoRoot = path.resolve(opts.repo || process.cwd());
  const destSkills = path.join(repoRoot, '.agent', 'skills');
  const resolved = resolveSkillSource(brainDir, skillIdOrPath, opts.agentSkillsDir);
  const destDir = path.join(destSkills, resolved.id);

  if (fs.existsSync(destDir) && !opts.force) {
    // allow overwrite with force; default overwrite content but keep note
  }

  fs.mkdirSync(destSkills, { recursive: true });
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  copySkillDir(resolved.sourcePath, destDir);

  let adaptResult = { adapted: false };
  if (opts.adapt) {
    const openwikiDir =
      opts.openwikiDir ||
      path.join(repoRoot, '.agent', 'skills', 'total-recall', 'openwiki') ||
      path.join(repoRoot, 'openwiki');
    const ow = fs.existsSync(openwikiDir) ? openwikiDir : path.join(repoRoot, 'openwiki');
    adaptResult = adaptSkillDescription(destDir, {
      repoRoot,
      openwikiDir: fs.existsSync(ow) ? ow : null,
    });
  }

  // Ensure registered
  let entry;
  try {
    entry = registerSkill(brainDir, resolved.sourcePath, {
      source: resolved.entry?.source || resolved.sourcePath,
      source_type: resolved.from === 'registry' ? resolved.entry?.source_type || 'local' : resolved.from,
    });
  } catch {
    entry = loadRegistry(brainDir).skills[resolved.id];
  }

  const contentHash = hashSkillContent(destDir);
  const install = {
    skill_id: resolved.id,
    path: destDir,
    repo: repoRoot,
    version: entry?.version || readSkillMeta(destDir).version,
    content_hash: contentHash,
    registry_hash: entry?.content_hash || null,
    adapted: Boolean(adaptResult.adapted),
    installed_at: new Date().toISOString(),
  };

  const registry = loadRegistry(brainDir);
  // Replace prior install for same skill+repo
  registry.installs = registry.installs.filter(
    (i) => !(i.skill_id === install.skill_id && path.resolve(i.repo || '') === repoRoot),
  );
  registry.installs.push(install);
  if (registry.skills[resolved.id]) {
    registry.skills[resolved.id].content_hash = entry?.content_hash || registry.skills[resolved.id].content_hash;
  }
  saveRegistry(brainDir, registry);

  return {
    success: true,
    skillId: resolved.id,
    destDir,
    install,
    adapt: adaptResult,
  };
}

/**
 * Status of a skill: registry entry + installs + drift.
 */
export function skillStatus(brainDir, skillId) {
  const registry = loadRegistry(brainDir);
  const entry = registry.skills[skillId] || null;
  const installs = registry.installs.filter((i) => i.skill_id === skillId);

  const installDetails = installs.map((inst) => {
    const exists = fs.existsSync(path.join(inst.path, 'SKILL.md'));
    const liveHash = exists ? hashSkillContent(inst.path) : null;
    const drift =
      exists && entry?.content_hash
        ? liveHash !== entry.content_hash
        : exists && inst.registry_hash
          ? liveHash !== inst.registry_hash
          : false;
    return {
      ...inst,
      exists,
      live_hash: liveHash,
      drift,
    };
  });

  // Local brain skills dir presence
  let localPath = null;
  if (entry?.source_path && fs.existsSync(entry.source_path)) {
    localPath = entry.source_path;
  }

  return {
    skillId,
    registered: Boolean(entry),
    entry,
    localPath,
    installs: installDetails,
    install_count: installDetails.length,
    any_drift: installDetails.some((i) => i.drift),
  };
}

/**
 * Scan agent skills dir and register any skill not yet in registry.
 */
export function syncLocalSkillsToRegistry(brainDir, agentSkillsDir) {
  if (!fs.existsSync(agentSkillsDir)) return { registered: [] };
  const registered = [];
  for (const name of fs.readdirSync(agentSkillsDir)) {
    const dir = path.join(agentSkillsDir, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    if (!fs.existsSync(path.join(dir, 'SKILL.md'))) continue;
    // skip total-recall modules path if mis-nested
    try {
      const entry = registerSkill(brainDir, dir, { source_type: 'local', source: dir });
      registered.push(entry.id);
    } catch {
      // skip invalid
    }
  }
  return { registered };
}

// ─── Two-way multi-repo sync ────────────────────────────────────────────────────

const SKILL_SCAN_REL = [
  path.join('.agent', 'skills'),
  path.join('.agents', 'skills'),
  path.join('.claude', 'skills'),
];

/**
 * Optional extra repo roots from env (open-source safe — no hardcoded paths).
 *
 * TR_SYNC_REPOS / TR_SKILL_SYNC_REPOS: colon- or comma-separated absolute/relative paths
 * Example: TR_SYNC_REPOS="$HOME/code/app1:$HOME/code/app2"
 */
export function parseSyncReposEnv(envValue = process.env.TR_SYNC_REPOS || process.env.TR_SKILL_SYNC_REPOS) {
  if (!envValue || !String(envValue).trim()) return [];
  return String(envValue)
    .split(/[,:]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p.startsWith('~') ? p.replace(/^~(?=$|[/\\])/, os.homedir()) : p))
    .filter((p) => fs.existsSync(p));
}

/**
 * True if dir looks like a user project repo we can attach a TR brain to.
 * Language-agnostic markers — any repo the user wants.
 */
export function isProjectRepoRoot(dir) {
  if (!dir || !fs.existsSync(dir)) return false;
  const abs = path.resolve(dir);
  if (abs === path.resolve(os.homedir()) || abs === path.parse(abs).root) return false;
  try {
    if (!fs.statSync(abs).isDirectory()) return false;
  } catch {
    return false;
  }
  const markers = [
    '.git',
    '.agent',
    'package.json',
    'Cargo.toml',
    'go.mod',
    'pyproject.toml',
    'requirements.txt',
    'composer.json',
    'Gemfile',
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    'Makefile',
    'CMakeLists.txt',
    'mix.exs',
    'deno.json',
    'deno.jsonc',
    'pnpm-workspace.yaml',
    'lerna.json',
    'README.md',
  ];
  return markers.some((m) => fs.existsSync(path.join(abs, m)));
}

/**
 * Normalize user-supplied repo paths (expand ~, resolve, must exist).
 * @param {string|string[]} paths
 * @returns {string[]}
 */
export function normalizeRepoPaths(paths) {
  const list = Array.isArray(paths) ? paths : paths ? [paths] : [];
  const out = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'string') continue;
    let p = raw.trim();
    if (!p) continue;
    if (p.startsWith('~/') || p === '~') {
      p = path.join(os.homedir(), p.slice(2));
    }
    const abs = path.resolve(p);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) out.push(abs);
  }
  return out;
}

/**
 * Project roots for multi-repo skill sync — works with **any** user-chosen repos.
 *
 * Sources (no product hardcoding):
 *  1. skills-registry install map
 *  2. global project-registry.json (`brain register <any-path>`)
 *  3. TR_SYNC_REPOS / TR_SKILL_SYNC_REPOS env
 *  4. opts.extraRepos (CLI `--repo` flags)
 *  5. process.cwd() when it looks like a project (unless includeCwd: false)
 *  6. parent of brainDir when it is a project checkout
 *
 * @param {string} brainDir
 * @param {{ extraRepos?: string[], includeCwd?: boolean }} [opts]
 * @returns {string[]} absolute repo roots
 */
export function loadKnownRepoRoots(brainDir, opts = {}) {
  const roots = new Set();
  const includeCwd = opts.includeCwd !== false;

  // Install map
  try {
    for (const inst of loadRegistry(brainDir).installs || []) {
      if (inst.repo && fs.existsSync(inst.repo)) roots.add(path.resolve(inst.repo));
    }
  } catch {}

  // brain register list: config/project-registry.json
  const registryPath = path.join(brainDir, 'config', 'project-registry.json');
  if (fs.existsSync(registryPath)) {
    try {
      const list = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      for (const p of list || []) {
        const root = p.path || p.root;
        if (root && fs.existsSync(root)) roots.add(path.resolve(root));
      }
    } catch {}
  }

  // Explicit env
  for (const p of parseSyncReposEnv()) {
    roots.add(p);
  }

  // One-shot / CLI --repo paths
  for (const p of normalizeRepoPaths(opts.extraRepos || [])) {
    roots.add(p);
  }

  // cwd: any user project they are currently in
  if (includeCwd) {
    const cwd = process.cwd();
    if (isProjectRepoRoot(cwd)) roots.add(path.resolve(cwd));
  }

  // Parent of brainDir if it looks like a project brain (.../repo/.agent/skills/total-recall)
  const maybeRepo = path.resolve(brainDir, '..', '..', '..');
  if (isProjectRepoRoot(maybeRepo)) {
    roots.add(maybeRepo);
  }

  return [...roots];
}

/**
 * Track any user repo: full project brain + project-registry entry.
 * This is the primary open-source path for "I want this repo in skill sync".
 */
export function trackRepo(brainDir, repoPath, opts = {}) {
  const roots = normalizeRepoPaths([repoPath]);
  if (!roots.length) {
    throw new Error(`Not a directory: ${repoPath}`);
  }
  const repo = roots[0];
  const name = opts.name || path.basename(repo);
  const result = ensureFullProjectBrain(repo, {
    name,
    tags: [...(opts.tags || []), 'user-repo', 'full-brain', 'project-brain'],
    globalBrainDir: brainDir,
    register: true,
  });
  return result;
}

/**
 * Ensure every known registered project still has a full brain layout.
 * Generic — no special-cased product repos.
 */
export function ensureRegisteredProjectBrains(brainDir, opts = {}) {
  const results = [];
  for (const repo of loadKnownRepoRoots(brainDir, opts)) {
    try {
      const name = path.basename(repo);
      const r = ensureFullProjectBrain(repo, {
        name,
        tags: ['project-brain', 'full-brain', 'user-repo'],
        globalBrainDir: brainDir,
        register: true,
      });
      results.push({ repo, ok: true, brainDir: r.brainDir });
    } catch (err) {
      results.push({ repo, ok: false, error: err.message });
    }
  }
  return results;
}

/**
 * Find skill directories under a repo root.
 * @returns {{ id: string, path: string, repo: string }[]}
 */
export function discoverSkillsInRepo(repoRoot) {
  const found = [];
  const root = path.resolve(repoRoot);
  for (const rel of SKILL_SCAN_REL) {
    const base = path.join(root, rel);
    if (!fs.existsSync(base)) continue;
    let names = [];
    try {
      names = fs.readdirSync(base);
    } catch {
      continue;
    }
    for (const name of names) {
      const dir = path.join(base, name);
      try {
        if (!fs.statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }
      if (!fs.existsSync(path.join(dir, 'SKILL.md'))) continue;
      found.push({ id: name, path: dir, repo: root });
    }
  }
  return found;
}

/**
 * Discover skills across all known repos; register + ensure install map rows.
 * @returns {{ discovered: number, registered: string[], installs_added: number, repos: number }}
 */
export function discoverAllSkills(
  brainDir,
  { includeCore = false, ensureBrains = false, extraRepos = [], includeCwd = true, registerExtra = false } = {},
) {
  const rootOpts = { extraRepos, includeCwd };

  // Permanently track --repo paths when requested
  if (registerExtra) {
    for (const repo of normalizeRepoPaths(extraRepos)) {
      try {
        trackRepo(brainDir, repo);
      } catch {
        // continue
      }
    }
  }

  // Optionally repair full-brain layout for known repos
  if (ensureBrains) {
    try {
      ensureRegisteredProjectBrains(brainDir, rootOpts);
    } catch {
      // non-fatal
    }
  }

  const repos = loadKnownRepoRoots(brainDir, rootOpts);
  const registered = [];
  let installsAdded = 0;
  let discovered = 0;

  for (const repo of repos) {
    for (const hit of discoverSkillsInRepo(repo)) {
      if (!includeCore && hit.id === 'total-recall') continue;
      discovered++;
      try {
        registerSkill(brainDir, hit.path, {
          source: hit.path,
          source_type: 'discovered',
        });
        registered.push(hit.id);
      } catch {
        // invalid skill
        continue;
      }

      const registry = loadRegistry(brainDir);
      const exists = registry.installs.some(
        (i) => i.skill_id === hit.id && path.resolve(i.repo || '') === path.resolve(repo),
      );
      if (!exists) {
        const hash = hashSkillContent(hit.path);
        registry.installs.push({
          skill_id: hit.id,
          path: hit.path,
          repo,
          version: registry.skills[hit.id]?.version || '0.0.0',
          content_hash: hash,
          registry_hash: registry.skills[hit.id]?.content_hash || hash,
          adapted: false,
          installed_at: new Date().toISOString(),
          discovered: true,
        });
        saveRegistry(brainDir, registry);
        installsAdded++;
      }
    }
  }

  return {
    discovered,
    registered: [...new Set(registered)],
    installs_added: installsAdded,
    repos: repos.length,
  };
}

/**
 * mtime of SKILL.md (ms) or 0.
 */
export function skillMtime(skillDir) {
  const p = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(p)) return 0;
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Copy skill tree from src → dest (replace).
 */
export function replaceSkillDir(src, dest, { dryRun = false } = {}) {
  if (dryRun) return { dryRun: true, src, dest };
  if (!fs.existsSync(src)) throw new Error(`Source missing: ${src}`);
  if (path.resolve(src) === path.resolve(dest)) return { skipped: true, reason: 'same-path' };
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  copySkillDir(src, dest);
  return { src, dest, ok: true };
}

/**
 * Collect all live locations for a skill: registry source + install map + re-scan.
 */
export function collectSkillLocations(brainDir, skillId) {
  const registry = loadRegistry(brainDir);
  const entry = registry.skills[skillId];
  const locations = [];

  if (entry?.source_path && fs.existsSync(path.join(entry.source_path, 'SKILL.md'))) {
    locations.push({
      role: 'source',
      path: entry.source_path,
      repo: path.resolve(entry.source_path, '..', '..', '..'),
      hash: hashSkillContent(entry.source_path),
      mtime: skillMtime(entry.source_path),
    });
  }

  for (const inst of registry.installs.filter((i) => i.skill_id === skillId)) {
    if (!fs.existsSync(path.join(inst.path, 'SKILL.md'))) continue;
    // skip duplicate of source
    if (locations.some((l) => path.resolve(l.path) === path.resolve(inst.path))) continue;
    locations.push({
      role: 'install',
      path: inst.path,
      repo: inst.repo,
      hash: hashSkillContent(inst.path),
      mtime: skillMtime(inst.path),
    });
  }

  // Also scan known repos for this skill id not yet mapped
  for (const repo of loadKnownRepoRoots(brainDir)) {
    for (const hit of discoverSkillsInRepo(repo)) {
      if (hit.id !== skillId) continue;
      if (locations.some((l) => path.resolve(l.path) === path.resolve(hit.path))) continue;
      locations.push({
        role: 'discovered',
        path: hit.path,
        repo: hit.repo,
        hash: hashSkillContent(hit.path),
        mtime: skillMtime(hit.path),
      });
    }
  }

  return { entry, locations };
}

/**
 * Choose winning location among candidates.
 * @param {'newest'|'registry'|'install'} prefer
 */
export function pickSyncWinner(locations, prefer = 'newest') {
  if (!locations.length) return null;
  if (prefer === 'registry') {
    return locations.find((l) => l.role === 'source') || locations[0];
  }
  if (prefer === 'install') {
    const installs = locations.filter((l) => l.role !== 'source');
    if (!installs.length) return locations[0];
    return installs.sort((a, b) => b.mtime - a.mtime)[0];
  }
  // newest
  return [...locations].sort((a, b) => b.mtime - a.mtime || (a.role === 'source' ? -1 : 1))[0];
}

/**
 * Two-way sync one skill across all known copies.
 *
 * Strategy:
 *  1. Collect source + all installs (+ discovered)
 *  2. Pick winner by prefer (default: newest SKILL.md mtime)
 *  3. Copy winner → every other location
 *  4. Re-register source as catalog SSOT (winner becomes source_path if --promote-winner)
 *
 * @returns {object} report
 */
export function syncSkillTwoWay(brainDir, skillId, opts = {}) {
  const prefer = opts.prefer || 'newest';
  const dryRun = Boolean(opts.dryRun);
  const promoteWinner = opts.promoteWinner !== false; // default true: winner becomes catalog source
  const includeCore = Boolean(opts.includeCore);

  if (skillId === 'total-recall' && !includeCore) {
    return {
      skillId,
      skipped: true,
      reason: 'core skill total-recall skipped (pass includeCore to sync)',
    };
  }

  const { entry, locations } = collectSkillLocations(brainDir, skillId);
  if (!locations.length) {
    return { skillId, skipped: true, reason: 'no live copies found' };
  }

  const hashes = new Set(locations.map((l) => l.hash).filter(Boolean));
  if (hashes.size <= 1 && locations.length >= 1) {
    // already in sync — still refresh install map hashes
    if (!dryRun && entry) {
      const registry = loadRegistry(brainDir);
      if (registry.skills[skillId]) {
        registry.skills[skillId].content_hash = locations[0].hash;
        registry.skills[skillId].updated_at = new Date().toISOString();
      }
      for (const inst of registry.installs.filter((i) => i.skill_id === skillId)) {
        if (fs.existsSync(inst.path)) {
          inst.content_hash = hashSkillContent(inst.path);
          inst.registry_hash = locations[0].hash;
        }
      }
      saveRegistry(brainDir, registry);
    }
    return {
      skillId,
      in_sync: true,
      locations: locations.length,
      hash: locations[0].hash,
      actions: [],
    };
  }

  const winner = pickSyncWinner(locations, prefer);
  if (!winner) {
    return { skillId, error: 'no winner', locations };
  }

  const actions = [];
  for (const loc of locations) {
    if (path.resolve(loc.path) === path.resolve(winner.path)) continue;
    if (loc.hash === winner.hash) continue;
    actions.push({
      op: 'copy',
      from: winner.path,
      to: loc.path,
      role: loc.role,
    });
    if (!dryRun) {
      replaceSkillDir(winner.path, loc.path);
    }
  }

  // Catalog + install map
  if (!dryRun) {
    if (promoteWinner) {
      try {
        registerSkill(brainDir, winner.path, {
          source: winner.path,
          source_type: 'sync-winner',
        });
      } catch {}
    } else if (entry?.source_path && path.resolve(winner.path) !== path.resolve(entry.source_path)) {
      replaceSkillDir(winner.path, entry.source_path);
      try {
        registerSkill(brainDir, entry.source_path, {
          source: entry.source,
          source_type: entry.source_type || 'local',
        });
      } catch {}
    }

    const registry = loadRegistry(brainDir);
    const catalogHash =
      (registry.skills[skillId] && hashSkillContent(registry.skills[skillId].source_path || winner.path)) ||
      winner.hash;

    if (registry.skills[skillId]) {
      registry.skills[skillId].content_hash = catalogHash;
      registry.skills[skillId].updated_at = new Date().toISOString();
    }

    // Rebuild install rows for this skill from known locations
    registry.installs = registry.installs.filter((i) => i.skill_id !== skillId);
    const seenPaths = new Set();
    for (const loc of locations) {
      const abs = path.resolve(loc.path);
      if (seenPaths.has(abs)) continue;
      seenPaths.add(abs);
      if (!fs.existsSync(path.join(loc.path, 'SKILL.md'))) continue;
      const repo = loc.repo || path.resolve(loc.path, '..', '..', '..');
      registry.installs.push({
        skill_id: skillId,
        path: loc.path,
        repo,
        version: registry.skills[skillId]?.version || '0.0.0',
        content_hash: hashSkillContent(loc.path),
        registry_hash: catalogHash,
        adapted: false,
        installed_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      });
    }
    saveRegistry(brainDir, registry);
  }

  return {
    skillId,
    in_sync: false,
    winner: { path: winner.path, role: winner.role, hash: winner.hash, mtime: winner.mtime },
    prefer,
    locations: locations.length,
    actions,
    dryRun,
  };
}

/**
 * Discover + two-way sync all skills across all known repos.
 */
export function syncAllSkillsTwoWay(brainDir, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const prefer = opts.prefer || 'newest';
  const includeCore = Boolean(opts.includeCore);
  const extraRepos = opts.extraRepos || [];
  const includeCwd = opts.includeCwd !== false;
  const registerExtra = Boolean(opts.registerExtra);
  const rootOpts = { extraRepos, includeCwd };

  const discovery = opts.skipDiscover
    ? {
        discovered: 0,
        registered: [],
        installs_added: 0,
        repos: loadKnownRepoRoots(brainDir, rootOpts).length,
      }
    : discoverAllSkills(brainDir, {
        includeCore,
        ensureBrains: Boolean(opts.ensureBrains),
        extraRepos,
        includeCwd,
        registerExtra,
      });

  const registry = loadRegistry(brainDir);
  const skillIds = new Set([
    ...Object.keys(registry.skills || {}),
    ...registry.installs.map((i) => i.skill_id),
  ]);

  // Also pick up skill ids discovered under extra/cwd repos even if not in catalog yet
  for (const repo of loadKnownRepoRoots(brainDir, rootOpts)) {
    for (const hit of discoverSkillsInRepo(repo)) {
      if (hit.id !== 'total-recall' || includeCore) skillIds.add(hit.id);
    }
  }

  const results = [];
  for (const id of [...skillIds].sort()) {
    if (id === 'total-recall' && !includeCore) {
      results.push({ skillId: id, skipped: true, reason: 'core' });
      continue;
    }
    results.push(
      syncSkillTwoWay(brainDir, id, {
        prefer,
        dryRun,
        includeCore,
        promoteWinner: opts.promoteWinner,
      }),
    );
  }

  const copied = results.reduce((n, r) => n + (r.actions?.length || 0), 0);
  const conflicts = results.filter((r) => r.error);
  const synced = results.filter((r) => r.in_sync);
  const updated = results.filter((r) => r.actions?.length);

  return {
    discovery,
    prefer,
    dryRun,
    roots: loadKnownRepoRoots(brainDir, rootOpts),
    skills: results.length,
    already_in_sync: synced.length,
    updated: updated.length,
    copies: copied,
    conflicts: conflicts.length,
    results,
  };
}

/**
 * Push catalog source → all installs only (one-way).
 */
export function pushAllSkills(brainDir, opts = {}) {
  return syncAllSkillsTwoWay(brainDir, { ...opts, prefer: 'registry', skipDiscover: opts.skipDiscover });
}

/**
 * Pull newest install → source → push (prefer install then newest effectively).
 * prefer=install picks newest among installs only, then copies everywhere including source.
 */
export function pullAllSkills(brainDir, opts = {}) {
  return syncAllSkillsTwoWay(brainDir, { ...opts, prefer: 'install' });
}

/**
 * Default brain skills-registry path helper for tests.
 */
export function defaultBrainDir() {
  return process.env._TR_TEST_BRAIN_DIR || path.join(os.homedir(), '.agent', 'skills', 'total-recall');
}
