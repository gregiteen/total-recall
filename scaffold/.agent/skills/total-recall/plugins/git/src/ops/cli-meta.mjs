import { spawnSync } from 'node:child_process';
import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { emit, jsonResult, stateStore, tr } from '../lib/runtime.mjs';
import { authGitEnv } from './auth.mjs';

const UPSTREAM = 'https://github.com/git/git';
const DAY = 24 * 60 * 60 * 1000;
const compare = (a, b) => {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
};

export function executable(name, ctx) {
  for (const dir of (ctx.env.PATH || '').split(path.delimiter)) {
    const file = path.resolve(ctx.cwd, dir, name);
    try { accessSync(file, constants.X_OK); if (statSync(file).isFile()) return file; } catch { /* try next PATH entry */ }
  }
  return null;
}

function tool(name, args, ctx, timeout = 15000) {
  const file = executable(name, ctx);
  if (!file) return { status: null };
  return spawnSync(file, args, { cwd: ctx.cwd, env: ctx.env, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'], timeout, maxBuffer: 16 * 1024 * 1024, shell: false });
}

function installSource(file, build, ctx) {
  if (/[/\\](?:Cellar|Homebrew|linuxbrew)[/\\]/i.test(file)) return 'brew';
  const brew = tool('brew', ['--prefix'], ctx);
  if (brew.status === 0 && brew.stdout?.trim()) {
    try { if (file.startsWith(`${realpathSync(brew.stdout.trim())}${path.sep}`)) return 'brew'; } catch { /* invalid prefix */ }
  }
  const apt = tool('dpkg-query', ['-S', file], ctx);
  if (apt.status === 0 && /^git(?::[^:\s]+)?:\s/m.test(apt.stdout || '')) return 'apt';
  if (file === '/usr/bin/git' && /Apple Git/i.test(build)) return 'apple-clt';
  return 'other';
}

async function upstream(ctx, force) {
  const store = await stateStore(ctx, 'upstream.json');
  const cached = store.read(null);
  const age = Date.now() - Date.parse(cached?.checked_at);
  if (!force && age >= 0 && age < DAY && Array.isArray(cached?.versions) && cached.versions.length &&
    cached.versions.every(v => /^\d+\.\d+\.\d+$/.test(v))) return { ...cached, cached: true, stale: false };
  const result = ctx.git(['ls-remote', '--tags', '--refs', UPSTREAM], {
    env: { ...await authGitEnv(ctx), GIT_TERMINAL_PROMPT: '0' }, timeout: 30000,
  });
  const versions = [...new Set((result.stdout || '').split('\n').flatMap(line => {
    const match = line.match(/^[0-9a-f]+\s+refs\/tags\/v(\d+\.\d+\.\d+)$/);
    return match ? [match[1]] : [];
  }))].sort(compare);
  if (result.status !== 0 || result.error || !versions.length) {
    return { versions: [], checked_at: cached?.checked_at ?? null, cached: false, stale: true, error: 'Cannot read stable upstream Git releases' };
  }
  const value = { versions, checked_at: new Date().toISOString() };
  store.write(value);
  return { ...value, cached: false, stale: false };
}

export async function collectCli(ctx, { force = false } = {}) {
  const command = executable('git', ctx);
  if (!command) throw new Error('Git executable was not found in PATH');
  const resolved = realpathSync(command);
  const versionRow = ctx.git(['--version']);
  const build = ctx.git(['version', '--build-options']);
  const version = versionRow.status === 0 && versionRow.stdout?.match(/^git version (\d+\.\d+\.\d+)(?:\D.*)?\s*$/)?.[1];
  if (!version || build.status !== 0) throw new Error('Cannot read the Git version and build options');
  const releases = await upstream(ctx, force);
  const latest = releases.versions.at(-1) ?? null;
  const hostname = os.hostname();
  const report = {
    version, resolved_path: resolved, install_source: installSource(resolved, versionRow.stdout, ctx),
    build_options: build.stdout.trimEnd(), latest_upstream: latest,
    release_notes_url: latest ? `${UPSTREAM}/blob/master/Documentation/RelNotes/${latest}.adoc` : null,
    versions_behind: latest ? releases.versions.filter(v => compare(v, version) > 0).length : null,
    checked_at: new Date().toISOString(), hostname,
    upstream_checked_at: releases.checked_at, upstream_cached: releases.cached, upstream_stale: releases.stale,
    ...(releases.error ? { error: releases.error } : {}),
  };
  const id = Buffer.from(hostname).toString('hex');
  const store = await stateStore(ctx, `cli-${id}.json`);
  store.read(null);
  store.write(report);
  const events = await stateStore(ctx, 'cli-events.jsonl');
  events.append({ type: 'git.cli_checked', timestamp: report.checked_at, ...report });
  return report;
}

async function allNodes(ctx) {
  const inventory = jsonResult(tr(['mesh', 'nodes', '--json'], ctx), 'Cannot read mesh nodes');
  if (!Array.isArray(inventory.nodes) || !inventory.nodes.length) throw new Error('Mesh returned no nodes');
  const nodes = [];
  for (const node of inventory.nodes) {
    const name = node.name || node.hostname || node.id;
    if (typeof name !== 'string' || !name || name.startsWith('-')) {
      nodes.push({ ok: false, error: 'Mesh node has no usable name' }); continue;
    }
    try {
      const result = jsonResult(tr(['mesh', 'exec', name, 'total-recall git cli --json'], ctx), 'Node CLI check failed');
      if (!result.version || !result.hostname || result.error || result.upstream_stale) throw new Error('Node CLI metadata is incomplete');
      nodes.push({ node: name, ok: true, ...result });
    } catch { nodes.push({ node: name, ok: false, error: 'Node CLI check failed' }); }
  }
  return { ok: nodes.every(node => node.ok), nodes };
}

async function update(ctx) {
  const before = await collectCli(ctx, { force: true });
  if (before.error) throw new Error(before.error);
  if (before.versions_behind === 0) return { ok: true, updated: false, cli: before };
  let result;
  switch (before.install_source) {
    case 'brew': result = tool('brew', ['upgrade', 'git'], ctx, 15 * 60 * 1000); break;
    case 'apt': result = tool('apt-get', ['install', '--only-upgrade', '-y', 'git'], ctx, 15 * 60 * 1000); break;
    case 'apple-clt':
      if (!executable('brew', ctx)) throw new Error('Apple Command Line Tools Git needs Homebrew; no installer is available');
      result = tool('brew', ['install', 'git'], ctx, 15 * 60 * 1000); break;
    default: throw new Error('Git install source is other; no supported updater is available');
  }
  if (result.status !== 0 || result.error || result.signal) throw new Error('The Git installer failed; check installer permissions and configured sources');
  const after = await collectCli(ctx);
  if (after.error || after.versions_behind !== 0) throw new Error('Git is still behind upstream; the configured source or PATH has no current Git');
  return { ok: true, updated: after.version !== before.version, previous_version: before.version, cli: after };
}

export const operations = {
  cli: {
    summary: 'Record Git CLI metadata or update Git through its installer',
    usage: 'cli [--json] [--all-nodes] | cli update [--scheduled]',
    async run(args, ctx) {
      const json = ctx.json || args.includes('--json');
      ctx = { ...ctx, json };
      const rest = args.filter(a => a !== '--json');
      const isUpdate = rest[0] === 'update';
      try {
        let report;
        if (!rest.length) report = await collectCli(ctx);
        else if (rest.length === 1 && rest[0] === '--all-nodes') report = await allNodes(ctx);
        else if (isUpdate && (rest.length === 1 || (rest.length === 2 && rest[1] === '--scheduled'))) report = await update(ctx);
        else throw new Error('Use cli [--all-nodes] or cli update [--scheduled]');
        emit(ctx, report, JSON.stringify(report, null, 2));
        return report.error || report.ok === false ? 1 : 0;
      } catch (error) {
        const reason = error.message;
        emit(ctx, { ok: false, error: reason, checked_at: new Date().toISOString(), hostname: os.hostname() }, `Git CLI check failed: ${reason}`);
        if (isUpdate) {
          // Fixed message only. Installer and service output can contain private data.
          const alert = tr(['alerts', 'send', '--title', 'Git update failed', '--message', 'Git remains out of date. Run total-recall git cli --json for details.'], ctx);
          if (alert.status !== 0) console.error('The operator alert could not be delivered');
        }
        return 1;
      }
    },
  },
};
