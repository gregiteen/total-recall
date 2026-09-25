import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  discoverRepoSkills,
  projectSkillsAsCommands,
  detectActiveSkillTargets,
  projectSkillsForScope,
  PROJECTION_MARKER_FILE
} from './skill-projection.mjs';

/** Resolve a link the way the OS does: relative to the link's own directory. */
function linkTarget(linkPath) {
  return path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath));
}

let tmp;

function seedSkill(root, name, description = 'desc') {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: "${description}"\n---\n\nBody for ${name}.\n`,
    'utf8'
  );
  return dir;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-skillproj-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('discoverRepoSkills', () => {
  it('finds skills in .agent/skills, repo skills/, and sibling .agents/skills', () => {
    const agentDir = path.join(tmp, '.agent');
    seedSkill(path.join(agentDir, 'skills'), 'alpha');
    seedSkill(path.join(tmp, 'skills'), 'gamma');
    seedSkill(path.join(tmp, '.agents', 'skills'), 'beta');

    const names = discoverRepoSkills(agentDir).map(s => s.name).sort();
    expect(names).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('canonical .agent/skills wins a name collision with .agents/skills', () => {
    const agentDir = path.join(tmp, '.agent');
    const canonical = seedSkill(path.join(agentDir, 'skills'), 'dup', 'canonical');
    seedSkill(path.join(tmp, '.agents', 'skills'), 'dup', 'plural');

    const found = discoverRepoSkills(agentDir).filter(s => s.name === 'dup');
    expect(found).toHaveLength(1);
    expect(path.resolve(found[0].skillDir)).toBe(path.resolve(canonical));
  });

  it('ignores directories without a SKILL.md', () => {
    const agentDir = path.join(tmp, '.agent');
    fs.mkdirSync(path.join(agentDir, 'skills', 'not-a-skill'), { recursive: true });
    expect(discoverRepoSkills(agentDir)).toHaveLength(0);
  });
});

describe('projectSkillsAsCommands', () => {
  it('symlinks each skill and is idempotent', () => {
    const src = path.join(tmp, 'src');
    const dest = path.join(tmp, 'dest');
    const a = seedSkill(src, 'a');
    const skills = [{ name: 'a', skillDir: a }];

    const first = projectSkillsAsCommands(dest, skills, {});
    expect(first).toEqual([{ name: 'a', action: 'linked' }]);
    expect(fs.lstatSync(path.join(dest, 'a')).isSymbolicLink()).toBe(true);

    const second = projectSkillsAsCommands(dest, skills, {});
    expect(second).toEqual([{ name: 'a', action: 'exists' }]);
  });

  it('self-heals a broken/stale symlink without --force', () => {
    const src = path.join(tmp, 'src');
    const dest = path.join(tmp, 'dest');
    const a = seedSkill(src, 'a');
    fs.mkdirSync(dest, { recursive: true });
    fs.symlinkSync('/nonexistent/old/a', path.join(dest, 'a'));

    projectSkillsAsCommands(dest, [{ name: 'a', skillDir: a }], {});
    expect(linkTarget(path.join(dest, 'a'))).toBe(path.resolve(a));
  });

  it('writes links RELATIVE to the destination so a clone or moved checkout still resolves', () => {
    const src = path.join(tmp, 'repo', '.agent', 'skills');
    const dest = path.join(tmp, 'repo', '.claude', 'skills');
    const a = seedSkill(src, 'push');

    projectSkillsAsCommands(dest, [{ name: 'push', skillDir: a }], {});
    const raw = fs.readlinkSync(path.join(dest, 'push'));
    if (process.platform !== 'win32') {
      expect(path.isAbsolute(raw)).toBe(false);
      expect(raw).toBe(path.join('..', '..', '.agent', 'skills', 'push'));
    }
    expect(fs.existsSync(path.join(dest, 'push', 'SKILL.md'))).toBe(true);

    // The whole repo moves (clone on another machine): the link must still work.
    const moved = path.join(tmp, 'elsewhere');
    fs.renameSync(path.join(tmp, 'repo'), moved);
    expect(fs.existsSync(path.join(moved, '.claude', 'skills', 'push', 'SKILL.md'))).toBe(true);
  });

  it('COPIES the skill when the filesystem refuses symlinks, and refreshes that copy next run', () => {
    const src = path.join(tmp, 'src');
    const dest = path.join(tmp, 'dest');
    const a = seedSkill(src, 'a', 'v1');
    const eperm = Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
    const spy = vi.spyOn(fs, 'symlinkSync').mockImplementation(() => { throw eperm; });
    try {
      const first = projectSkillsAsCommands(dest, [{ name: 'a', skillDir: a }], {});
      expect(first).toEqual([{ name: 'a', action: 'copied' }]);
      const copied = path.join(dest, 'a');
      expect(fs.lstatSync(copied).isSymbolicLink()).toBe(false);
      expect(fs.readFileSync(path.join(copied, 'SKILL.md'), 'utf8')).toContain('v1');
      expect(fs.existsSync(path.join(copied, PROJECTION_MARKER_FILE))).toBe(true);

      // Source changes → the projected copy is TR's own output, so it is refreshed
      // without --force instead of being protected like a user-authored skill.
      fs.writeFileSync(path.join(a, 'SKILL.md'), '---\nname: a\ndescription: "v2"\n---\n', 'utf8');
      const second = projectSkillsAsCommands(dest, [{ name: 'a', skillDir: a }], {});
      expect(second).toEqual([{ name: 'a', action: 'copied' }]);
      expect(fs.readFileSync(path.join(copied, 'SKILL.md'), 'utf8')).toContain('v2');
    } finally {
      spy.mockRestore();
    }
  });

  it('rethrows unexpected symlink failures instead of silently copying', () => {
    const src = path.join(tmp, 'src');
    const dest = path.join(tmp, 'dest');
    const a = seedSkill(src, 'a');
    const boom = Object.assign(new Error('disk on fire'), { code: 'EIO' });
    const spy = vi.spyOn(fs, 'symlinkSync').mockImplementation(() => { throw boom; });
    try {
      expect(() => projectSkillsAsCommands(dest, [{ name: 'a', skillDir: a }], {})).toThrow('disk on fire');
    } finally {
      spy.mockRestore();
    }
  });

  it('never clobbers a real user dir without --force (user skill wins)', () => {
    const src = path.join(tmp, 'src');
    const dest = path.join(tmp, 'dest');
    const a = seedSkill(src, 'a');
    const userOwned = seedSkill(dest, 'a', 'user-owned'); // real dir at dest/a

    const res = projectSkillsAsCommands(dest, [{ name: 'a', skillDir: a }], {});
    expect(res).toEqual([{ name: 'a', action: 'skipped' }]);
    expect(fs.lstatSync(userOwned).isDirectory()).toBe(true);
    expect(fs.lstatSync(userOwned).isSymbolicLink()).toBe(false);
  });

  it('heals a real dir at dest that is stale auto-generated tool output', () => {
    const src = path.join(tmp, 'src');
    const dest = path.join(tmp, 'dest');
    const a = seedSkill(src, 'repo-expert', 'canonical, correct-repo content');
    const staleDir = path.join(dest, 'repo-expert');
    fs.mkdirSync(staleDir, { recursive: true });
    fs.writeFileSync(
      path.join(staleDir, 'SKILL.md'),
      '---\nname: repo-expert\n---\n\n> **Auto-generated** by `npx total-recall skill generate-expert`. Regenerate anytime to stay current.\n\nWrong content, left over from a different repoRoot.\n',
      'utf8'
    );

    const res = projectSkillsAsCommands(dest, [{ name: 'repo-expert', skillDir: a }], {});
    expect(res).toEqual([{ name: 'repo-expert', action: 'linked' }]);
    expect(fs.lstatSync(staleDir).isSymbolicLink()).toBe(true);
    expect(linkTarget(staleDir)).toBe(path.resolve(a));
  });

  it('leaves a skill alone when its source already is the destination', () => {
    const root = path.join(tmp, '.agents', 'skills');
    const a = seedSkill(root, 'a');
    const res = projectSkillsAsCommands(root, [{ name: 'a', skillDir: a }], {});
    expect(res).toEqual([{ name: 'a', action: 'source' }]);
  });
});

describe('detectActiveSkillTargets (project scope)', () => {
  it('activates Claude Code when .claude/ marker exists', () => {
    fs.mkdirSync(path.join(tmp, '.claude'), { recursive: true });
    const t = detectActiveSkillTargets({ scope: 'project', cwd: tmp, env: {} });
    const claude = t.find(x => x.id === 'claude-code');
    expect(claude.active).toBe(true);
    expect(claude.destDir).toBe(path.join(tmp, '.claude', 'skills'));
  });

  it('activates Claude Code via env even without a marker dir', () => {
    const t = detectActiveSkillTargets({ scope: 'project', cwd: tmp, env: { CLAUDECODE: '1' } });
    expect(t.find(x => x.id === 'claude-code').active).toBe(true);
  });

  it('activates Antigravity/Gemini when .agents/ marker exists', () => {
    fs.mkdirSync(path.join(tmp, '.agents'), { recursive: true });
    const t = detectActiveSkillTargets({ scope: 'project', cwd: tmp, env: {} });
    expect(t.find(x => x.id === 'agents').active).toBe(true);
  });

  it('activates Codex project skills when AGENTS.md is present', () => {
    fs.writeFileSync(path.join(tmp, 'AGENTS.md'), '# Instructions\n');
    const t = detectActiveSkillTargets({ scope: 'project', cwd: tmp, env: {} });
    const codex = t.find(x => x.id === 'codex');
    expect(codex.supported).toBe(true);
    expect(codex.active).toBe(true);
    expect(codex.destDir).toBe(path.join(tmp, '.agents', 'skills'));
  });

  it('activates Hermes Agent when .hermes/ marker exists', () => {
    fs.mkdirSync(path.join(tmp, '.hermes'), { recursive: true });
    const t = detectActiveSkillTargets({ scope: 'project', cwd: tmp, env: {} });
    const hermes = t.find(x => x.id === 'hermes');
    expect(hermes.active).toBe(true);
    expect(hermes.destDir).toBe(path.join(tmp, '.hermes', 'skills'));
  });

  it('activates DeepSeek Harness when .dsh/ marker exists', () => {
    fs.mkdirSync(path.join(tmp, '.dsh'), { recursive: true });
    const t = detectActiveSkillTargets({ scope: 'project', cwd: tmp, env: {} });
    const dsh = t.find(x => x.id === 'dsh');
    expect(dsh.active).toBe(true);
    expect(dsh.destDir).toBe(path.join(tmp, '.agents', 'skills'));
  });

  it('inactive when no markers and no env', () => {
    const t = detectActiveSkillTargets({ scope: 'project', cwd: tmp, env: {} });
    expect(t.find(x => x.id === 'claude-code').active).toBe(false);
    expect(t.find(x => x.id === 'agents').active).toBe(false);
    expect(t.find(x => x.id === 'hermes').active).toBe(false);
    expect(t.find(x => x.id === 'dsh').active).toBe(false);
  });
});

describe('projectSkillsForScope (project scope)', () => {
  it('wires only in-use IDEs and lists the rest as available', () => {
    const agentDir = path.join(tmp, '.agent');
    seedSkill(path.join(agentDir, 'skills'), 'okf');
    fs.mkdirSync(path.join(tmp, '.claude'), { recursive: true }); // claude in use, agents not

    const { skills, wired, available } = projectSkillsForScope({
      scope: 'project', cwd: tmp, agentDir, env: {}
    });

    expect(skills.map(s => s.name)).toEqual(['okf']);
    expect(wired.map(w => w.id)).toEqual(['claude-code']);
    expect(fs.lstatSync(path.join(tmp, '.claude', 'skills', 'okf')).isSymbolicLink()).toBe(true);
    // agents supported-but-inactive → advertised as opt-in
    expect(available.map(a => a.id)).toContain('agents');
    // nothing projected into .agents
    expect(fs.existsSync(path.join(tmp, '.agents', 'skills', 'okf'))).toBe(false);
  });

  it('wires nothing when no IDE is in use', () => {
    const agentDir = path.join(tmp, '.agent');
    seedSkill(path.join(agentDir, 'skills'), 'okf');
    const { wired } = projectSkillsForScope({ scope: 'project', cwd: tmp, agentDir, env: {} });
    expect(wired).toHaveLength(0);
  });

  it('projects repo skills into Codex project scope without touching global skills', () => {
    const agentDir = path.join(tmp, '.agent');
    const local = seedSkill(path.join(agentDir, 'skills'), 'local');
    const packageSkill = seedSkill(path.join(tmp, 'skills'), 'package-skill');
    fs.writeFileSync(path.join(tmp, 'AGENTS.md'), '# Instructions\n');

    const { wired } = projectSkillsForScope({ scope: 'project', cwd: tmp, agentDir, env: {} });

    expect(wired.map(w => w.id)).toContain('codex');
    for (const [name, source] of [['local', local], ['package-skill', packageSkill]]) {
      const link = path.join(tmp, '.agents', 'skills', name);
      expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
      expect(linkTarget(link)).toBe(source);
    }
  });
});
