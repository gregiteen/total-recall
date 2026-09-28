import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import commandCmd, { generatePluginCommand } from './command.mjs';

describe('plugin command generation', () => {
  let root;
  let plugin;
  let commands;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-command-spec-'));
    plugin = path.join(root, 'plugin');
    commands = path.join(root, 'commands');
    fs.mkdirSync(plugin);
    fs.writeFileSync(path.join(plugin, 'plugin.json'), JSON.stringify({
      id: 'sample-plugin', name: 'Sample Plugin', version: '1.0.0',
      description: 'A sample plugin command.',
      commands: [{ name: 'sample-run', handler: './handler.mjs', description: 'Run the sample.', background: true }]
    }));
    fs.writeFileSync(path.join(plugin, 'handler.mjs'),
      'export function run(argv) { return { data: { args: argv.slice(3) } }; }\n');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('generates a runnable command with help and structured JSON output', () => {
    const file = generatePluginCommand(plugin, 'sample-run', commands);
    const help = spawnSync(process.execPath, [file, '--help'], { encoding: 'utf8' });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('Run the sample.');

    const result = spawnSync(process.execPath, [file, 'hello', '--json'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true, exit_code: 0, result: { args: ['hello'] }
    });
  });

  it('creates and dispatches through the real CLI while preserving handler exit codes', () => {
    const brain = path.join(root, '.agent', 'skills', 'total-recall');
    fs.mkdirSync(brain, { recursive: true });
    fs.writeFileSync(path.join(brain, 'SKILL.md'), '# Test brain\n');
    fs.writeFileSync(path.join(plugin, 'handler.mjs'),
      'export function run(argv) { return { exitCode: 7, data: { args: argv.slice(3) } }; }\n');
    const cli = path.resolve('bin/total-recall.mjs');
    const created = spawnSync(process.execPath,
      [cli, 'command', 'create', 'sample-run', '--from-plugin', plugin],
      { cwd: root, encoding: 'utf8' });
    expect(created.status).toBe(0);
    expect(fs.existsSync(path.join(root, '.agent', 'commands', 'sample-run.mjs'))).toBe(true);
    const ran = spawnSync(process.execPath,
      [cli, 'sample-run', 'hello', '--json'],
      { cwd: root, encoding: 'utf8' });
    expect(ran.status).toBe(7);
    expect(JSON.parse(ran.stdout)).toEqual({ ok: false, exit_code: 7, result: { args: ['hello'] } });
  });

  it('plugin install registers its commands and remove unregisters them', () => {
    const brain = path.join(root, '.agent', 'skills', 'total-recall');
    fs.mkdirSync(brain, { recursive: true });
    fs.writeFileSync(path.join(brain, 'SKILL.md'), '# Test brain\n');
    const cli = path.resolve('bin/total-recall.mjs');
    const env = { ...process.env, TR_COMMAND_NO_COMPILE: '1' };
    const installed = spawnSync(process.execPath, [cli, 'plugin', 'install', plugin], { cwd: root, encoding: 'utf8', env });
    expect(installed.status).toBe(0);
    expect(installed.stdout).toContain('Commands: total-recall sample-run');
    const file = path.join(root, '.agent', 'commands', 'sample-run.mjs');
    expect(fs.existsSync(file)).toBe(true);

    // a hand-written command with the same name is never overwritten
    fs.writeFileSync(file, '// mine\n');
    fs.rmSync(path.join(root, '.agent', 'skills', 'total-recall', 'plugins'), { recursive: true, force: true });
    const again = spawnSync(process.execPath, [cli, 'plugin', 'install', plugin], { cwd: root, encoding: 'utf8', env });
    expect(again.stdout).toContain("Skipped command 'sample-run'");
    expect(fs.readFileSync(file, 'utf8')).toBe('// mine\n');
    fs.rmSync(file);

    fs.rmSync(path.join(root, '.agent', 'skills', 'total-recall', 'plugins'), { recursive: true, force: true });
    spawnSync(process.execPath, [cli, 'plugin', 'install', plugin], { cwd: root, encoding: 'utf8', env });
    expect(fs.existsSync(file)).toBe(true);
    const removed = spawnSync(process.execPath, [cli, 'plugin', 'remove', 'sample-plugin'], { cwd: root, encoding: 'utf8', env });
    expect(removed.status).toBe(0);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('runs an allowed long command in the background with a private report', async () => {
    const file = generatePluginCommand(plugin, 'sample-run', commands);
    const result = spawnSync(process.execPath, [file, '--background', '--json'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    const started = JSON.parse(result.stdout);
    expect(started.ok).toBe(true);
    expect(started.pid).toBeGreaterThan(0);
    for (let i = 0; i < 40 && (!fs.existsSync(started.report) || fs.statSync(started.report).size === 0); i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(JSON.parse(fs.readFileSync(started.report, 'utf8')).ok).toBe(true);
    expect(fs.statSync(started.report).mode & 0o777).toBe(0o600);
  });

  it('rejects traversal, linked handlers, and duplicate command installs', () => {
    expect(() => generatePluginCommand(plugin, '../escape', commands)).toThrow(/name/);
    const external = path.join(root, 'external.mjs');
    fs.writeFileSync(external, 'export default () => 1;\n');
    fs.unlinkSync(path.join(plugin, 'handler.mjs'));
    fs.symlinkSync(external, path.join(plugin, 'handler.mjs'));
    expect(() => generatePluginCommand(plugin, 'sample-run', commands)).toThrow(/inside the plugin/);
    fs.unlinkSync(path.join(plugin, 'handler.mjs'));
    fs.writeFileSync(path.join(plugin, 'handler.mjs'), 'export default () => 1;\n');
    generatePluginCommand(plugin, 'sample-run', commands);
    expect(() => generatePluginCommand(plugin, 'sample-run', commands)).toThrow(/already exists/);
  });

  it('rejects unsafe legacy command names before creating a file', async () => {
    const originalCode = process.exitCode;
    try {
      await commandCmd(['create', '../escape', 'console.log(1)']);
      expect(process.exitCode).toBe(2);
    } finally {
      process.exitCode = originalCode;
    }
  });
});
