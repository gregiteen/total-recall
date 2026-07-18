import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  registerSkill,
  listRegistered,
  deploySkill,
  replaceSkillDir,
  skillStatus,
  listInstalls,
  loadRegistry,
  syncLocalSkillsToRegistry,
  unregisterSkill,
  adaptSkillDescription,
  hashSkillContent,
  readSkillMeta,
  syncSkillTwoWay,
  syncAllSkillsTwoWay,
  discoverSkillsInRepo,
  discoverAllSkills,
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

  it('prefers the registered source over a stale local install during deploy', () => {
    const sourceRoot = path.join(workspace, 'catalog');
    const source = writeSkill(sourceRoot, 'catalog-wins');
    fs.appendFileSync(path.join(source, 'SKILL.md'), '\n## Canonical source\n');
    registerSkill(brain, source, { source_type: 'path' });

    const repo = path.join(workspace, 'target-repo');
    const localSkills = path.join(repo, '.agent', 'skills');
    const stale = writeSkill(localSkills, 'catalog-wins');
    fs.appendFileSync(path.join(stale, 'SKILL.md'), '\n## Stale install\n');

    deploySkill(brain, 'catalog-wins', {
      repo,
      agentSkillsDir: localSkills,
      force: true,
    });

    const deployed = fs.readFileSync(path.join(stale, 'SKILL.md'), 'utf8');
    expect(deployed).toContain('Canonical source');
    expect(deployed).not.toContain('Stale install');
    expect(loadRegistry(brain).skills['catalog-wins'].source_path).toBe(path.resolve(source));
  });

  it('does not delete a skill when deploy resolves the target as its own source', () => {
    const repo = path.join(workspace, 'same-source-repo');
    fs.mkdirSync(repo, { recursive: true });
    fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"same-source-repo"}\n');
    const skillsDir = path.join(repo, '.agent', 'skills');
    const skillDir = writeSkill(skillsDir, 'keep-me');
    const previous = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');

    const result = deploySkill(brain, 'keep-me', {
      repo,
      agentSkillsDir: skillsDir,
      force: true,
    });

    expect(result.success).toBe(true);
    expect(result.replacement).toMatchObject({ skipped: true, reason: 'same-path' });
    expect(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')).toBe(previous);
  });

  it('blocks repo-scoped skills from being deployed into another repository', () => {
    const repoA = path.join(workspace, 'scoped-source-repo');
    const repoB = path.join(workspace, 'scoped-target-repo');
    fs.mkdirSync(repoA, { recursive: true });
    fs.mkdirSync(repoB, { recursive: true });
    fs.writeFileSync(path.join(repoA, 'package.json'), '{"name":"scoped-source"}\n');
    const skillDir = writeSkill(path.join(repoA, '.agent', 'skills'), 'private-skill');
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: private-skill\ndescription: "Private."\nrepo_scoped: true\n---\n',
    );
    registerSkill(brain, skillDir);

    expect(() => deploySkill(brain, 'private-skill', { repo: repoB })).toThrow(
      'Refusing to deploy repo-scoped skill',
    );
    expect(fs.existsSync(path.join(repoB, '.agent', 'skills', 'private-skill'))).toBe(false);
  });

  it('keeps the installed skill intact when a replacement copy fails', () => {
    const source = writeSkill(workspace, 'source-skill');
    const destination = writeSkill(workspace, 'installed-skill');
    const previous = fs.readFileSync(path.join(destination, 'SKILL.md'), 'utf8');

    expect(() => replaceSkillDir(source, destination, {
      copyFn: () => { throw new Error('interrupted copy'); },
    })).toThrow('interrupted copy');

    expect(fs.readFileSync(path.join(destination, 'SKILL.md'), 'utf8')).toBe(previous);
    expect(fs.existsSync(destination)).toBe(true);
  });

  it('preserves destination-only files during replacement', () => {
    const source = writeSkill(path.join(workspace, 'source'), 'shared-skill');
    const destination = writeSkill(path.join(workspace, 'destination'), 'shared-skill');
    const localReference = path.join(destination, 'references', 'repo-only.md');
    fs.mkdirSync(path.dirname(localReference), { recursive: true });
    fs.writeFileSync(localReference, '# Repository-specific reference\n');
    fs.appendFileSync(path.join(source, 'SKILL.md'), '\n## Source update\n');

    replaceSkillDir(source, destination);

    expect(fs.readFileSync(path.join(destination, 'SKILL.md'), 'utf8')).toContain('Source update');
    expect(fs.readFileSync(localReference, 'utf8')).toContain('Repository-specific reference');
  });

  it('recognizes symlink aliases as the same physical skill', () => {
    if (process.platform === 'win32') return;
    const source = writeSkill(workspace, 'canonical-skill');
    const alias = path.join(workspace, 'skill-alias');
    fs.symlinkSync(source, alias);

    const result = replaceSkillDir(source, alias);

    expect(result).toMatchObject({ skipped: true, reason: 'same-path' });
    expect(fs.lstatSync(alias).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(source, 'SKILL.md'))).toBe(true);
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

  it('discovery records installs without replacing an existing catalog source', () => {
    const source = writeSkill(path.join(workspace, 'global-catalog'), 'stable-source');
    fs.appendFileSync(path.join(source, 'SKILL.md'), '\n## Catalog copy\n');
    registerSkill(brain, source, { source_type: 'path' });

    const repo = path.join(workspace, 'discovered-repo');
    fs.mkdirSync(repo, { recursive: true });
    fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"discovered-repo"}\n');
    const install = writeSkill(path.join(repo, '.agent', 'skills'), 'stable-source');
    fs.appendFileSync(path.join(install, 'SKILL.md'), '\n## Repo copy\n');

    const result = discoverAllSkills(brain, {
      extraRepos: [repo],
      includeCwd: false,
    });

    expect(result.discovered).toBe(1);
    expect(loadRegistry(brain).skills['stable-source'].source_path).toBe(path.resolve(source));
    expect(listInstalls(brain, { skillId: 'stable-source' })).toHaveLength(1);
  });

  it('deduplicates symlinked IDE surfaces that resolve to the same skill', () => {
    if (process.platform === 'win32') return;
    const repo = path.join(workspace, 'aliased-scan-repo');
    writeSkill(path.join(repo, '.agent', 'skills'), 'found-once');
    fs.mkdirSync(path.join(repo, '.agents'), { recursive: true });
    fs.symlinkSync('../.agent/skills', path.join(repo, '.agents', 'skills'));

    const hits = discoverSkillsInRepo(repo).filter((hit) => hit.id === 'found-once');

    expect(hits).toHaveLength(1);
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

  it('readSkillMeta returns repo_scoped: true when SKILL.md has repo_scoped: true', () => {
    const skillDir = path.join(workspace, 'scoped-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---\nname: scoped-skill\ndescription: "A repo-scoped skill."\nversion: "1.0.0"\nrepo_scoped: true\n---\n\n# Scoped\n`,
      'utf8',
    );
    const meta = readSkillMeta(skillDir);
    expect(meta.repo_scoped).toBe(true);
  });

  it('readSkillMeta returns repo_scoped: false when field is absent', () => {
    const skillDir = writeSkill(workspace, 'plain-skill');
    const meta = readSkillMeta(skillDir);
    expect(meta.repo_scoped).toBe(false);
  });

  it('keeps registry scoping fail-closed after an unscoped collision', () => {
    const scopedDir = writeSkill(path.join(workspace, 'scoped'), 'collision-skill');
    fs.writeFileSync(
      path.join(scopedDir, 'SKILL.md'),
      '---\nname: collision-skill\ndescription: "Scoped."\nrepo_scoped: true\n---\n',
    );
    const unscopedDir = writeSkill(path.join(workspace, 'unscoped'), 'collision-skill');

    registerSkill(brain, scopedDir);
    registerSkill(brain, unscopedDir);

    expect(loadRegistry(brain).skills['collision-skill'].repo_scoped).toBe(true);
  });

  it('skips repo-scoped skills when syncing a single skill directly', () => {
    const scopedDir = writeSkill(workspace, 'direct-scoped-skill');
    fs.writeFileSync(
      path.join(scopedDir, 'SKILL.md'),
      '---\nname: direct-scoped-skill\ndescription: "Scoped."\nrepo_scoped: true\n---\n',
    );
    registerSkill(brain, scopedDir);

    const report = syncSkillTwoWay(brain, 'direct-scoped-skill');

    expect(report).toMatchObject({ skipped: true, reason: 'repo_scoped' });
  });

  it('refuses to deploy an unflagged repo-owned catalog source into another repo', () => {
    const repoA = path.join(workspace, 'divergent-repo-a');
    const repoB = path.join(workspace, 'divergent-repo-b');
    for (const repo of [repoA, repoB]) {
      fs.mkdirSync(repo, { recursive: true });
      fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: path.basename(repo) }));
    }
    const skillA = writeSkill(path.join(repoA, '.agent', 'skills'), 'shared-name');
    fs.appendFileSync(path.join(skillA, 'SKILL.md'), '\n## Repository A\n');
    deploySkill(brain, 'shared-name', {
      repo: repoA,
      agentSkillsDir: path.join(repoA, '.agent', 'skills'),
    });

    const skillB = writeSkill(path.join(repoB, '.agent', 'skills'), 'shared-name');
    fs.appendFileSync(path.join(skillB, 'SKILL.md'), '\n## Repository B\n');
    expect(() => deploySkill(brain, 'shared-name', {
      repo: repoB,
      agentSkillsDir: path.join(repoB, '.agent', 'skills'),
    })).toThrow('Refusing to deploy repo-owned catalog skill');

    const beforeA = fs.readFileSync(path.join(skillA, 'SKILL.md'), 'utf8');
    const beforeB = fs.readFileSync(path.join(skillB, 'SKILL.md'), 'utf8');
    expect(fs.readFileSync(path.join(skillA, 'SKILL.md'), 'utf8')).toBe(beforeA);
    expect(fs.readFileSync(path.join(skillB, 'SKILL.md'), 'utf8')).toBe(beforeB);
  });

  it('syncAllSkillsTwoWay skips repo_scoped skills', () => {
    // Register a normal skill and a repo-scoped skill
    const normalDir = writeSkill(workspace, 'normal-skill');
    registerSkill(brain, normalDir);

    const scopedDir = path.join(workspace, 'repo-scoped-skill');
    fs.mkdirSync(scopedDir, { recursive: true });
    fs.writeFileSync(
      path.join(scopedDir, 'SKILL.md'),
      `---\nname: repo-scoped-skill\ndescription: "Must not be synced globally."\nversion: "1.0.0"\nrepo_scoped: true\n---\n\n# Scoped Skill\n`,
      'utf8',
    );
    registerSkill(brain, scopedDir);

    const report = syncAllSkillsTwoWay(brain, { dryRun: true, skipDiscover: true });
    const skipped = report.results.filter((r) => r.skipped && r.reason === 'repo_scoped');
    expect(skipped.length).toBeGreaterThanOrEqual(1);
    expect(skipped.some((r) => r.skillId === 'repo-scoped-skill')).toBe(true);
    // Normal skill should NOT be in the repo_scoped-skipped list
    expect(skipped.some((r) => r.skillId === 'normal-skill')).toBe(false);
  });
});
