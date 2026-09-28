import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scanRepo, generateSkillMd, generateRepoExpert, ensureRepoExpert } from './repo-expert-generate.mjs';
import fs from 'node:fs';
import path from 'node:path';

describe('repo-expert-generate', () => {
  const tmpDir = path.join(process.cwd(), '.test-repo');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('scanRepo correctly identifies project type', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      dependencies: { react: '^18' }
    }));

    const scan = scanRepo(tmpDir);
    expect(scan.name).toBe('test-project');
    expect(scan.frameworks).toContain('React');
  });

  it('generateSkillMd produces markdown output', () => {
    const scan = {
      name: 'test-project',
      description: 'A test project',
      type: 'commonjs',
      packageManager: 'npm',
      languages: ['TypeScript (10 files)'],
      frameworks: ['React'],
      entryPoints: [],
      directoryTree: {},
      cliCommands: [],
      apiRoutes: [],
      frontendPages: [],
      components: [],
      coreModules: [],
      testFramework: 'Vitest',
      hasTypeScript: true,
      skills: [],
      configFiles: [],
    };

    const md = generateSkillMd(scan, tmpDir);
    expect(md).toContain('name: repo-expert');
    expect(md).toContain('repository_id: "test-project"');
    expect(md).toContain('# test-project — Codebase Architecture');
    expect(md).toContain('**Languages**: TypeScript (10 files)');
  });

  it('initializes a scoped local expert without copying runtime vault names', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-project' }));
    fs.mkdirSync(path.join(tmpDir, 'vault', 'contacts', 'private-buyer'), { recursive: true });
    const result = ensureRepoExpert(tmpDir);
    const content = fs.readFileSync(result.destFile, 'utf8');
    expect(result.action).toBe('generated');
    expect(content).toContain('repo_scoped: true');
    expect(content).toContain('repository_id: "test-project"');
    expect(content).not.toContain('private-buyer');
    expect(ensureRepoExpert(tmpDir).action).toBe('existing');
  });

  it('rejects an expert from a different repository without replacing it', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-project' }));
    const expertDir = path.join(tmpDir, '.agent', 'skills', 'repo-expert');
    fs.mkdirSync(expertDir, { recursive: true });
    const foreign = '---\nname: repo-expert\nrepo_scoped: true\nrepository_id: foreign-project\n---\n\nForeign map\n';
    fs.writeFileSync(path.join(expertDir, 'SKILL.md'), foreign);
    expect(() => ensureRepoExpert(tmpDir)).toThrow('does not match test-project');
    expect(fs.readFileSync(path.join(expertDir, 'SKILL.md'), 'utf8')).toBe(foreign);
  });

  it('rejects an unidentifiable local expert without replacing it', () => {
    const expertDir = path.join(tmpDir, '.agent', 'skills', 'repo-expert');
    fs.mkdirSync(expertDir, { recursive: true });
    const unknown = '---\nname: repo-expert\nrepo_scoped: true\n---\n\nUnknown map\n';
    fs.writeFileSync(path.join(expertDir, 'SKILL.md'), unknown);
    expect(() => ensureRepoExpert(tmpDir)).toThrow('does not match');
    expect(fs.readFileSync(path.join(expertDir, 'SKILL.md'), 'utf8')).toBe(unknown);
  });

  it('dry-run reports generation without writing a skill', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-project' }));
    expect(ensureRepoExpert(tmpDir, { dryRun: true }).action).toBe('would-generate');
    expect(fs.existsSync(path.join(tmpDir, '.agent', 'skills', 'repo-expert'))).toBe(false);
  });
});
