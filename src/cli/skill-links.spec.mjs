// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { archiveDanglingSkillLinks, inspectSkillLinks, linkSharedSkill } from './skill-links.mjs';

let root;
let agentDir;
let brainDir;
let skills;
const options = () => ({ root, agentDir, brainDir, scope: 'project' });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-skill-links-'));
  agentDir = path.join(root, '.agent');
  skills = path.join(agentDir, 'skills');
  brainDir = path.join(skills, 'total-recall');
  fs.mkdirSync(brainDir, { recursive: true });
  fs.mkdirSync(path.join(root, '.agents'));
  fs.symlinkSync('../.agent/skills', path.join(root, '.agents', 'skills'));
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('reports one physical dangling entry through two aliases and archives the original link text', () => {
  const link = path.join(skills, 'retired');
  fs.symlinkSync('../../missing/retired', link);
  const report = inspectSkillLinks(options());
  expect(report.checked).toBe(1);
  expect(report.broken).toEqual([{ path: '.agent/skills/retired', target: '../../missing/retired', reason: 'ENOENT' }]);

  const [archived] = archiveDanglingSkillLinks({ ...report, brainDir }, ['.agent/skills/retired']);
  expect(fs.readlinkSync(archived.backup)).toBe('../../missing/retired');
  expect(inspectSkillLinks(options()).broken).toEqual([]);
});

it('refuses to archive an entry that has recovered since the audit', () => {
  const link = path.join(skills, 'a');
  fs.symlinkSync('source', link);
  const report = inspectSkillLinks(options());
  fs.mkdirSync(path.join(skills, 'source'));
  expect(() => archiveDanglingSkillLinks({ ...report, brainDir }, ['.agent/skills/a']))
    .toThrow('changed during the audit');
  expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
});

it('keeps a previous project package when explicitly linking a portable shared skill', () => {
  const sharedSkillsDir = path.join(root, 'shared');
  const source = path.join(sharedSkillsDir, 'example');
  const local = path.join(skills, 'example');
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: example\nrepo_scoped: false\n---\nShared.\n');
  fs.mkdirSync(local);
  fs.writeFileSync(path.join(local, 'SKILL.md'), 'Local instructions');
  const selected = { root, agentDir, sharedSkillsDir, archiveBrainDir: brainDir };
  const result = linkSharedSkill(selected, 'example');
  expect(fs.realpathSync(local)).toBe(fs.realpathSync(source));
  expect(fs.readFileSync(path.join(result.backup, 'SKILL.md'), 'utf8')).toBe('Local instructions');
  expect(linkSharedSkill(selected, 'example').status).toBe('already-linked');
  expect(() => linkSharedSkill(selected, 'total-recall')).toThrow('portable shared skill name');
});
