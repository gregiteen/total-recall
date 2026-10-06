import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const meshCalls = [];
vi.mock('./mesh.mjs', () => ({
  findMeshNode: (name) => ({ hostname: name, ip: '100.64.0.99' }),
  getMeshSelf: () => ({ ip: '100.64.0.1' }),
  execMeshCommand: async (node, command, options) => {
    meshCalls.push({ node, command, options });
    return { success: true, exitCode: 0, stdout: JSON.stringify({ id: 'agent-claude-remote', status: 'running' }), stderr: '' };
  },
}));

const { listAgents, isProcessRunning, spawnAgent, buildRemoteSpawnCommand } = await import('./agent-manager.mjs');

let tmp;
let savedEnv;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-agent-'));
  savedEnv = { HOME: process.env.HOME, PATH: process.env.PATH, TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN };
  // Registry and logs land under the temporary home, never the real one.
  process.env.HOME = tmp;
  meshCalls.length = 0;
});

afterEach(() => {
  process.env.HOME = savedEnv.HOME;
  process.env.PATH = savedEnv.PATH;
  if (savedEnv.TOKEN === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  else process.env.CLAUDE_CODE_OAUTH_TOKEN = savedEnv.TOKEN;
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A stand-in `claude` that reports its argv, cwd and whether auth reached it. */
function installFakeClaude() {
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  const script = path.join(bin, 'claude');
  fs.writeFileSync(
    script,
    `#!/bin/sh\nfor a in "$@"; do printf '[%s]' "$a"; done\nprintf '\\ncwd=%s\\n' "$PWD"\nprintf 'token=%s\\n' "\${CLAUDE_CODE_OAUTH_TOKEN:+set}"\n`,
  );
  fs.chmodSync(script, 0o755);
  process.env.PATH = `${bin}${path.delimiter}${savedEnv.PATH}`;
}

describe('Agent Process Manager', () => {
  it('lists agents and returns an array', () => {
    expect(Array.isArray(listAgents())).toBe(true);
  });

  it('checks process liveness correctly for current process and invalid pid', () => {
    expect(isProcessRunning(process.pid)).toBe(true);
    expect(isProcessRunning(999999999)).toBe(false);
    expect(isProcessRunning(null)).toBe(false);
  });

  it('throws on unknown harness ID for spawnAgent', async () => {
    await expect(spawnAgent('invalid-harness', 'test task')).rejects.toThrow('Unknown harness ID "invalid-harness"');
  });
});

describe('local spawn', () => {
  it('runs Claude Code with its tools, in the requested directory, with the OAuth token', async () => {
    installFakeClaude();
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'tok';
    const work = fs.realpathSync(fs.mkdtempSync(path.join(tmp, 'work-')));
    const res = await spawnAgent('claude', 'search the web', { detach: false, cwd: work });
    expect(res.status).toBe('completed');
    expect(res.output).not.toContain('[--tools]');
    expect(res.output).not.toContain('[--setting-sources]');
    expect(res.output).toContain('[-p][search the web]');
    expect(res.output).toContain(`cwd=${work}`);
    expect(res.output).toContain('token=set');
    expect(res.tools).toBe('default');
  });

  it('narrows the tool set only when asked', async () => {
    installFakeClaude();
    const none = await spawnAgent('claude', 'answer', { detach: false, tools: 'none' });
    expect(none.output).toContain('[--tools][][-p][answer]');
    expect(none.tools).toBe('none');
    const some = await spawnAgent('claude', 'answer', { detach: false, tools: 'Bash,WebFetch' });
    expect(some.output).toContain('[--tools][Bash,WebFetch][-p]');
  });

  it('fails fast on a missing working directory', async () => {
    installFakeClaude();
    await expect(spawnAgent('claude', 'x', { detach: false, cwd: path.join(tmp, 'nope') })).rejects.toThrow(
      /Working directory does not exist/,
    );
  });

  it('rejects a tool selection the harness cannot honour before spawning anything', async () => {
    await expect(spawnAgent('codex', 'x', { tools: 'none' })).rejects.toThrow(/does not support choosing its tool set/);
  });
});

describe('remote spawn', () => {
  it('forwards cwd, tools and name to the node, shell-quoted', async () => {
    const record = await spawnAgent('claude', "lead search; don't $(break)", {
      node: 'build-box',
      cwd: '~/code/app',
      tools: '',
      name: 'Lead Scout',
    });
    expect(meshCalls).toHaveLength(1);
    const { command } = meshCalls[0];
    expect(command).toContain("'--cwd' '~/code/app'");
    expect(command).toContain("'--tools' ''");
    expect(command).toContain("'--name' 'Lead Scout'");
    expect(record).toMatchObject({ id: 'agent-claude-remote', remote: true, node: 'build-box', status: 'running' });
  });

  it('builds a command a POSIX shell parses back to the original arguments', () => {
    const cmd = buildRemoteSpawnCommand('claude', "it's `x` $HOME", { cwd: '/srv/a b', tools: ['Bash', 'Read'] });
    const out = spawnSync('sh', ['-c', `set -- ${cmd}; for a in "$@"; do printf '%s\\n' "$a"; done`], { encoding: 'utf8' });
    expect(out.stdout.trim().split('\n')).toEqual([
      'total-recall', 'agent', 'spawn', 'claude', "it's `x` $HOME", '--cwd', '/srv/a b', '--tools', 'Bash,Read', '--json',
    ]);
  });
});
