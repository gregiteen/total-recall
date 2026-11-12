import { describe, expect, it, vi } from 'vitest';
import { runPluginStartupChecks } from './plugin-startup-checks.mjs';
import { readStartupCheckOutput, validateStartupCheck } from './plugin-contracts/startup-check.mjs';
import { validatePluginManifest } from './plugin-loader.mjs';

const manifest = (startup_check, effect = 'read') => ({
  id: 'git', name: 'Git', version: '2.0.1', description: 'Git through Total Recall',
  cli: { command: 'git', handler: 'cli.mjs', subcommands: [{ name: 'unmerged', effect }, { name: 'commit', effect: 'write' }] },
  startup_check,
});
const plugin = (check, extra = {}) => ({ id: 'git', valid: true, manifest: manifest(check), ...extra });
const answer = (body, extra = {}) => async () => ({ ok: true, exitCode: 0, timedOut: false, stdout: JSON.stringify(body), ...extra });

describe('startup_check contract', () => {
  it('accepts a read command with plain arguments', () => {
    expect(validateStartupCheck(manifest({ command: 'unmerged', args: ['--json'], timeout_ms: 15000 }))).toEqual([]);
  });

  it('refuses undeclared, writing and malformed checks', () => {
    expect(validateStartupCheck(manifest({ command: 'missing' }))).toEqual(["'startup_check.command' must name a declared cli subcommand"]);
    expect(validateStartupCheck({ ...manifest({ command: 'commit' }) })).toEqual(["'startup_check.command' must be a read command"]);
    expect(validateStartupCheck(manifest({ command: 'unmerged', args: ['; rm -rf /'] }))).toEqual(["'startup_check.args' must be at most 8 plain arguments"]);
    expect(validateStartupCheck(manifest({ command: 'unmerged', timeout_ms: 120000 }))[0]).toMatch(/timeout_ms/);
    expect(validateStartupCheck(manifest('unmerged'))).toEqual(["'startup_check' must be an object"]);
  });

  it('is part of manifest validation', () => {
    expect(validatePluginManifest(manifest({ command: 'commit' })).errors).toContain("'startup_check.command' must be a read command");
  });

  it('reads only the declared output shape', () => {
    expect(readStartupCheckOutput('{"ok":true,"outstanding":0,"summary":"nothing"}')).toEqual({ status: 'ok', outstanding: 0, summary: 'nothing' });
    expect(readStartupCheckOutput('{"ok":true,"outstanding":3,"summary":"3 branches"}')).toMatchObject({ status: 'attention', outstanding: 3 });
    expect(readStartupCheckOutput('not json').status).toBe('unavailable');
    expect(readStartupCheckOutput('{"ok":true,"outstanding":-1,"summary":"x"}').status).toBe('unavailable');
    expect(readStartupCheckOutput('{"ok":false,"outstanding":0,"summary":"registry unreadable"}')).toMatchObject({ status: 'unavailable', summary: 'registry unreadable' });
  });
});

describe('runPluginStartupChecks', () => {
  it('runs each declared check with its arguments and bounded time', async () => {
    const run = vi.fn(answer({ ok: true, outstanding: 2, summary: '2 branches hold work that is not in main' }));
    const checks = await runPluginStartupChecks({ cwd: '/repo', plugins: [plugin({ command: 'unmerged', args: ['--json'], timeout_ms: 90000 }), { id: 'other', valid: true, manifest: { id: 'other' } }], run, enabled: () => true });
    expect(checks).toEqual([{ plugin: 'git', command: 'git unmerged', status: 'attention', outstanding: 2, summary: '2 branches hold work that is not in main' }]);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ id: 'git' }), { subcommand: 'unmerged', args: ['--json'], cwd: '/repo', timeoutMs: 30000 });
  });

  it('never reports a failed, timed-out or inactive check as clean', async () => {
    const check = { command: 'unmerged' };
    const failed = await runPluginStartupChecks({ plugins: [plugin(check)], run: answer({ ok: true, outstanding: 0, summary: 'none' }, { exitCode: 1 }), enabled: () => true });
    expect(failed[0]).toMatchObject({ status: 'unavailable', reason: 'exited 1' });
    const slow = await runPluginStartupChecks({ plugins: [plugin(check)], run: answer({}, { timedOut: true }), enabled: () => true });
    expect(slow[0]).toMatchObject({ status: 'unavailable', reason: 'timed out after 15000 ms' });
    const thrown = await runPluginStartupChecks({ plugins: [plugin(check)], run: async () => { throw new Error('Plugin git is inactive'); }, enabled: () => true });
    expect(thrown[0]).toMatchObject({ status: 'unavailable', reason: 'Plugin git is inactive' });
    const off = await runPluginStartupChecks({ plugins: [plugin(check)], run: vi.fn(), enabled: () => false });
    expect(off[0]).toMatchObject({ status: 'inactive' });
  });

  it('skips invalid plugins', async () => {
    const run = vi.fn();
    expect(await runPluginStartupChecks({ plugins: [plugin({ command: 'unmerged' }, { valid: false })], run, enabled: () => true })).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });
});
