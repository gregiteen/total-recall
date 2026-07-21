/**
 * Scope-aware skill → slash-command projection.
 *
 * A "repo skill" is any <skills-root>/<name>/SKILL.md directory (the Agent
 * Skills standard). Each IDE turns such a directory into a /<name> slash
 * command, but every IDE looks in a *different* place, and the right place
 * depends on the *scope* of the skill:
 *
 *   PROJECT skills (authored in <repo>/.agent/skills or <repo>/.agents/skills)
 *     → project into the *repo's* IDE skill dirs, and only for IDEs actually
 *       in use in this repo (project marker dir present, or current process is
 *       that IDE). They belong to this repo, not the whole machine.
 *
 *   GLOBAL skills (authored in ~/.agent/skills)
 *     → project into each IDE's *global* skill dir, for IDEs installed on this
 *       machine. They are available in every repo.
 *
 * This mirrors the brain model: `init --project` ⇒ project skills; `init`
 * (global) ⇒ global skills. Codex has no project-local skills dir (it only
 * reads ~/.codex/skills globally), so it participates in GLOBAL projection only;
 * pushing project skills to Codex is opt-in via `connect codex`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * IDE skill descriptors. Each IDE declares how it is detected and where its
 * skills live, per scope:
 *   project: { dir, markers, env }  — repo-relative dest; detected by repo
 *            marker dirs or current-process env vars. null ⇒ no project skills.
 *   global:  { dir, markers }       — home-relative dest; detected by home
 *            marker dirs (i.e. the IDE is installed). null ⇒ no global skills.
 */
export const IDE_SKILLS = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    clients: ['claude-code'],
    project: { dir: ['.claude', 'skills'], markers: ['.claude'], env: ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT'] },
    global:  { dir: ['.claude', 'skills'], markers: ['.claude'] }
  },
  {
    id: 'agents',
    label: 'Antigravity / Gemini',
    clients: ['antigravity', 'gemini'],
    // Antigravity & Gemini both read <repo>/.agents/skills as the workspace
    // Agent-Skills location. Their *global* surface is ~/.gemini/commands
    // (markdown commands), wired by the slash-command writer, not here.
    project: { dir: ['.agents', 'skills'], markers: ['.agents', '.gemini'], env: ['ANTIGRAVITY', 'GEMINI_CLI'] },
    global:  null
  },
  {
    id: 'codex',
    label: 'Codex',
    clients: ['codex'],
    // Codex only discovers skills globally under ~/.codex/skills. There is no
    // project-local dir, so project skills are opt-in (namespaced) via connect.
    project: null,
    global:  { dir: ['.codex', 'skills'], markers: ['.codex'] }
  }
];

function pathExists(filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
}

// Marker written by tools like repo-expert-generate.mjs into any SKILL.md
// they produce. A real (non-symlink) directory carrying this marker is
// leftover tool output, not a user's hand-authored skill — it is always safe
// to heal back onto the canonical source, even without --force.
const AUTO_GENERATED_MARKER = '**Auto-generated** by `npx total-recall';

function isStaleGeneratedDir(entryPath) {
  try {
    if (!fs.statSync(entryPath).isDirectory()) return false;
    const content = fs.readFileSync(path.join(entryPath, 'SKILL.md'), 'utf8');
    return content.includes(AUTO_GENERATED_MARKER);
  } catch {
    return false;
  }
}

/**
 * Skill source roots, in priority order. The canonical Total Recall location
 * (.agent/skills, singular) wins, but we also scan the Antigravity-native
 * .agents/skills (plural) so a skill authored in either place is discovered.
 */
export function skillSourceRoots(agentDir) {
  const roots = [path.join(agentDir, 'skills')];
  const parent = path.dirname(agentDir);
  if (path.basename(agentDir) === '.agent') {
    roots.push(path.join(parent, '.agents', 'skills'));
  }
  return roots;
}

/**
 * Discover repo skills to expose as slash commands.
 * Every <root>/<name>/ directory containing a SKILL.md is a skill. When the
 * same name appears in more than one source root, the canonical root wins.
 */
export function discoverRepoSkills(agentDir) {
  const seen = new Map();
  for (const skillsRoot of skillSourceRoots(agentDir)) {
    if (!fs.existsSync(skillsRoot)) continue;
    let entries;
    try {
      entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (seen.has(entry.name)) continue;
      const skillDir = path.join(skillsRoot, entry.name);
      if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) continue;
      seen.set(entry.name, { name: entry.name, skillDir });
    }
  }
  return [...seen.values()];
}

/**
 * Symlink each discovered skill dir into one IDE's Agent-Skills directory.
 * Idempotent, self-healing, and strictly additive: a symlink that is broken or
 * stale is refreshed even without --force; a *real* (non-symlink) entry is
 * never clobbered unless --force (so a user's own skill always wins a name
 * collision) — UNLESS that real entry is itself stale tool output (carries
 * the auto-generated marker), in which case it is healed back onto the
 * canonical source; a skill whose source already *is* the destination is
 * left alone.
 */
export function projectSkillsAsCommands(destDir, skills, opts = {}) {
  fs.mkdirSync(destDir, { recursive: true });
  const written = [];
  for (const skill of skills) {
    const linkPath = path.join(destDir, skill.name);
    const wantTarget = path.resolve(skill.skillDir);

    if (path.resolve(linkPath) === wantTarget) {
      written.push({ name: skill.name, action: 'source' });
      continue;
    }

    if (pathExists(linkPath)) {
      const stat = fs.lstatSync(linkPath);
      if (stat.isSymbolicLink()) {
        const current = path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath));
        if (current === wantTarget && fs.existsSync(linkPath) && !opts.force) {
          written.push({ name: skill.name, action: 'exists' });
          continue;
        }
        fs.unlinkSync(linkPath); // stale, broken, or --force → refresh
      } else if (!opts.force && !isStaleGeneratedDir(linkPath)) {
        written.push({ name: skill.name, action: 'skipped' }); // user's real file/dir wins
        continue;
      } else {
        fs.rmSync(linkPath, { recursive: true, force: true });
      }
    }
    fs.symlinkSync(skill.skillDir, linkPath);
    written.push({ name: skill.name, action: 'linked' });
  }
  return written;
}

/**
 * Is an IDE target active for the given scope?
 *   project → repo has a marker dir, or the current process is this IDE (env)
 *   global  → the IDE is installed (home marker dir present)
 */
function isTargetActive(target, scope, cwd, env) {
  const spec = target[scope];
  if (!spec) return false;
  if (scope === 'project') {
    if ((spec.markers || []).some(m => pathExists(path.join(cwd, m)))) return true;
    if ((spec.env || []).some(v => env[v] != null && env[v] !== '')) return true;
    return false;
  }
  // global
  return (spec.markers || []).some(m => pathExists(path.join(os.homedir(), m)));
}

/**
 * Resolve which IDE targets are active (and where they project to) for a scope.
 * Returns every target annotated with { active, destDir } so callers can both
 * wire the active ones and advertise the inactive ones as opt-in.
 */
export function detectActiveSkillTargets({ scope, cwd = process.cwd(), env = process.env }) {
  return IDE_SKILLS.map(target => {
    const spec = target[scope];
    const active = isTargetActive(target, scope, cwd, env);
    let destDir = null;
    if (spec) {
      destDir = scope === 'global'
        ? path.join(os.homedir(), ...spec.dir)
        : path.join(cwd, ...spec.dir);
    }
    return { id: target.id, label: target.label, clients: target.clients, scope, supported: !!spec, active, destDir };
  });
}

/**
 * Project discovered skills into every *active* IDE skill dir for one scope.
 * Used by `init`: project skills on `init --project`, global skills on `init`.
 *
 * @returns {{ scope, skills, wired: Array, available: Array }}
 *   wired     — targets we projected into (active + supported)
 *   available — supported-but-inactive targets, surfaced as opt-in `connect`
 */
export function projectSkillsForScope({ scope, cwd = process.cwd(), agentDir, opts = {}, env = process.env }) {
  const skills = discoverRepoSkills(agentDir);
  const targets = detectActiveSkillTargets({ scope, cwd, env });
  const wired = [];
  const available = [];

  for (const target of targets) {
    if (!target.supported) continue;
    if (target.active && skills.length > 0) {
      const results = projectSkillsAsCommands(target.destDir, skills, opts);
      wired.push({ ...target, results });
    } else if (!target.active) {
      available.push(target);
    }
  }
  return { scope, skills, wired, available };
}
