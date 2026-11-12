import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

export function fixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'git-phase3-spec-'));
  const repo = path.join(tmp, 'repo'); fs.mkdirSync(repo);
  const cwd = fs.realpathSync(repo);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Test Agent', GIT_AUTHOR_EMAIL: 'agent@example.com', GIT_COMMITTER_NAME: 'Test Agent', GIT_COMMITTER_EMAIL: 'agent@example.com', TR_PLUGIN_STATE_DIR: path.join(tmp, 'state'), TR_PACKAGE_ROOT: fileURLToPath(new URL('../../node_modules/total-recall-brain', import.meta.url)), CODEX_SESSION_ID: 'session-one' };
  delete env.CLAUDE_SESSION_ID;
  delete env.GIT_INDEX_FILE;
  // Specs run this checkout's CLI, never whatever version happens to be installed.
  const CLI = new URL('../../cli.mjs', import.meta.url).href;
  const RUN = `import(${JSON.stringify(CLI)}).then(m => m.run(['node', 'total-recall', 'git', ...process.argv.slice(1)])).then(() => process.exit(process.exitCode ?? 0))`;
  const git = (args, options = {}) => spawnSync(process.execPath, ['--input-type=module', '-e', RUN, ...args], { cwd, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  // Fixture setup uses plain git: setup is not the code under test, so no guard or record runs for it.
  const raw = (args, options = {}) => spawnSync('git', args, { cwd, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  const g = (...args) => { const r = raw(args); if (r.status !== 0) throw new Error(`Fixture git ${args[0]}: ${r.stderr}`); return r.stdout; };
  g('init', '-q', '-b', 'main');
  g('config', '--local', 'user.name', 'Test Agent');
  g('config', '--local', 'user.email', 'agent@example.com');
  g('config', '--local', 'commit.gpgsign', 'false');
  const write = (name, content) => { fs.mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true }); fs.writeFileSync(path.join(cwd, name), content); };
  const commit = (message = 'Initial', file = 'a.txt', body = 'one\ntwo\nthree\nfour\nfive\n') => { write(file, body); g('add', '--', file); g('commit', '-qm', message); return g('rev-parse', 'HEAD').trim(); };
  const responses = path.join(tmp, 'responses.json');
  const calls = path.join(tmp, 'calls.jsonl');
  const bin = path.join(tmp, 'total-recall-stub');
  fs.writeFileSync(responses, '{}');
  fs.writeFileSync(bin, `#!/usr/bin/env node
const fs=require('node:fs'),cp=require('node:child_process');
const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n');
const map=JSON.parse(fs.readFileSync(${JSON.stringify(responses)},'utf8'));
if(args[0]==='git'){const r=cp.spawnSync(process.execPath,['--input-type=module','-e',${JSON.stringify(RUN)},...args.slice(1)],{env:process.env,encoding:'utf8',input:fs.readFileSync(0)});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exitCode=r.status??1;}
else if(args[0]==='auth'&&args[2]==='list'&&!map['auth secret']){process.stdout.write(JSON.stringify({keys:[]}));}
else if(args[0]==='auth'&&args[2]==='scan'&&!map['auth secret']){fs.readFileSync(0);process.stdout.write(JSON.stringify({ok:true,leak:false,keys:[]}));}
else if(args[0]==='code-quality'&&map.gateFile){const ok=fs.readFileSync(map.gateFile,'utf8').includes('good');process.stdout.write(JSON.stringify({ok}));process.exitCode=ok?0:1;}
else{const r=map[args.slice(0,2).join(' ')]||map[args[0]]||{status:0,body:{}};process.stdout.write(typeof r.body==='string'?r.body:JSON.stringify(r.body));process.exitCode=r.status??0;}
`, { mode: 0o755 });
  env.GIT_PLUGIN_TR_BIN = bin;
  const set = map => fs.writeFileSync(responses, JSON.stringify(map));
  const readCalls = () => fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map(row => JSON.parse(row)) : [];
  const out = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const ctx = { cwd, env, json: true, git };
  const result = () => JSON.parse(out.mock.calls.at(-1)[0]);
  return { tmp, cwd, env, ctx, g, git, write, commit, set, readCalls, result, cleanup() { vi.restoreAllMocks(); fs.rmSync(tmp, { recursive: true, force: true }); } };
}
