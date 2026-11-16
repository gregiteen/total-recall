import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureHome } from './process-home.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('ensureHome', () => {
  it('sets HOME from the account when it is missing', () => {
    const env = {};
    expect(ensureHome(env, { homedir: () => '/root', platform: 'linux' })).toBe('/root');
    expect(env.HOME).toBe('/root');
  });

  it('keeps a HOME that is already set', () => {
    const env = { HOME: '/home/agent' };
    expect(ensureHome(env, { homedir: () => '/root', platform: 'linux' })).toBe('/home/agent');
    expect(env.HOME).toBe('/home/agent');
  });

  it('leaves HOME unset when the account has no home or lookup fails', () => {
    const empty = {};
    ensureHome(empty, { homedir: () => '', platform: 'linux' });
    expect('HOME' in empty).toBe(false);
    const failing = {};
    ensureHome(failing, { homedir: () => { throw new Error('no passwd entry'); }, platform: 'linux' });
    expect('HOME' in failing).toBe(false);
  });

  it('changes nothing on Windows', () => {
    const env = {};
    ensureHome(env, { homedir: () => 'C:\\Users\\agent', platform: 'win32' });
    expect('HOME' in env).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('gives a process started without HOME, and its children, the account home', () => {
    const { HOME, ...env } = process.env;
    const script = `await import(${JSON.stringify(path.join(here, 'process-home.mjs'))});
const { execFileSync } = await import('node:child_process');
console.log(process.env.HOME + '|' + execFileSync(process.execPath, ['-p', 'process.env.HOME'], { encoding: 'utf8' }).trim());`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    const home = os.userInfo().homedir;
    expect(result.stdout.trim()).toBe(`${home}|${home}`);
  });
});
