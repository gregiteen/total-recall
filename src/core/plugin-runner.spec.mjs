import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPluginCommand } from './plugin-runner.mjs';

function makePlugin(root, id, source) {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'cli.mjs'), source);
  return { id, dir, manifest: { id, cli: { command: id, handler: './cli.mjs' } } };
}

describe('plugin-runner', () => {
  let root;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-runner-'));
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('passes the documented argv shape and captures stdout', async () => {
    const p = makePlugin(root, 'echo', 'export async function run(argv) { console.log(JSON.stringify(argv.slice(2))); }');
    const res = await runPluginCommand(p, { subcommand: 'status', args: ['--json'], cwd: root });
    expect(res.ok).toBe(true);
    expect(JSON.parse(res.output.trim())).toEqual(['echo', 'status', '--json']);
  });

  it('isolates a plugin that calls process.exit', async () => {
    const p = makePlugin(root, 'exiter', 'export async function run() { console.log("bye"); process.exit(3); }');
    const res = await runPluginCommand(p, { cwd: root });
    expect(res.ok).toBe(false);
    expect(res.exitCode).toBe(3);
    expect(res.output).toContain('bye');
    // This process — standing in for the brain server — is still alive to assert.
    expect(process.exitCode === undefined || process.exitCode === 0).toBe(true);
  });

  it('reports thrown errors as a failed run', async () => {
    const p = makePlugin(root, 'thrower', 'export async function run() { throw new Error("boom"); }');
    const res = await runPluginCommand(p, { cwd: root });
    expect(res.ok).toBe(false);
    expect(res.output).toContain('boom');
  });

  it('kills a plugin that exceeds its timeout', async () => {
    const p = makePlugin(root, 'sleeper', 'export async function run() { await new Promise(r => setTimeout(r, 60000)); }');
    const res = await runPluginCommand(p, { cwd: root, timeoutMs: 500 });
    expect(res.timedOut).toBe(true);
    expect(res.ok).toBe(false);
  });

  it('refuses a handler outside the plugin directory', async () => {
    const p = makePlugin(root, 'escape', '');
    p.manifest.cli.handler = '../echo/cli.mjs';
    await expect(runPluginCommand(p, { cwd: root })).rejects.toThrow(/outside the plugin directory/);
  });
});
