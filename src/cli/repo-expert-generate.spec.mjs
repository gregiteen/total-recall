import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scanRepo, generateSkillMd, generateRepoExpert } from './repo-expert-generate.mjs';
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
    expect(md).toContain('# test-project — Codebase Architecture');
    expect(md).toContain('**Languages**: TypeScript (10 files)');
  });
});
