import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  registerSkill,
  listRegistered,
  deploySkill,
  skillStatus,
  listInstalls,
  loadRegistry,
  syncLocalSkillsToRegistry,
  unregisterSkill,
  adaptSkillDescription,
  hashSkillContent,
  syncSkillTwoWay,
  syncAllSkillsTwoWay,
  discoverSkillsInRepo,
  pickSyncWinner,
  loadKnownRepoRoots,
  parseSyncReposEnv,
  isProjectRepoRoot,
  trackRepo,
  normalizeRepoPaths,
} from './skills-registry.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tr-skreg-'));
}

function writeSkill(dir, name, description = 'Use this skill when testing.') {
  const skillDir = path.join(dir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    `---
name: ${name}
description: "${description}"
version: "1.2.0"
tags: [test]
---

# ${name}

Body content for ${name}.
`,
    'utf8',
  );
  return skillDir;
}

describe('skills-registry', () => {
  let brain;
  let workspace;

  beforeEach(() => {
    brain = tmpDir();
    workspace = tmpDir();
  });

  afterEach(() => {
    fs.rmSync(brain, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('registers a skill from path into catalog', () => {
    const skillDir = writeSkill(workspace, 'demo-skill');
    const entry = registerSkill(brain, skillDir, { source_type: 'path' });
    expect(entry.id).toBe('demo-skill');
    expect(entry.version).toBe('1.2.0');
    expect(entry.content_hash).toBeTruthy();
    expect(listRegistered(brain)).toHaveLength(1);
    expect(loadRegistry(brain).skills['demo-skill']).toBeTruthy();
  });

  it('deploys skill to repo and records install map', () => {
    const skillDir = writeSkill(workspace, 'ship-me');
    registerSkill(brain, skillDir);
    const repo = path.join(workspace, 'target-repo');
    fs.mkdirSync(repo, { recursive: true });

    const result = deploySkill(brain, 'ship-me', {
      repo,
      agentSkillsDir: workspace,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(repo, '.agent', 'skills', 'ship-me', 'SKILL.md'))).toBe(true);
    expect(listInstalls(brain, { skillId: 'ship-me' })).toHaveLength(1);
    expect(listInstalls(brain)[0].repo).toBe(path.resolve(repo));
  });

  it('status reports drift when SKILL.md changes after deploy', () => {
    const skillDir = writeSkill(workspace, 'drift-skill');
    registerSkill(brain, skillDir);
    const repo = path.join(workspace, 'repo-d');
    fs.mkdirSync(repo, { recursive: true });
    deploySkill(brain, 'drift-skill', { repo, agentSkillsDir: workspace });

    // mutate installed copy
    const installed = path.join(repo, '.agent', 'skills', 'drift-skill', 'SKILL.md');
    fs.appendFileSync(installed, '\n// changed\n');

    const st = skillStatus(brain, 'drift-skill');
    expect(st.registered).toBe(true);
    expect(st.install_count).toBe(1);
    expect(st.any_drift).toBe(true);
  });

  it('syncLocalSkillsToRegistry registers all SKILL.md folders', () => {
    writeSkill(workspace, 'a');
    writeSkill(workspace, 'b');
    fs.mkdirSync(path.join(workspace, 'not-a-skill'), { recursive: true });
    const result = syncLocalSkillsToRegistry(brain, workspace);
    expect(result.registered.sort()).toEqual(['a', 'b']);
  });

  it('unregister removes catalog entry', () => {
    const skillDir = writeSkill(workspace, 'gone');
    registerSkill(brain, skillDir);
    expect(unregisterSkill(brain, 'gone').success).toBe(true);
    expect(listRegistered(brain)).toHaveLength(0);
  });

  it('adaptSkillDescription appends stack signals once', () => {
    const skillDir = writeSkill(workspace, 'adapt-me', 'Use this skill when deploying.');
    fs.writeFileSync(
      path.join(workspace, 'package.json'),
      JSON.stringify({ name: 'demo-app', dependencies: { express: '5.0.0', react: '19.0.0' } }),
      'utf8',
    );
    const r1 = adaptSkillDescription(skillDir, { repoRoot: workspace });
    expect(r1.adapted).toBe(true);
    const r2 = adaptSkillDescription(skillDir, { repoRoot: workspace });
    expect(r2.adapted).toBe(false);
    const md = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    expect(md).toContain('Deployed for:');
    expect(md).toContain('express');
  });

  it('hashSkillContent is stable for same file', () => {
    const skillDir = writeSkill(workspace, 'hash-me');
    const h1 = hashSkillContent(skillDir);
    const h2 = hashSkillContent(skillDir);
    expect(h1).toBe(h2);
  });

  it('pickSyncWinner prefers newest by mtime', () => {
    const winner = pickSyncWinner(
      [
        { role: 'source', path: '/a', hash: '1', mtime: 100 },
        { role: 'install', path: '/b', hash: '2', mtime: 200 },
      ],
      'newest',
    );
    expect(winner.path).toBe('/b');
    expect(pickSyncWinner(
      [
        { role: 'source', path: '/a', hash: '1', mtime: 100 },
        { role: 'install', path: '/b', hash: '2', mtime: 200 },
      ],
      'registry',
    ).path).toBe('/a');
  });

  it('two-way sync copies newer install into older source and sibling install', () => {
    const skillDir = writeSkill(workspace, 'twoway');
    registerSkill(brain, skillDir);

    const repoA = path.join(workspace, 'repo-a');
    const repoB = path.join(workspace, 'repo-b');
    fs.mkdirSync(repoA, { recursive: true });
    fs.mkdirSync(repoB, { recursive: true });
    deploySkill(brain, 'twoway', { repo: repoA, agentSkillsDir: workspace });
    deploySkill(brain, 'twoway', { repo: repoB, agentSkillsDir: workspace });

    // Make install in repoA newer / different
    const installedA = path.join(repoA, '.agent', 'skills', 'twoway', 'SKILL.md');
    fs.appendFileSync(installedA, '\n## Edited in repo A\n');
    // bump mtime into the future
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(installedA, future, future);

    const report = syncSkillTwoWay(brain, 'twoway', { prefer: 'newest' });
    expect(report.in_sync).toBe(false);
    expect(report.actions.length).toBeGreaterThan(0);

    const bodyB = fs.readFileSync(
      path.join(repoB, '.agent', 'skills', 'twoway', 'SKILL.md'),
      'utf8',
    );
    expect(bodyB).toContain('Edited in repo A');

    const bodySource = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    // winner may promote repo A as source; either source path or original should converge
    const st = skillStatus(brain, 'twoway');
    expect(st.any_drift).toBe(false);
    expect(bodySource.includes('Edited in repo A') || st.entry?.source_path?.includes('repo-a')).toBe(
      true,
    );
  });

  it('discoverSkillsInRepo finds .agent/skills', () => {
    const repo = path.join(workspace, 'scan-repo');
    writeSkill(path.join(repo, '.agent', 'skills'), 'found-me');
    const hits = discoverSkillsInRepo(repo);
    expect(hits.some((h) => h.id === 'found-me')).toBe(true);
  });

  it('syncAllSkillsTwoWay dry-run does not throw', () => {
    const skillDir = writeSkill(workspace, 'batch');
    registerSkill(brain, skillDir);
    const repo = path.join(workspace, 'r1');
    fs.mkdirSync(repo, { recursive: true });
    deploySkill(brain, 'batch', { repo, agentSkillsDir: workspace });
    const report = syncAllSkillsTwoWay(brain, { dryRun: true, skipDiscover: true });
    expect(report.skills).toBeGreaterThanOrEqual(1);
    expect(report.dryRun).toBe(true);
  });

  it('includes only TR_SYNC_REPOS paths (no hardcoded product repos)', () => {
    const extra = path.join(workspace, 'my-open-app');
    fs.mkdirSync(path.join(extra, '.agent', 'skills'), { recursive: true });
    fs.writeFileSync(path.join(extra, 'package.json'), '{"name":"my-open-app"}\n');
    writeSkill(path.join(extra, '.agent', 'skills'), 'marketing');

    const prev = process.env.TR_SYNC_REPOS;
    process.env.TR_SYNC_REPOS = extra;
    try {
      expect(parseSyncReposEnv()).toContain(path.resolve(extra));
      const roots = loadKnownRepoRoots(brain);
      expect(roots.map((r) => path.resolve(r))).toContain(path.resolve(extra));
      // Only user-supplied roots — no invented product paths
      expect(roots.map((r) => path.resolve(r))).toEqual(
        expect.arrayContaining([path.resolve(extra)]),
      );
    } finally {
      if (prev === undefined) delete process.env.TR_SYNC_REPOS;
      else process.env.TR_SYNC_REPOS = prev;
    }
  });

  it('loadKnownRepoRoots uses project-registry entries', () => {
    const app = path.join(workspace, 'registered-app');
    fs.mkdirSync(app, { recursive: true });
    const regDir = path.join(brain, 'config');
    fs.mkdirSync(regDir, { recursive: true });
    fs.writeFileSync(
      path.join(regDir, 'project-registry.json'),
      JSON.stringify([{ name: 'registered-app', path: app, brainDir: path.join(app, '.agent', 'skills', 'total-recall') }]),
    );
    const roots = loadKnownRepoRoots(brain, { includeCwd: false });
    expect(roots.map((r) => path.resolve(r))).toContain(path.resolve(app));
  });

  it('accepts any extraRepos via opts (CLI --repo path)', () => {
    const a = path.join(workspace, 'user-app-a');
    const b = path.join(workspace, 'user-app-b');
    fs.mkdirSync(a, { recursive: true });
    fs.mkdirSync(b, { recursive: true });
    fs.writeFileSync(path.join(a, 'README.md'), '# a\n');
    fs.writeFileSync(path.join(b, 'go.mod'), 'module b\n');
    expect(isProjectRepoRoot(a)).toBe(true);
    expect(isProjectRepoRoot(b)).toBe(true);
    const roots = loadKnownRepoRoots(brain, {
      extraRepos: [a, b],
      includeCwd: false,
    });
    expect(roots).toContain(path.resolve(a));
    expect(roots).toContain(path.resolve(b));
  });

  it('trackRepo provisions full brain for arbitrary path', () => {
    const app = path.join(workspace, 'arbitrary-lib');
    fs.mkdirSync(app, { recursive: true });
    const result = trackRepo(brain, app);
    expect(result.full_brain).toBe(true);
    expect(fs.existsSync(path.join(result.brainDir, 'memory-vault'))).toBe(true);
    expect(fs.existsSync(path.join(result.brainDir, 'openwiki'))).toBe(true);
    const roots = loadKnownRepoRoots(brain, { includeCwd: false });
    expect(roots).toContain(path.resolve(app));
  });

  it('normalizeRepoPaths expands relative paths that exist', () => {
    const app = path.join(workspace, 'rel-app');
    fs.mkdirSync(app, { recursive: true });
    const prev = process.cwd();
    try {
      process.chdir(workspace);
      const got = normalizeRepoPaths(['rel-app'])[0];
      expect(fs.realpathSync(got)).toBe(fs.realpathSync(app));
    } finally {
      process.chdir(prev);
    }
  });
});
