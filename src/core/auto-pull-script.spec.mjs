import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/auto-pull.sh');

const git = (cwd, ...args) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' },
  });

function runScript(env) {
  return new Promise((resolve) => {
    const child = spawn('bash', [SCRIPT], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
  });
}

describe('auto-pull.sh clean-checkout check', () => {
  let tmp;
  let server;
  let port;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-autopull-'));
    const origin = path.join(tmp, 'origin.git');
    const seed = path.join(tmp, 'seed');
    const nested = path.join(seed, 'catalog');
    git(tmp, 'init', '-q', '--bare', '-b', 'main', origin);
    fs.mkdirSync(nested, { recursive: true });
    git(nested, 'init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(nested, 'a.txt'), 'one\n');
    git(nested, 'add', '.');
    git(nested, 'commit', '-q', '-m', 'one');
    git(seed, 'init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(seed, 'package.json'), JSON.stringify({ name: 'fixture', version: '9.9.9' }));
    git(seed, 'add', 'package.json', 'catalog'); // records catalog as a gitlink
    git(seed, 'commit', '-q', '-m', 'seed');
    git(seed, 'remote', 'add', 'origin', origin);
    git(seed, 'push', '-q', 'origin', 'main');
    // The embedded repository moves on by itself.
    fs.writeFileSync(path.join(nested, 'a.txt'), 'two\n');
    git(nested, 'commit', '-q', '-am', 'two');

    // A brain already serving the checked-out version, so the script stops at "up to date".
    server = http.createServer((_req, res) => res.end(JSON.stringify({ version: '9.9.9' })));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
  });

  afterEach(async () => {
    await new Promise((r) => server.close(r));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const env = () => ({
    HOME: path.join(tmp, 'home'),
    TR_REPO_DIR: path.join(tmp, 'seed'),
    TR_PORT: String(port),
    TR_ENV_FILE: path.join(tmp, 'no-env-file'),
    TR_AUTOPULL_NO_BUILD: '1',
  });

  it('is not blocked by an embedded repository that moved on its own', async () => {
    expect(git(path.join(tmp, 'seed'), 'status', '--porcelain')).toContain('catalog');
    const { code, out } = await runScript(env());
    expect(out).not.toContain('Uncommitted changes');
    expect(out).toContain('Up to date and serving 9.9.9');
    expect(code).toBe(0);
  });

  it('still refuses to update over real uncommitted work', async () => {
    fs.writeFileSync(path.join(tmp, 'seed', 'package.json'), JSON.stringify({ name: 'fixture', version: '9.9.10' }));
    const { code, out } = await runScript(env());
    expect(out).toContain('Uncommitted changes to tracked files — not updating: package.json');
    expect(code).toBe(0);
  });
});
