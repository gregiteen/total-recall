import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installPlugin, patchPluginRecord } from './plugin-store.mjs';
import { getPlugin as discoverPlugin } from './plugin-loader.mjs';
import { setPluginActive, pluginActivation } from './plugin-activation.mjs';
import { runDuePluginTasks } from './plugin-tasks.mjs';
import { runPluginCommand } from './plugin-runner.mjs';
import { loadPluginModule } from './plugin-runtime.mjs';

describe('plugin host activation lifecycle', () => {
  let root, previous;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-activation-'));
    previous = process.env._TR_TEST_AGENT_DIR;
    process.env._TR_TEST_AGENT_DIR = path.join(root, 'global');
    const source = path.join(root, 'source'); fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'cli.mjs'), 'export async function run(){ console.log("executed"); }');
    fs.writeFileSync(path.join(source, 'plugin.json'), JSON.stringify({ id: 'activation-demo', name: 'Activation Demo', version: '1.0.0', description: 'Activation fixture',
      cli: { command: 'activation-demo', handler: 'cli.mjs', subcommands: [{ name: 'tick', effect: 'read', output: 'text', args: [] }] },
      runtime: { modules: { example: 'cli.mjs' } }, tasks: [{ intent: 'Tick', schedule: '* * * * *', command: 'tick' }] }));
    const config = path.join(root, '.agent/skills/total-recall/config'); fs.mkdirSync(config, { recursive: true });
    fs.writeFileSync(path.join(config, 'clients.json'), '["codex"]');
    await installPlugin(source, { projectRoot: root });
  });
  afterEach(() => { if (previous === undefined) delete process.env._TR_TEST_AGENT_DIR; else process.env._TR_TEST_AGENT_DIR = previous; fs.rmSync(root, { recursive: true, force: true }); });

  it('off gates execution and scheduled work; on restores it and both rebuild catalogs and surfaces', async () => {
    const plugin = discoverPlugin('activation-demo', root);
    await patchPluginRecord(plugin, { task_runs: { tick: '2026-01-01T12:00' } });
    const off = await setPluginActive(plugin.id, false, { projectRoot: root });
    expect(off.compilation.ok).toBe(true); expect(pluginActivation(plugin).state).toBe('inactive');
    const library = () => JSON.parse(fs.readFileSync(path.join(root, '.agent/skills/total-recall/memory-derived/cli-library.json')));
    expect(library().plugins.find(p => p.id === plugin.id).activation.state).toBe('inactive');
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toMatch(/activation-demo.*inactive/);
    let calls = 0; const runner = async () => { calls++; return { ok: true, exitCode: 0 }; };
    expect(await runDuePluginTasks({ projectRoot: root, now: new Date(2026, 0, 1, 12, 1), runner })).toEqual([]);
    await expect(runPluginCommand(plugin, { subcommand: 'tick', cwd: root })).rejects.toThrow(/inactive/);
    // The runtime boundary denies execution before importing owner code.
    await expect(loadPluginModule(plugin.id, 'example', { projectRoot: root, activeRequired: true })).rejects.toThrow(/inactive/);
    const on = await runPluginCommand(plugin, { subcommand: 'on', cwd: root });
    expect(on.ok).toBe(true); expect(library().plugins.find(p => p.id === plugin.id).activation.state).toBe('active');
    expect(await runDuePluginTasks({ projectRoot: root, now: new Date(2026, 0, 1, 12, 2), runner })).toHaveLength(1);
    expect(calls).toBe(1);
  });

  it('keeps changed state and reports actual compilation failures', async () => {
    fs.rmSync(path.join(root, 'INSTRUCTIONS.md')); fs.mkdirSync(path.join(root, 'INSTRUCTIONS.md'));
    const result = await setPluginActive('activation-demo', false, { projectRoot: root });
    expect(result.activation.state).toBe('inactive'); expect(result.compilation.ok).toBe(false);
    await expect(setPluginActive('activation-demo', 'false', { projectRoot: root })).rejects.toThrow(/boolean/);
  });
});
