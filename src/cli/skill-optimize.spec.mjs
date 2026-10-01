// @vitest-environment node
import { it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSkillOptimize } from './skill-optimize.mjs';

it('requires explicit scope and reports bounded metadata without manual bodies', () => {
  expect(() => runSkillOptimize([])).toThrow('Specify');
  expect(() => runSkillOptimize(['--skill'])).toThrow('Missing');
  expect(() => runSkillOptimize(['--unknown'])).toThrow('Unknown');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-opt-cli-'));
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: demo\ndescription: Demo.\n---\n# Sensitive manual body\n');
    expect(() => runSkillOptimize(['--root', dir, '--json'])).toThrow('Specify');
    expect(runSkillOptimize(['--skill', dir, '--json'])).toBe(0);
    const report = JSON.parse(spy.mock.calls.at(-1)[0]);
    expect(report.counts.current).toBe(1);
    expect(JSON.stringify(report)).not.toContain('Sensitive');
    expect(() => runSkillOptimize(['--skill', dir, '--apply', '--dry-run'])).toThrow('Choose');
  } finally { spy.mockRestore(); fs.rmSync(dir, { recursive: true, force: true }); }
});
