import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { failure, gitText, output, trJson } from './_support.mjs';
import { inspectUnmerged } from './unmerged.mjs';

const STALE_MS = 30 * 24 * 60 * 60 * 1000;

export function registeredRepositories(ctx) {
  let data;
  try { data = trJson(ctx, ['brain', 'list', '--json']); } catch { /* Older brain list has no JSON mode. */ }
  const normalize = value => {
    const rows = Array.isArray(value) ? value : value?.projects || value?.brains || value?.repositories;
    if (!Array.isArray(rows)) return null;
    const paths = rows.map(row => typeof row === 'string' ? row : row?.path || row?.root || row?.projectPath);
    if (paths.some(p => typeof p !== 'string' || !path.isAbsolute(p))) throw new Error('Project registry contains an invalid repository path');
    return [...new Set(paths)];
  };
  const rows = normalize(data);
  if (rows) return rows;
  const file = ctx.env?.GIT_PLUGIN_REGISTRY_FILE || path.join(ctx.env?.TR_GLOBAL_BRAIN || ctx.env?.TR_SECRETS_BRAIN || path.join(os.homedir(), '.agent', 'skills', 'total-recall'), 'config', 'project-registry.json');
  const fallback = normalize(JSON.parse(readFileSync(file, 'utf8')));
  if (!fallback) throw new Error('Project registry has no repository list');
  return fallback;
}

/**
 * A registered brain need not be a git repository (personal workspace brains,
 * plain folders); that is not a failure. A registered path that is gone is.
 */
export function registeredPathState(directory, ctx) {
  if (!existsSync(directory)) return 'missing';
  const inside = ctx.git(['-C', directory, 'rev-parse', '--is-inside-work-tree']);
  return inside.status === 0 && String(inside.stdout).trim() === 'true' ? 'repository' : 'not-a-repository';
}

export function inspectRepository(directory, ctx, now = Date.now()) {
  const local = { ...ctx, git: (args, options) => ctx.git(['-C', directory, ...args], options) };
  const errors = [];
  const report = { path: directory, dirty: null, unpushed: null, behind: null, diverged: null,
    staleStashes: null, abandonedWorktrees: null, unmerged: null, upstream: null, errors };
  const get = args => {
    try { return gitText(local, args); } catch { errors.push(args[0]); return null; }
  };
  const state = registeredPathState(directory, ctx);
  if (state === 'missing') return { ...report, error: 'Registered path does not exist' };
  if (state === 'not-a-repository') return { ...report, notRepository: true };
  const status = get(['status', '--porcelain=v1', '-z']);
  if (status !== null) report.dirty = status.length > 0;
  const upstream = local.git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  if (upstream.status === 0) {
    report.upstream = upstream.stdout.trim();
    const counts = get(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'])?.trim().match(/^(\d+)\s+(\d+)$/);
    if (counts) { report.behind = Number(counts[1]); report.unpushed = Number(counts[2]); report.diverged = report.behind > 0 && report.unpushed > 0; }
  } else {
    // No upstream is unknown sync state, not zero unpushed commits.
    report.upstreamStatus = 'unavailable';
    if (!/no upstream configured|no such branch|does not point to a branch|unknown revision/i.test(upstream.stderr || '')) errors.push('upstream');
  }
  const stashes = get(['stash', 'list', '--format=%H%x00%ct%x00%gs']);
  if (stashes !== null) report.staleStashes = stashes.split('\n').filter(Boolean).flatMap(row => {
    const [commit, timestamp, message] = row.split('\0');
    return Number(timestamp) * 1000 < now - STALE_MS ? [{ commit, timestamp: Number(timestamp), message }] : [];
  });
  const trees = get(['worktree', 'list', '--porcelain', '-z']);
  if (trees !== null) report.abandonedWorktrees = trees.split('\0\0').filter(Boolean).slice(1).flatMap(record => {
    const fields = Object.fromEntries(record.split('\0').filter(Boolean).map(row => {
      const i = row.indexOf(' '); return i < 0 ? [row, true] : [row.slice(0, i), row.slice(i + 1)];
    }));
    if (fields.locked) return [];
    if (fields.prunable || !existsSync(fields.worktree)) return [{ path: fields.worktree, reason: 'missing-or-prunable' }];
    const treeCtx = { ...ctx, git: (a, options) => ctx.git(['-C', fields.worktree, ...a], options) };
    const state = treeCtx.git(['status', '--porcelain=v1', '-z']);
    const last = treeCtx.git(['log', '-1', '--format=%ct']);
    if (state.status !== 0 || last.status !== 0) { errors.push('worktree-inspection'); return []; }
    return !state.stdout && Number(last.stdout.trim()) * 1000 < now - STALE_MS
      ? [{ path: fields.worktree, reason: 'clean-with-old-head', candidate: true }] : [];
  });
  // Branches and worktrees holding work the default branch lacks (unmerged.mjs owns the rule).
  try {
    const unmerged = inspectUnmerged(directory, ctx);
    if (unmerged.error) errors.push('unmerged'); else report.unmerged = unmerged.outstanding;
  } catch { errors.push('unmerged'); }
  return report;
}

function containingCheckouts(directory, commit, ctx) {
  const local = { ...ctx, git: (args, options) => ctx.git(['-C', directory, ...args], options) };
  const oid = gitText(local, ['rev-parse', '--verify', '--end-of-options', `${commit}^{commit}`]).trim();
  const refs = gitText(local, ['for-each-ref', `--contains=${oid}`, '--format=%(refname)', 'refs/heads', 'refs/remotes', 'refs/tags']).trim().split('\n').filter(Boolean);
  const records = gitText(local, ['worktree', 'list', '--porcelain', '-z']).split('\0\0').filter(Boolean);
  const checkouts = [];
  for (const record of records) {
    const file = record.split('\0').find(row => row.startsWith('worktree '))?.slice(9);
    if (!file) continue;
    const contains = ctx.git(['-C', file, 'merge-base', '--is-ancestor', oid, 'HEAD']);
    if (contains.status === 0) checkouts.push(file);
    else if (contains.status !== 1) throw new Error('Cannot inspect a registered checkout');
  }
  return { path: directory, commit: oid, objectPresent: true, refs, checkouts };
}

function localReport(ctx, commit) {
  const errors = [];
  const repositories = [];
  for (const directory of registeredRepositories(ctx)) {
    try {
      if (commit) {
        const contains = ctx.git(['-C', directory, 'cat-file', '-e', `${commit}^{commit}`]);
        if (contains.status !== 0) {
          if (registeredPathState(directory, ctx) === 'missing') errors.push({ path: directory, error: 'Registered path does not exist' });
          continue;
        }
        repositories.push(containingCheckouts(directory, commit, ctx));
      } else {
        const report = inspectRepository(directory, ctx);
        repositories.push(report);
        if (report.error || report.errors.length) errors.push({ path: directory, error: report.error || report.errors.join(', ') });
      }
    } catch { errors.push({ path: directory, error: 'Repository inspection failed' }); }
  }
  return { node: os.hostname(), repositories, errors, observedAt: new Date().toISOString(), syncSource: 'local refs; no fetch' };
}

function remoteReports(ctx, commit) {
  const inventory = trJson(ctx, ['mesh', 'nodes', '--json']);
  const rows = Array.isArray(inventory) ? inventory : inventory.nodes;
  if (!Array.isArray(rows)) throw new Error('Mesh returned no node list');
  const reports = [];
  const seen = new Set();
  for (const node of rows) {
    const name = typeof node === 'string' ? node : node.hostname || node.name || node.id;
    if (!name || seen.has(name) || name === os.hostname() || node.self || node.isLocal || node.isCurrentNode) continue;
    seen.add(name);
    try {
      if (node.online === false || node.status === 'offline') throw new Error('Node is offline');
      // Mesh joins words for remote execution. Quote the whole fixed command once.
      const quote = word => `'${word.replaceAll("'", "'\\''")}'`;
      const namespace = 'git';
      const command = ['total-recall', namespace, commit ? 'where' : 'fleet', ...(commit ? [commit, '--local'] : []), '--json'].map(quote).join(' ');
      const response = trJson(ctx, ['mesh', 'exec', name, command, '--json']);
      if (response.exitCode !== 0 || typeof response.stdout !== 'string') throw new Error('Remote command failed');
      const parsed = JSON.parse(response.stdout);
      if (!Array.isArray(parsed.nodes) || typeof parsed.ok !== 'boolean') throw new Error('Remote report is invalid');
      reports.push(...parsed.nodes);
    } catch { reports.push({ node: name, repositories: [], errors: [{ error: 'Node is unavailable or returned no valid report' }] }); }
  }
  return reports;
}

async function run(args, ctx, where = false) {
  try {
    const flags = new Set(where ? ['--local', '--all-nodes'] : ['--all-nodes']);
    const words = args.filter(a => !a.startsWith('-'));
    if (args.some(a => a.startsWith('-') && !flags.has(a)) || words.length !== (where ? 1 : 0)) throw new Error(where ? 'Use where <commit> [--local]' : 'Use fleet [--all-nodes]');
    const commit = words[0];
    if (where && !/^[a-f0-9]{4,64}$/i.test(commit)) throw new Error('Supply a commit object id (4 to 64 hexadecimal characters)');
    const nodes = [localReport(ctx, commit)];
    if (args.includes('--all-nodes') || where && !args.includes('--local')) nodes.push(...remoteReports(ctx, commit));
    const ok = nodes.every(node => !node.errors?.length);
    const result = { ok, ...(where ? { commit } : {}), nodes };
    const lines = nodes.flatMap(node => [node.node, ...node.repositories.map(repo => repo.notRepository ? `  ${repo.path}: not a git repository` : where
      ? `  ${repo.path}: ${repo.checkouts.length} checkouts; ${repo.refs.length} refs`
      : `  ${repo.path}: dirty=${repo.dirty ?? 'unknown'} unpushed=${repo.unpushed ?? 'unknown'} behind=${repo.behind ?? 'unknown'} diverged=${repo.diverged ?? 'unknown'} stale-stashes=${repo.staleStashes?.length ?? 'unknown'} abandoned-worktrees=${repo.abandonedWorktrees?.length ?? 'unknown'} unmerged=${repo.unmerged ?? 'unknown'}`),
    ...(node.errors || []).map(e => `  unavailable: ${e.path || node.node}`)]);
    output(ctx, result, lines.join('\n'));
    return ok ? 0 : 1;
  } catch (error) { return failure(ctx, error); }
}

export const operations = {
  fleet: { summary: 'Report repository state (including unmerged branches and worktrees) on this node or every mesh node', usage: 'fleet [--all-nodes] [--json]', run: (args, ctx) => run(args, ctx) },
  where: { summary: 'Find machines and checkouts that contain a commit', usage: 'where <commit> [--local] [--json]', run: (args, ctx) => run(args, ctx, true) },
};
