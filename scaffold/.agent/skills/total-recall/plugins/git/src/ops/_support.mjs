import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
export function helpOnly(args) {
  const values = new Set(['-C', '-c', '-m', '-F', '-o', '--message', '--file', '--author', '--date',
    '--reuse-message', '--reedit-message', '--fixup', '--squash', '--trailer', '--cleanup',
    '--repo', '--receive-pack', '--exec', '--push-option', '--reason', '--git-dir', '--work-tree', '--namespace', '--config-env', '--pathspec-from-file']);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--') return false;
    if (values.has(args[i])) { i += 1; continue; }
    if (args[i] === '--help' || args[i] === '-h') return true;
    if (/^-[aneqvsiop]*[mFCc]$/.test(args[i])) i += 1;
  }
  return false;
}

/** Keep global git options attached to every inspection of the command. */
export function invocation(args, ctx) {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    if (['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env'].includes(args[i])) i += 2;
    else i += 1;
  }
  const prefix = args.slice(0, i);
  return { command: args[i], args: args.slice(i + 1), prefix,
    ctx: { ...ctx, git: (tail, options) => ctx.git([...prefix, ...tail], options) } };
}

export function gitText(ctx, args, options) {
  const row = ctx.git(args, options);
  if (row.error || (row.status ?? row.code) !== 0) throw new Error(`Git ${args[0]} failed`);
  return Buffer.isBuffer(row.stdout) ? row.stdout.toString('utf8') : String(row.stdout ?? '');
}

/** Do not forward child diagnostics: an auth failure can contain a credential. */
export function tr(ctx, args) {
  const result = spawnSync(ctx.env?.GIT_PLUGIN_TR_BIN || 'total-recall', args, {
    cwd: ctx.cwd, env: ctx.env, encoding: 'utf8', shell: false,
    timeout: 30000, maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(`Total Recall ${args.slice(0, 3).join(' ')} failed`);
  return result.stdout;
}
export function trJson(ctx, args) {
  try { return JSON.parse(tr(ctx, args)); }
  catch { throw new Error(`Total Recall ${args.slice(0, 3).join(' ')} returned no valid result`); }
}

export async function stateStore(ctx, name = 'events') {
  const dir = ctx.env?.TR_PLUGIN_STATE_DIR;
  if (!dir || !path.isAbsolute(dir)) throw new Error('TR_PLUGIN_STATE_DIR must be supplied by the Total Recall host');
  const root = ctx.env?.TR_PACKAGE_ROOT;
  let modulePath;
  if (root) {
    if (!path.isAbsolute(root) || JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).name !== 'total-recall-brain') {
      throw new Error('Invalid Total Recall state host');
    }
    modulePath = path.join(root, 'src/core/plugin-state-store.mjs');
  } else modulePath = require.resolve('total-recall-brain/src/core/plugin-state-store.mjs');
  const { PluginStateStore } = await import(pathToFileURL(modulePath).href);
  return new PluginStateStore(path.join(dir, `${name}.jsonl`), 'git');
}

export function repoId(ctx) {
  return gitText(ctx, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim();
}

/** Inspect the index git would commit. Never change the user's index here. */
export function prospectiveCommit(ctx, args) {
  const paths = [];
  const pathFlags = [];
  const valueOptions = new Set(['--message', '--file', '--author', '--date', '--reuse-message', '--reedit-message', '--fixup', '--squash', '--trailer', '--cleanup']);
  let all = false, include = false, only = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') { paths.push(...args.slice(i + 1)); break; }
    if (['--interactive', '--patch'].includes(arg)) throw new Error('Stage interactive changes before commit so the guards can inspect them');
    if (arg === '--all') { all = true; continue; }
    if (arg === '--include') { include = true; continue; }
    if (arg === '--only') { only = true; continue; }
    if (arg === '--pathspec-from-file') { pathFlags.push(arg, args[++i]); continue; }
    if (arg.startsWith('--pathspec-from-file=') || arg === '--pathspec-file-nul') { pathFlags.push(arg); continue; }
    if (valueOptions.has(arg)) { i += 1; continue; }
    if (arg.startsWith('--')) continue;
    if (arg.startsWith('-')) {
      for (let j = 1; j < arg.length; j += 1) {
        const flag = arg[j];
        if ('mFCc'.includes(flag)) { if (j === arg.length - 1) i += 1; break; }
        if (flag === 'a') all = true;
        if (flag === 'i') include = true;
        if (flag === 'o') only = true;
        if (flag === 'p') throw new Error('Stage interactive changes before commit so the guards can inspect them');
        // -S/-u take an optional attached value. It is not a flag cluster.
        if ('Su'.includes(flag)) break;
      }
    } else paths.push(arg);
  }
  if (!all && !only && !include && !paths.length && !pathFlags.length) return { ctx, cleanup() {} };
  if (pathFlags.some(a => a === '--pathspec-from-file=-' || a === '-')) throw new Error('Stage stdin pathspecs before commit');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'git-prospective-index-'));
  const env = { ...ctx.env, GIT_INDEX_FILE: path.join(dir, 'index') };
  const local = { ...ctx, git: (a, options = {}) => ctx.git(a, { ...options, env }) };
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  try {
    const index = gitText(ctx, ['rev-parse', '--path-format=absolute', '--git-path', 'index']).trim();
    if ((paths.length || pathFlags.length || only) && !include) {
      const head = ctx.git(['rev-parse', '--verify', 'HEAD']);
      gitText(local, ['read-tree', ...(head.status === 0 ? ['HEAD'] : ['--empty'])]);
    } else if (existsSync(index)) copyFileSync(index, env.GIT_INDEX_FILE);
    else gitText(local, ['read-tree', '--empty']);
    if (all) gitText(local, ['add', '-u']);
    if (paths.length || pathFlags.length) gitText(local, ['add', '--all', ...pathFlags, '--', ...paths]);
    return { ctx: local, cleanup };
  } catch (error) { cleanup(); throw error; }
}

/** Scan every local branch and tag that the selected remote does not contain.
 * A missing remote object is not an exclusion. This can over-scan, never under-scan.
 */
/**
 * The commits this push would publish: exactly the refs git itself would update
 * (`git push --dry-run --porcelain` with the same arguments), minus what the remote already has.
 * Local branches the push does not send are never counted.
 */
export function outgoingCommits(ctx, args = []) {
  const dry = ctx.git(['push', '--dry-run', '--porcelain', ...args.filter(a => a !== '--porcelain' && a !== '--dry-run')]);
  if (dry.error || ![0, 1].includes(dry.status)) return allUnpushedCommits(ctx, args);
  const tips = [];
  let remote = null;
  for (const line of String(dry.stdout || '').split('\n')) {
    if (line.startsWith('To ')) { remote = line.slice(3).trim(); continue; }
    const m = line.match(/^([ +\-*=!])\t([^:\t]*):([^\t]+)\t/);
    if (!m || m[1] === '=' || m[1] === '-' || m[1] === '!' || !m[2]) continue;
    const resolved = ctx.git(['rev-parse', '--verify', '--end-of-options', `${m[2]}^{commit}`]);
    if (resolved.status === 0) tips.push(resolved.stdout.trim());
  }
  if (!tips.length) return [];
  const advertised = remote ? ctx.git(['ls-remote', '--', remote]) : { status: 1, stdout: '' };
  const excluded = [...new Set(String(advertised.stdout || '').split('\n').map(line => line.split(/\s+/)[0]).filter(oid => /^[a-f0-9]{40,64}$/.test(oid)))]
    .filter(oid => ctx.git(['cat-file', '-e', `${oid}^{commit}`]).status === 0);
  return gitText(ctx, ['rev-list', ...new Set(tips), ...(excluded.length ? ['--not', ...excluded] : []), '--']).trim().split('\n').filter(Boolean);
}

/** Every unpushed local commit: the conservative superset used when git cannot say what a push sends. */
function allUnpushedCommits(ctx, args = []) {
  const takesValue = new Set(['--repo', '--receive-pack', '--exec', '--push-option', '-o']);
  const positional = [];
  let remoteOption;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (takesValue.has(a)) { if (a === '--repo') remoteOption = args[i + 1]; i += 1; }
    else if (a.startsWith('--repo=')) remoteOption = a.slice(7);
    else if (a === '--') positional.push(...args.slice(i + 1));
    else if (!a.startsWith('-')) positional.push(a);
    if (a === '--') break;
  }
  const branch = ctx.git(['symbolic-ref', '--short', '-q', 'HEAD']);
  const config = key => {
    const result = ctx.git(['config', '--get', key]);
    return result.status === 0 ? result.stdout.trim() : '';
  };
  const remote = remoteOption || positional[0] ||
    config(`branch.${branch.stdout?.trim()}.pushRemote`) || config('remote.pushDefault') ||
    config(`branch.${branch.stdout?.trim()}.remote`) || 'origin';
  const advertised = gitText(ctx, ['ls-remote', '--', remote]);
  const excluded = [...new Set(advertised.split('\n').map(line => line.split(/\s+/)[0]).filter(oid => /^[a-f0-9]{40,64}$/.test(oid)))].filter(oid =>
    ctx.git(['cat-file', '-e', `${oid}^{commit}`]).status === 0);
  const tips = gitText(ctx, ['for-each-ref', '--format=%(objectname)', 'refs/heads', 'refs/tags']).trim().split('\n').filter(Boolean);
  const head = ctx.git(['rev-parse', '--verify', 'HEAD']);
  if (head.status === 0) tips.push(head.stdout.trim());
  // Explicit source expressions may name commits outside branches and tags.
  for (const spec of positional.slice(remoteOption ? 0 : 1)) {
    const source = spec.replace(/^\+/, '').split(':')[0];
    if (!source || source.includes('*')) continue;
    const result = ctx.git(['rev-parse', '--verify', '--end-of-options', `${source}^{commit}`]);
    if (result.status === 0) tips.push(result.stdout.trim());
  }
  if (!tips.length) return [];
  return gitText(ctx, ['rev-list', ...new Set(tips), ...(excluded.length ? ['--not', ...excluded] : []), '--']).trim().split('\n').filter(Boolean);
}

export function output(ctx, value, text) {
  if (ctx.json) console.log(JSON.stringify(value, null, 2));
  else console.log(text);
}
export function failure(ctx, error) {
  if (ctx.json) console.log(JSON.stringify({ ok: false, error: error.message }));
  else console.error(error.message);
  return 1;
}
