import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { enableProjectSkill } from './skills.mjs';

const workspaces = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

describe('skills routes', () => {
  it('enables a skill from the global catalog without deleting either copy', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-skills-route-'));
    workspaces.push(workspace);
    const brainDir = path.join(workspace, 'brain');
    const globalSkill = path.join(workspace, 'global', 'shared-skill');
    const targetRepo = path.join(workspace, 'project');
    const targetSkill = path.join(targetRepo, '.agent', 'skills', 'shared-skill');
    const repoOnlyHook = path.join(targetSkill, 'hooks', 'repo-only.sh');

    fs.mkdirSync(globalSkill, { recursive: true });
    fs.writeFileSync(
      path.join(globalSkill, 'SKILL.md'),
      '---\nname: shared-skill\ndescription: "Global catalog source."\n---\n\nGlobal source marker.\n',
    );
    fs.mkdirSync(path.dirname(repoOnlyHook), { recursive: true });
    fs.writeFileSync(
      path.join(targetSkill, 'SKILL.md'),
      '---\nname: shared-skill\ndescription: "Old project copy."\n---\n\nOld project marker.\n',
    );
    fs.writeFileSync(repoOnlyHook, '#!/bin/sh\n');
    fs.writeFileSync(path.join(targetRepo, 'package.json'), '{"name":"route-test-project"}\n');

    enableProjectSkill(brainDir, globalSkill, targetRepo);

    expect(fs.readFileSync(path.join(globalSkill, 'SKILL.md'), 'utf8')).toContain(
      'Global source marker.',
    );
    expect(fs.readFileSync(path.join(targetSkill, 'SKILL.md'), 'utf8')).toContain(
      'Global source marker.',
    );
    expect(fs.existsSync(repoOnlyHook)).toBe(true);
  });
});
