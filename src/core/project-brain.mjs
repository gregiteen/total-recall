/**
 * Ensure a repo has a complete Total Recall *project brain*
 * (not just skills folders).
 *
 * Layout:
 *   <repo>/.agent/skills/total-recall/   ← brain root
 *     memory-vault/{categories}/
 *     memory-inbox/{pending,conflicts}/
 *     memory-derived/
 *     sessions/
 *     scheduler/queue/
 *     openwiki/
 *     skills-registry/
 *     config/brain.json
 *   <repo>/.agent/skills/<user-skills>/  ← sibling agent skills
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

export const VAULT_CATEGORIES = Object.freeze([
  'invariants',
  'patterns',
  'anti-patterns',
  'preferences',
  'decisions',
  'concepts',
  'facts',
  'corrections',
  'lore',
]);

/**
 * @param {string} repoRoot
 * @returns {{ agentDir: string, brainDir: string, skillsDir: string }}
 */
export function resolveProjectBrainPaths(repoRoot) {
  const root = path.resolve(repoRoot);
  const agentDir = path.join(root, '.agent');
  const skillsDir = path.join(agentDir, 'skills');
  const brainDir = path.join(skillsDir, 'total-recall');
  return { agentDir, brainDir, skillsDir, repoRoot: root };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  }
  return false;
}

function copyDirMerge(src, dest) {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      n += copyDirMerge(from, to);
    } else if (!fs.existsSync(to)) {
      fs.copyFileSync(from, to);
      n++;
    }
  }
  return n;
}

/**
 * Seed openwiki pages (templates if packaged).
 */
export function ensureOpenWiki(brainDir) {
  const wikiDir = path.join(brainDir, 'openwiki');
  const created = ensureDir(wikiDir);
  const templateRoot = path.join(ROOT, 'templates', 'openwiki');
  let files = 0;
  if (fs.existsSync(templateRoot)) {
    files = copyDirMerge(templateRoot, wikiDir);
  } else {
    const pages = {
      'README.md': `# OpenWiki\n\nProject knowledge docs for this Total Recall brain.\n`,
      'memory.md': `# Memory\n\nUse \`npx total-recall remember\` / \`recall\` with --project.\n`,
      'skills.md': `# Skills\n\nUser skills: \`.agent/skills/<name>/SKILL.md\`.\n`,
      'ide.md': `# IDE\n\n\`npx total-recall connect <ide>\`\n`,
      'secrets.md': `# Secrets\n\nNever put secrets in openwiki or vault markdown.\n`,
    };
    for (const [name, body] of Object.entries(pages)) {
      const dest = path.join(wikiDir, name);
      if (!fs.existsSync(dest)) {
        fs.writeFileSync(dest, body);
        files++;
      }
    }
  }
  return { wikiDir, created, files_added: files };
}

/**
 * Ensure core total-recall skill package files exist (SKILL.md minimum).
 */
export function ensureCoreSkillPackage(brainDir) {
  const skillMd = path.join(brainDir, 'SKILL.md');
  if (fs.existsSync(skillMd)) return { seeded: false };
  const scaffold = path.join(ROOT, 'scaffold', '.agent', 'skills', 'total-recall');
  if (fs.existsSync(scaffold)) {
    copyDirMerge(scaffold, brainDir);
    return { seeded: true, from: 'scaffold' };
  }
  // Scaffold directory missing — warn and fall back to a minimal SKILL.md
  console.error('  ⚠️  project-brain: scaffold/.agent/skills/total-recall not found — seeding minimal SKILL.md');
  fs.writeFileSync(
    skillMd,
    `---
name: total-recall
description: "Use this skill to operate Total Recall — portable memory, instructions, openwiki, skill deploy, and secrets."
---

# Total Recall — Project Brain

This directory is a **project brain**. Use CLI:

\`\`\`bash
npx total-recall remember fact "..." --project
npx total-recall recall "..." --project
npx total-recall compile
npx total-recall dream
\`\`\`
`,
  );
  return { seeded: true, from: 'minimal' };
}

/**
 * Write/update brain.json identity for a project brain.
 */
export function writeBrainIdentity(brainDir, { name, role = 'project', tags = [] } = {}) {
  const configDir = path.join(brainDir, 'config');
  ensureDir(configDir);
  const brainJsonPath = path.join(configDir, 'brain.json');
  let current = {};
  if (fs.existsSync(brainJsonPath)) {
    try {
      current = JSON.parse(fs.readFileSync(brainJsonPath, 'utf8')) || {};
    } catch {
      current = {};
    }
  }
  const next = {
    ...current,
    name: name || current.name || path.basename(path.resolve(brainDir, '../../..')),
    role: 'project',
    layer: 'project',
    full_brain: true,
    tags: [...new Set([...(current.tags || []), ...tags, 'project-brain'])],
    updated_at: new Date().toISOString(),
    created_at: current.created_at || new Date().toISOString(),
  };
  fs.writeFileSync(brainJsonPath, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
  return next;
}

/**
 * Ensure a full project brain under repoRoot/.agent/skills/total-recall/.
 *
 * @param {string} repoRoot
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @param {string[]} [opts.tags]
 * @param {string} [opts.globalBrainDir] - for project-registry registration
 * @param {boolean} [opts.register=true]
 */
export function ensureFullProjectBrain(repoRoot, opts = {}) {
  const { agentDir, brainDir, skillsDir } = resolveProjectBrainPaths(repoRoot);
  const name = opts.name || path.basename(path.resolve(repoRoot));
  const tags = opts.tags || [];
  const created = [];

  if (ensureDir(agentDir)) created.push('agentDir');
  if (ensureDir(skillsDir)) created.push('skillsDir');
  if (ensureDir(brainDir)) created.push('brainDir');

  const dataDirs = [
    path.join(brainDir, 'memory-derived'),
    path.join(brainDir, 'memory-inbox', 'pending'),
    path.join(brainDir, 'memory-inbox', 'conflicts'),
    path.join(brainDir, 'memory-inbox', 'capture'),
    path.join(brainDir, 'sessions'),
    path.join(brainDir, 'scheduler', 'queue'),
    path.join(brainDir, 'skills-registry'),
    path.join(brainDir, 'config'),
    path.join(brainDir, 'logs'),
    ...VAULT_CATEGORIES.map((c) => path.join(brainDir, 'memory-vault', c)),
  ];
  let dirsCreated = 0;
  for (const d of dataDirs) {
    if (ensureDir(d)) dirsCreated++;
  }

  const core = ensureCoreSkillPackage(brainDir);
  const wiki = ensureOpenWiki(brainDir);
  const identity = writeBrainIdentity(brainDir, { name, tags });

  // Empty skills registry if missing
  const regPath = path.join(brainDir, 'skills-registry', 'index.yaml');
  if (!fs.existsSync(regPath)) {
    fs.writeFileSync(
      regPath,
      YAML.stringify({
        version: 1,
        updated_at: new Date().toISOString(),
        skills: {},
        installs: [],
      }),
    );
  }

  let registry = null;
  if (opts.register !== false) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const gBrain =
      opts.globalBrainDir || path.join(home, '.agent', 'skills', 'total-recall');
    registry = registerProjectBrain(gBrain, {
      name,
      path: path.resolve(repoRoot),
      brainDir,
      tags: [...tags, 'full-brain', 'project-brain'],
    });
  }

  return {
    repoRoot: path.resolve(repoRoot),
    agentDir,
    brainDir,
    skillsDir,
    full_brain: true,
    identity,
    openwiki: wiki,
    core,
    dirs_created: dirsCreated,
    created_top: created,
    registry,
  };
}

/**
 * Register (or update) a project brain in global config/project-registry.json.
 */
export function registerProjectBrain(globalBrainDir, entry) {
  const registryPath = path.join(globalBrainDir, 'config', 'project-registry.json');
  ensureDir(path.dirname(registryPath));
  let list = [];
  if (fs.existsSync(registryPath)) {
    try {
      list = JSON.parse(fs.readFileSync(registryPath, 'utf8')) || [];
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) list = [];

  const abs = path.resolve(entry.path);
  const idx = list.findIndex((p) => path.resolve(p.path || '') === abs);
  const now = new Date().toISOString();
  const row = {
    name: entry.name,
    path: abs,
    brainDir: entry.brainDir,
    full_brain: true,
    layer: 'project',
    tags: entry.tags || ['project-brain'],
    registered_at: idx >= 0 ? list[idx].registered_at || now : now,
    last_compiled: entry.last_compiled || list[idx]?.last_compiled || null,
    updated_at: now,
  };
  if (idx >= 0) list[idx] = { ...list[idx], ...row };
  else list.push(row);
  fs.writeFileSync(registryPath, JSON.stringify(list, null, 2));
  return row;
}

/**
 * Ensure a path is a full project brain and register it.
 * Requires an explicit repoRoot — no hardcoded product repos (open-source safe).
 */
export function ensureAndRegisterProjectBrain(opts = {}) {
  const repoRoot = opts.repoRoot;
  if (!repoRoot) {
    return {
      ok: false,
      error:
        'repoRoot required. Example: total-recall brain ensure /path/to/your/project',
    };
  }
  if (!fs.existsSync(repoRoot)) {
    return {
      ok: false,
      error: `Project path not found: ${repoRoot}`,
    };
  }

  const name = opts.name || path.basename(path.resolve(repoRoot));
  const result = ensureFullProjectBrain(repoRoot, {
    name,
    tags: [...(opts.tags || []), 'full-brain'],
    globalBrainDir: opts.globalBrainDir,
    register: true,
  });

  return { ok: true, ...result };
}

/**
 * Quick health check: is this path a full project brain?
 */
export function inspectProjectBrain(repoRoot) {
  const { brainDir, skillsDir } = resolveProjectBrainPaths(repoRoot);
  const checks = {
    brainDir: fs.existsSync(brainDir),
    skillMd: fs.existsSync(path.join(brainDir, 'SKILL.md')),
    memoryVault: fs.existsSync(path.join(brainDir, 'memory-vault')),
    openwiki: fs.existsSync(path.join(brainDir, 'openwiki')),
    sessions: fs.existsSync(path.join(brainDir, 'sessions')),
    scheduler: fs.existsSync(path.join(brainDir, 'scheduler')),
    skillsRegistry: fs.existsSync(path.join(brainDir, 'skills-registry')),
    config: fs.existsSync(path.join(brainDir, 'config')),
    siblingSkills: fs.existsSync(skillsDir),
  };
  const brainJsonPath = path.join(brainDir, 'config', 'brain.json');
  let identity = null;
  if (fs.existsSync(brainJsonPath)) {
    try {
      identity = JSON.parse(fs.readFileSync(brainJsonPath, 'utf8'));
    } catch {}
  }
  const complete = Object.values(checks).every(Boolean);
  return {
    repoRoot: path.resolve(repoRoot),
    brainDir,
    checks,
    complete,
    full_brain: Boolean(identity?.full_brain) || complete,
    identity,
  };
}
