// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitSkill, planSkillOptimization, optimizeSkill, optimizeSkills, skillDirectories, auditSkillOwnership } from './skill-optimizer.mjs';

const source = `---\nname: demo\ndescription: Deploy demo services.\nrepo_scoped: true\n---\n\n# Demo\n\nNever expose credentials.\n\n## Deploy\n\nRead [config](references/config.md).\n\n\`\`\`sh\n## Example, not a section\necho '# sample'\n\`\`\`\n\n${'Deployment details. '.repeat(220)}\n\n## Undo\n\nOnly restore the selected service.\n\n${'Recovery details. '.repeat(200)}\n`;
describe('skill optimization', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-skill-opt-')); fs.writeFileSync(path.join(dir, 'SKILL.md'), source); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  it('reconstructs the complete original body and ignores fenced headings', () => {
    const split = splitSkill(source);
    expect(split.frontmatter + split.sections.map(s => s.text).join('')).toBe(source);
    expect(split.sections.map(s => s.title)).toEqual(['Overview', 'Deploy', 'Undo']);
  });
  it('retains explicit requirements and a byte-identical recoverable original', () => {
    const p = planSkillOptimization(source);
    expect(p.status).toBe('candidate');
    expect(p.entrypoint).toContain('Never expose credentials.');
    expect(p.entrypoint).toContain('Only restore the selected service.');
    expect(p.entrypoint).toContain('repo_scoped: true');
    expect(p.files.find(f => f.path.endsWith('original.md')).text).toBe(source);
    expect(p.files.find(f => f.title === 'Deploy').text).toContain('../../references/config.md');
  });
  it('defaults to no writes and applies idempotently with all routed files present', () => {
    expect(optimizeSkill(dir).status).toBe('candidate');
    expect(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')).toBe(source);
    expect(fs.existsSync(path.join(dir, 'references'))).toBe(false);
    expect(optimizeSkill(dir, { apply: true }).status).toBe('applied');
    expect(optimizeSkill(dir, { apply: true }).status).toBe('current');
    expect(fs.readFileSync(path.join(dir, 'references/optimized/original.md'), 'utf8')).toBe(source);
    expect(fs.existsSync(path.join(dir, '.skill-optimizer.lock'))).toBe(false);
  });
  it('preserves managed blocks verbatim and fails closed on malformed blocks', () => {
    const block = '<!-- BEGIN INJECTED MEMORY: managed -->\nNever discard this rule.\n<!-- END INJECTED MEMORY -->';
    expect(planSkillOptimization(source + block).entrypoint).toContain(block);
    expect(() => planSkillOptimization(source + '<!-- BEGIN INJECTED MEMORY -->')).toThrow('Malformed');
  });
  it('refuses unsafe reductions rather than truncating requirements', () => {
    const p = planSkillOptimization(source + '\n\nNever omit this: ' + 'constraint '.repeat(800));
    expect(p.status).toBe('review'); expect(p.files).toEqual([]);
  });
  it('detects tampered references and edited entrypoints without overwriting changes', () => {
    optimizeSkill(dir, { apply: true });
    fs.appendFileSync(path.join(dir, 'SKILL.md'), '\nNew authored constraint.\n');
    expect(optimizeSkill(dir, { apply: true }).status).toBe('review');
    fs.appendFileSync(path.join(dir, 'references/optimized/section-02.md'), 'tampered');
    expect(() => optimizeSkill(dir)).toThrow('Reference drift');
  });
  it('does not overwrite existing support files or another writer lock', () => {
    fs.mkdirSync(path.join(dir, 'references/optimized'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'references/optimized/owned.md'), 'keep');
    expect(() => optimizeSkill(dir, { apply: true })).toThrow('already exists');
    expect(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')).toBe(source);
    expect(fs.readFileSync(path.join(dir, 'references/optimized/owned.md'), 'utf8')).toBe('keep');
    fs.writeFileSync(path.join(dir, '.skill-optimizer.lock'), 'other');
    expect(() => optimizeSkill(dir, { apply: true })).toThrow();
    expect(fs.readFileSync(path.join(dir, '.skill-optimizer.lock'), 'utf8')).toBe('other');
  });
  it('rejects symlink output directories and forbidden vault locations', () => {
    fs.symlinkSync(os.tmpdir(), path.join(dir, 'references'));
    expect(() => optimizeSkill(dir, { apply: true })).toThrow('symlink');
    const vault = path.join(dir, 'memory-vault'); fs.mkdirSync(vault);
    expect(() => optimizeSkill(vault)).toThrow('Not an editable');
  });
  it('deduplicates physical owners, skips aliases during root discovery and preserves nested scopes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-skill-root-'));
    try {
      fs.symlinkSync(dir, path.join(root, 'alias'));
      expect(skillDirectories(root)).toEqual([]);
      expect(optimizeSkills([dir, path.join(root, 'alias')])).toHaveLength(1);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  it('rejects malformed frontmatter/fences and invalid budgets', () => {
    expect(() => planSkillOptimization('no metadata')).toThrow('frontmatter');
    expect(() => planSkillOptimization(source + '\n```')).toThrow('Unclosed');
    expect(() => planSkillOptimization(source, { maxTokens: NaN })).toThrow('Budget');
  });
  it('rejects global repo expertise, foreign aliases and incorrect repository identity', () => {
    expect(auditSkillOwnership(dir, { globalRoot: dir }).valid).toBe(false);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'correct-repo' }));
    fs.writeFileSync(path.join(dir, 'SKILL.md'), source.replace('repo_scoped: true', 'repo_scoped: true\nrepository_id: wrong-repo'));
    expect(auditSkillOwnership(dir, { repoRoot: dir }).reason).toBe('repository-identity-mismatch');
    fs.writeFileSync(path.join(dir, 'SKILL.md'), source.replace('repo_scoped: true', 'repo_scoped: true\nrepository_id: correct-repo'));
    expect(auditSkillOwnership(dir, { repoRoot: dir }).valid).toBe(true);
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-owner-'));
    try { expect(auditSkillOwnership(dir, { repoRoot: other }).reason).toBe('owner-outside-authorized-roots'); }
    finally { fs.rmSync(other, { recursive: true, force: true }); }
  });
  it('checks actual metadata of an already optimized skill even when a profile proposes valid metadata', () => {
    optimizeSkill(dir, { apply: true });
    const result = optimizeSkill(dir, {
      globalRoot: dir,
      profileRole: 'portable',
      profile: { demo: ['Portable demo', 'Use the documented procedure.'] },
    });
    expect(result.status).toBe('review');
    expect(result.reason).toBe('repo-specific-skill-in-global-root');
  });
});
