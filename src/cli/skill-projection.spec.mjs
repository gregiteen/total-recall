import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  discoverRepoSkills,
  projectSkillsAsCommands,
  detectActiveSkillTargets,
  projectSkillsForScope
} from './skill-projection.mjs';

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
  it('finds skills in .agent/skills (canonical) and sibling .agents/skills (plural)', () => {
    const agentDir = path.join(tmp, '.agent');
    seedSkill(path.join(agentDir, 'skills'), 'alpha');
    seedSkill(path.join(tmp, '.agents', 'skills'), 'beta');

    const names = discoverRepoSkills(agentDir).map(s => s.name).sort();
    expect(names).toEqual(['alpha', 'beta']);
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
    expect(path.resolve(fs.readlinkSync(path.join(dest, 'a')))).toBe(path.resolve(a));
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
    expect(path.resolve(fs.readlinkSync(staleDir))).toBe(path.resolve(a));
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

  it('Codex is unsupported for project scope (global-only)', () => {
    const t = detectActiveSkillTargets({ scope: 'project', cwd: tmp, env: {} });
    const codex = t.find(x => x.id === 'codex');
    expect(codex.supported).toBe(false);
    expect(codex.active).toBe(false);
  });

  it('inactive when no markers and no env', () => {
    const t = detectActiveSkillTargets({ scope: 'project', cwd: tmp, env: {} });
    expect(t.find(x => x.id === 'claude-code').active).toBe(false);
    expect(t.find(x => x.id === 'agents').active).toBe(false);
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
});
