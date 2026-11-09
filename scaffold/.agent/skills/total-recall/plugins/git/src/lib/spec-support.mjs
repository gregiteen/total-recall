import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-plugin-spec-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const calls = path.join(dir, 'calls.jsonl');
  const writeBin = (name, source) => {
    const file = path.join(bin, name);
    fs.writeFileSync(file, `#!${process.execPath}\n${source}`, { mode: 0o700 });
    return file;
  };
  const tr = writeBin('tr-stub', `
    import fs from 'node:fs';
    const args = process.argv.slice(2);
    fs.appendFileSync(process.env.SPEC_CALLS, JSON.stringify(args) + '\\n');
    if (args[0] === 'auth' && args[2] === 'get') {
      if (process.env.SPEC_AUTH_FAIL) { console.error('fixture-sensitive-diagnostic'); process.exitCode = 1; }
      else console.log(JSON.stringify({ found: !process.env.SPEC_AUTH_MISSING, value: process.env.SPEC_TOKEN || 'fixture-token' }));
    } else if (args[0] === 'auth' && args[2] === 'list') {
      console.log(JSON.stringify({ keys: [{ key: 'github_token' }, { key: 'GITLAB_TOKEN' }] }));
    } else if (args[0] === 'mesh' && args[1] === 'nodes') {
      console.log(JSON.stringify({ nodes: [{ name: 'alpha' }, { name: 'beta' }] }));
    } else if (args[0] === 'mesh' && args[1] === 'exec') {
      if (process.env.SPEC_NODE_FAIL && args[2] === 'beta') process.exitCode = 1;
      else console.log(JSON.stringify({ version: '2.52.0', hostname: args[2], versions_behind: 0 }));
    } else if (args[0] !== 'alerts') process.exitCode = 1;
  `);
  const env = { ...process.env, HOME: dir, GIT_CONFIG_GLOBAL: path.join(dir, 'gitconfig'),
    GIT_CONFIG_NOSYSTEM: '1', TR_PLUGIN_STATE_DIR: path.join(dir, 'state'),
    TR_PACKAGE_ROOT: fileURLToPath(new URL('../../node_modules/total-recall-brain', import.meta.url)),
    GIT_PLUGIN_TR_BIN: tr, SPEC_CALLS: calls, PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    GIT_AUTHOR_NAME: 'Fixture Person', GIT_AUTHOR_EMAIL: 'fixture@example.com',
    GIT_COMMITTER_NAME: 'Fixture Person', GIT_COMMITTER_EMAIL: 'fixture@example.com',
  };
  for (const key of Object.keys(env)) if (/^GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+)$/.test(key)) delete env[key];
  return { dir, bin, env, writeBin,
    calls: () => fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [],
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

export function realContext(f) {
  return { cwd: f.dir, env: f.env, json: false,
    git: (args, options = {}) => spawnSync('git', args, { cwd: f.dir, env: f.env, encoding: 'utf8', ...options }),
  };
}
