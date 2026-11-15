import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { globalPluginsDir, projectPluginsDir } from './plugin-loader.mjs';
import { runPluginCommand } from './plugin-runner.mjs';
import { writeFixturePlugin } from './testing/plugin-fixture.mjs';

function makePlugin(root, id, source) {
  const pluginsDir = path.join(root, 'plugins');
  const dir = path.join(pluginsDir, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'cli.mjs'), source);
  return { id, dir, pluginsDir, manifest: { id, cli: { command: id, handler: './cli.mjs' } } };
}

const writeState = `import fs from 'node:fs';
  import path from 'node:path';
  export function run(argv) {
    const stateDir = process.env.TR_PLUGIN_STATE_DIR;
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'state.txt'), argv.at(-1));
  }`;

describe('plugin-runner', () => {
  let root;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-runner-'));
    vi.stubEnv('AGENT_DIR', path.join(root, 'agent'));
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns the answer to a stdin request, which a secret never gets', async () => {
    const source = "export async function run(argv) { let s = ''; for await (const c of process.stdin) s += c; console.log(JSON.stringify({ argv: argv.slice(3), got: s })); }";
    const p = makePlugin(root, 'request', source);
    const res = await runPluginCommand(p, { subcommand: 'dispatch', stdinRequest: '{"prompt":"task"}', cwd: root });
    expect(res.ok).toBe(true);
    expect(JSON.parse(res.output)).toEqual({ argv: ['dispatch', '--stdin'], got: '{"prompt":"task"}' });
    await expect(runPluginCommand(p, { subcommand: 'dispatch', stdinRequest: '', cwd: root })).rejects.toThrow(/non-empty/);
    await expect(runPluginCommand(p, { subcommand: 'dispatch', stdinRequest: 'x'.repeat(1024 * 1024 + 1), cwd: root })).rejects.toThrow(/at most/);
    await expect(runPluginCommand(p, { subcommand: 'dispatch', stdinRequest: 'x', stdinText: 'y', cwd: root })).rejects.toThrow(/not both/);
  });

  it('passes the documented argv shape and captures stdout', async () => {
    const p = makePlugin(root, 'echo', 'export async function run(argv) { console.log(JSON.stringify(argv.slice(2))); }');
    const res = await runPluginCommand(p, { subcommand: 'status', args: ['--json'], cwd: root });
    expect(res.ok).toBe(true);
    expect(JSON.parse(res.output.trim())).toEqual(['echo', 'status', '--json']);
  });

  it('writes and archives repository state independently of a shared install', async () => {
    const fixture = makePlugin(path.dirname(globalPluginsDir()), 'scoped-state', writeState);
    const manifest = writeFixturePlugin(fixture.dir, {
      ...fixture.manifest,
      name: 'Scoped State',
      description: 'Writes a fixture state file.',
      version: '1.0.0',
    });
    const plugin = { ...fixture, manifest, scope: 'global' };
    const projectRoot = path.join(root, 'repo');
    const cwd = path.join(projectRoot, 'nested');
    fs.mkdirSync(cwd, { recursive: true });
    const brainDir = path.dirname(projectPluginsDir(projectRoot));
    const sharedState = path.join(path.dirname(globalPluginsDir()), 'plugin-state', plugin.id, 'state.txt');
    const projectState = path.join(brainDir, 'plugin-state', plugin.id, 'state.txt');

    await expect(runPluginCommand(plugin, { cwd, projectRoot: null, args: ['shared'] })).resolves.toMatchObject({ ok: true });
    await expect(runPluginCommand(plugin, { cwd, projectRoot, args: ['project'] })).resolves.toMatchObject({ ok: true });
    expect(fs.readFileSync(projectState, 'utf8')).toBe('project');
    expect(fs.readFileSync(sharedState, 'utf8')).toBe('shared');

    const off = await runPluginCommand(plugin, { cwd: projectRoot, projectRoot: null, subcommand: 'off' });
    expect(off.ok).toBe(true);
    expect(JSON.parse(off.output).cleanup).toEqual({ ok: true, state: 'archived' });
    expect(fs.existsSync(projectState)).toBe(false);
    expect(fs.readFileSync(path.join(brainDir, 'config', 'plugin-state-archive', plugin.id, 'state.txt'), 'utf8')).toBe('project');
    expect(fs.readFileSync(sharedState, 'utf8')).toBe('shared');
  });

  it('writes scaffold fallback state to the global brain when no project is selected', async () => {
    const shipped = path.join(root, 'shipped');
    const plugin = { ...makePlugin(shipped, 'scaffold-state', writeState), scope: 'scaffold' };
    const globalState = path.join(path.dirname(globalPluginsDir()), 'plugin-state', plugin.id, 'state.txt');

    await expect(runPluginCommand(plugin, { cwd: root, args: ['fallback'] })).resolves.toMatchObject({ ok: true });
    expect(fs.readFileSync(globalState, 'utf8')).toBe('fallback');
    expect(fs.existsSync(path.join(shipped, 'plugin-state'))).toBe(false);
  });

  it('bounds server output at 256 KiB but gives a terminal call the full output', async () => {
    const p = makePlugin(root, 'bulk', 'export async function run() { process.stdout.write("x".repeat(300 * 1024)); }');
    const server = await runPluginCommand(p);
    expect(server.truncated).toBe(true);
    expect(server.stdout.length).toBe(256 * 1024);
    const terminal = await runPluginCommand(p, { stdin: 'inherit' });
    expect(terminal.truncated).toBe(false);
    expect(terminal.stdout.length).toBe(300 * 1024);
    await expect(runPluginCommand(p, { maxOutputBytes: 0 })).rejects.toThrow(/output limit/);
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

  it('keeps structured stdout separate from diagnostics for nested CLI consumers',async()=>{
    const plugin=makePlugin(root,'streams','export function run(){console.error("diagnostic");console.log(JSON.stringify({ok:true}));}');
    const result=await runPluginCommand(plugin,{cwd:root});
    expect(JSON.parse(result.stdout)).toEqual({ok:true});
    expect(result.stderr).toContain('diagnostic');
    expect(result.output).toContain('diagnostic');
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

  describe('interactive subcommands', () => {
    // The child records which files its stdin, stdout and stderr are, sleeps past the declared
    // timeout, then exits 4. Identity (device and inode) shows whether it was handed this
    // process's own streams or a pipe from the runner.
    const identity = fd => { const s = fs.fstatSync(fd); return `${s.dev}:${s.ino}`; };
    const makeSession = (id) => {
      const out = path.join(root, `${id}.json`);
      const p = makePlugin(root, id, `import fs from 'node:fs';
        export async function run() {
          const id = fd => { const s = fs.fstatSync(fd); return s.dev + ':' + s.ino; };
          fs.writeFileSync(${JSON.stringify(out)}, JSON.stringify([0, 1, 2].map(id)));
          await new Promise(r => setTimeout(r, 700));
          process.exit(4);
        }`);
      p.manifest.cli.subcommands = [{ name: 'ssh', effect: 'write', interactive: true, timeout_ms: 200 }];
      return { p, streams: () => JSON.parse(fs.readFileSync(out, 'utf8')) };
    };

    it('attaches to the terminal with no timeout and returns the exit code', async () => {
      const { p, streams } = makeSession('attached');
      const listeners = process.listenerCount('SIGINT');
      const running = runPluginCommand(p, { args: ['ssh', 'node'], stdin: 'inherit', cwd: root, tty: true });
      // Like a shell waiting on a job, the runner leaves Ctrl-C to the attached child.
      expect(process.listenerCount('SIGINT')).toBe(listeners + 1);
      const res = await running;
      expect(res).toMatchObject({ interactive: true, timedOut: false, ok: false, exitCode: 4, output: '', stdout: '' });
      expect(res.durationMs).toBeGreaterThanOrEqual(600);
      expect(streams()).toEqual([0, 1, 2].map(identity));
      expect(process.listenerCount('SIGINT')).toBe(listeners);
    });

    it('keeps pipes and the timeout off a terminal', async () => {
      const { p, streams } = makeSession('piped');
      const res = await runPluginCommand(p, { args: ['ssh', 'node'], stdin: 'inherit', cwd: root, tty: false });
      expect(res.interactive).toBeUndefined();
      expect(res.timedOut).toBe(true);
      expect(res.output).toContain('[runner] killed after 200 ms');
      const [, stdout, stderr] = streams();
      expect(stdout).not.toBe(identity(1));
      expect(stderr).not.toBe(identity(2));
    });

    it('never attaches a server call, a composable call or an undeclared command', async () => {
      const { p } = makeSession('bounded');
      for (const options of [{ tty: true }, { stdin: 'inherit', tty: true, composable: true }]) {
        const res = await runPluginCommand(p, { args: ['ssh', 'node'], cwd: root, ...options });
        expect(res.interactive).toBeUndefined();
        expect(res.timedOut).toBe(true);
      }
      p.manifest.cli.subcommands[0].interactive = false;
      const res = await runPluginCommand(p, { args: ['ssh', 'node'], stdin: 'inherit', cwd: root, tty: true });
      expect(res.timedOut).toBe(true);
    });
  });

  it('refuses a handler outside the plugin directory', async () => {
    const p = makePlugin(root, 'escape', '');
    p.manifest.cli.handler = '../echo/cli.mjs';
    await expect(runPluginCommand(p, { cwd: root })).rejects.toThrow(/outside the plugin directory/);
  });

  it('delivers a declared secret through stdin, excludes it from argv and suppresses echoed output', async () => {
    const p = makePlugin(root, 'secret-input', `import fs from 'node:fs';
      export async function run(argv) {
        const input = fs.readFileSync(0, 'utf8');
        if (input !== 'private-value' || argv.includes(input) || !argv.includes('--stdin')) process.exit(7);
        console.log(input); console.error(input);
      }`);
    p.manifest.cli.subcommands = [{ name: 'save', args: [{ name: 'key', type: 'string', secret: true }] }];
    const result = await runPluginCommand(p, { subcommand: 'save', stdinText: 'private-value', cwd: root });
    expect(result.ok).toBe(true);
    expect(result.output).toBe('');
  });

  it('rejects undeclared, ambiguous, invalid and oversized stdin before executing', async () => {
    const p = makePlugin(root, 'bad-input', 'export async function run() { process.exit(99); }');
    await expect(runPluginCommand(p, { subcommand: 'save', stdinText: 'private', cwd: root })).rejects.toThrow(/declared stdin/);
    p.manifest.cli.subcommands = [{ name: 'save', args: [{ name: 'key', type: 'string', secret: true }] }];
    for (const stdinText of [null, '', '😀'.repeat(16385)]) {
      await expect(runPluginCommand(p, { subcommand: 'save', stdinText, cwd: root })).rejects.toThrow(/65536 bytes/);
    }
    p.manifest.cli.subcommands[0].args.push({ name: 'other', type: 'string', secret: true });
    await expect(runPluginCommand(p, { subcommand: 'save', stdinText: 'private', cwd: root })).rejects.toThrow(/exactly one/);
  });
});
