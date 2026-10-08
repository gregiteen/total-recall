import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { packageCodexSkills } from './codex-package.mjs';

test('packages executable instruction routers without exporting memory or overwriting authored packages', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-codex-package-'));
  try {
    const source = path.join(repo, '.agent/skills/start');
    fs.mkdirSync(path.join(source, 'memory-vault'), { recursive: true });
    fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: start\ndescription: Start this repo\n---\nRead references/a.md\n');
    fs.writeFileSync(path.join(source, 'memory-vault/private.md'), 'private sentinel');
    const output = path.join(repo, 'plugins/workflows');
    const result = packageCodexSkills({ repo, output, name: 'repo-workflows' });
    assert.equal(result.installed, false);
    assert.deepEqual(result.skills, ['start']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'plugin.json'))).name, 'repo-workflows');
    const compatibility = JSON.parse(fs.readFileSync(path.join(output, '.codex-plugin/plugin.json')));
    assert.equal(compatibility.name, 'repo-workflows');
    assert.equal(compatibility.skills, './skills/');
    const router = fs.readFileSync(path.join(output, 'skills/start/SKILL.md'), 'utf8');
    assert.ok(router.includes(path.join(source, 'SKILL.md')));
    assert.ok(router.includes('original directory'));
    assert.deepEqual(fs.readdirSync(path.join(output, 'skills/start')), ['SKILL.md']);
    assert.throws(() => packageCodexSkills({ repo, output, name: 'repo-workflows' }), /already exists/);
    assert.throws(() => packageCodexSkills({ repo, output: path.join(source, 'out'), name: 'repo-workflows' }), /inside/);
    assert.throws(() => packageCodexSkills({ repo, output: path.join(repo, 'missing'), name: 'repo-workflows', skills: ['absent'] }), /No selected/);
    assert.equal(fs.readFileSync(path.join(source, 'memory-vault/private.md'), 'utf8'), 'private sentinel');
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});
