import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describeCommandFile, listSurfaceCommands, buildCommandsSection, surfaceInputsHash } from './command-surface.mjs';

let tmp;
const write = (dir, name, body) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${name}.mjs`), body); };

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-surface-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('describeCommandFile', () => {
  it('prefers @description and reads @risk', () => {
    const src = '// Auto-generated custom CLI command: x\n// @description Does x safely.\n// @risk money\nexport async function run(argv = []) {\n  // ignored comment\n}\n';
    expect(describeCommandFile(src, 'x')).toEqual({ description: 'Does x safely.', risk: 'money' });
  });

  it('reads the JSON description of plugin-generated wrappers', () => {
    const src = 'const name = "y";\nconst description = "Plugin \\"y\\" verb";\n';
    expect(describeCommandFile(src, 'y').description).toBe('Plugin "y" verb');
  });

  it('reads a "Custom CLI command: name — text" header across lines', () => {
    const src = '// Custom CLI command: cloud — run any command on the cloud brain.\n// Usage: total-recall cloud <cmd>\nexport default async function run() {}\n';
    expect(describeCommandFile(src, 'cloud').description).toBe('run any command on the cloud brain.');
  });

  it('falls back to the run() body comments, skipping a usage line', () => {
    const src = '// Auto-generated custom CLI command: g\nexport async function run(argv = []) {\n  const args = Array.isArray(argv) ? argv.slice(3) : [];\n  // total-recall g <a|b>\n  // Groups of things. More detail here.\n  const x = 1;\n}\n';
    expect(describeCommandFile(src, 'g').description).toBe('Groups of things.');
  });

  it('returns null when nothing describes the command', () => {
    expect(describeCommandFile('export default async function run() {}\n', 'z')).toEqual({ description: null, risk: null });
  });
});

describe('listSurfaceCommands / buildCommandsSection', () => {
  it('lists project before global, reports shadowing, and never executes code', () => {
    const project = path.join(tmp, 'p'); const global = path.join(tmp, 'g');
    write(project, 'dup', '// @description project one\nthrow new Error("must not run");\n');
    write(global, 'dup', '// @description global one\n');
    write(global, 'only-global', '// @description global only\n// @risk read\n');
    write(global, 'Bad_Name', '// ignored\n');
    const list = listSurfaceCommands([{ scope: 'project', dir: project }, { scope: 'global', dir: global }]);
    expect(list.map((c) => c.name)).toEqual(['dup', 'only-global']);
    expect(list[0]).toMatchObject({ scope: 'project', description: 'project one', shadows: ['global'] });
    const section = buildCommandsSection(list);
    expect(section).toContain('`npx total-recall dup` (project; shadows global) — project one');
    expect(section).toContain('`npx total-recall only-global` (global; risk: read) — global only');
    expect(section.match(/npx total-recall dup`/g)).toHaveLength(1);
  });

  it('dedupes a dir listed twice and tolerates missing dirs', () => {
    const d = path.join(tmp, 'same');
    write(d, 'a', '// @description A.\n');
    const list = listSurfaceCommands([{ scope: 'project', dir: d }, { scope: 'global', dir: d }, { scope: 'global', dir: path.join(tmp, 'missing') }]);
    expect(list).toHaveLength(1);
    expect(list[0].shadows).toEqual([]);
  });

  it('explains how to add a command when none exist', () => {
    expect(buildCommandsSection([])).toContain('command create <name>');
  });
});

describe('surfaceInputsHash', () => {
  it('changes when a command or skill changes', () => {
    const cmds = path.join(tmp, 'c'); const skills = path.join(tmp, 's');
    write(cmds, 'a', '// one\n');
    fs.mkdirSync(path.join(skills, 'k'), { recursive: true });
    fs.writeFileSync(path.join(skills, 'k', 'SKILL.md'), 'x');
    const opts = { commandDirs: [{ scope: 'project', dir: cmds }], skillsDir: skills };
    const h1 = surfaceInputsHash(opts);
    expect(surfaceInputsHash(opts)).toBe(h1);
    write(cmds, 'b', '// two\n');
    const h2 = surfaceInputsHash(opts);
    expect(h2).not.toBe(h1);
    fs.writeFileSync(path.join(skills, 'k', 'SKILL.md'), 'xy');
    expect(surfaceInputsHash(opts)).not.toBe(h2);
    const h3 = surfaceInputsHash(opts);
    fs.mkdirSync(path.join(skills, 'k', 'references'));
    fs.writeFileSync(path.join(skills, 'k', 'references', 'manual.md'), 'new reference');
    expect(surfaceInputsHash(opts)).not.toBe(h3);
  });
});
