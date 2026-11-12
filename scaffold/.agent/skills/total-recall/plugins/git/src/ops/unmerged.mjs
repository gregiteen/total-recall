import { existsSync } from 'node:fs';
import path from 'node:path';
import { failure, gitText, output } from './_support.mjs';
import { registeredPathState, registeredRepositories } from './fleet.mjs';

/**
 * Work that never reached the default branch: local branches with commits the
 * default branch does not contain, linked worktrees with uncommitted changes,
 * and detached worktrees holding commits no branch contains (removing such a
 * worktree loses them).
 *
 * Nothing reported this before. A week of drawer UI work sat on an unpushed
 * branch with 256 uncommitted files in a worktree, and about 35 plugin
 * worktrees sat beside it, while every status said the repositories were fine.
 *
 * A commit counts as landed when the default branch (local or origin) reaches
 * it, or holds an equivalent patch (`git cherry`), so rebased and
 * cherry-picked work is not reported. A squash merge is a different patch and
 * still shows; delete the branch once it has landed. A branch the operator
 * keeps on purpose (`git config --add totalrecall.keepBranch <name>`) is
 * listed as kept and not counted.
 */

const SUMMARY_LIMIT = 480;

function localCtx(ctx, directory) {
  return { ...ctx, git: (args, options) => ctx.git(['-C', directory, ...args], options) };
}

const refExists = (local, ref) => local.git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).status === 0;

/** The default branch: origin's HEAD, else local main or master, else init.defaultBranch. */
export function defaultBranch(local) {
  const originHead = local.git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
  const fromOrigin = originHead.status === 0 ? originHead.stdout.trim().replace(/^refs\/remotes\/origin\//, '') : null;
  const configured = local.git(['config', '--get', 'init.defaultBranch']);
  const candidates = [fromOrigin, 'main', 'master', configured.status === 0 ? configured.stdout.trim() : null].filter(Boolean);
  for (const name of candidates) {
    const localRef = `refs/heads/${name}`, remoteRef = `refs/remotes/origin/${name}`;
    const refs = [localRef, remoteRef].filter(ref => refExists(local, ref));
    if (refs.length) return { name, refs };
  }
  return null;
}

/** Non-merge commits on `tip` that no default ref reaches and whose patch the default branch lacks. */
function uniqueCommits(local, tip, base) {
  const unreached = gitText(local, ['rev-list', '--no-merges', tip, '--not', ...base.refs, '--']).split('\n').filter(Boolean);
  if (!unreached.length) return [];
  const cherry = new Set(gitText(local, ['cherry', base.refs[0], tip]).split('\n')
    .filter(line => line.startsWith('+ ')).map(line => line.slice(2).trim()));
  return unreached.filter(commit => cherry.has(commit));
}

function parseWorktrees(text) {
  return text.split('\0\0').filter(Boolean).map(record => Object.fromEntries(record.split('\0').filter(Boolean).map(row => {
    const i = row.indexOf(' ');
    return i < 0 ? [row, true] : [row.slice(0, i), row.slice(i + 1)];
  })));
}

/** Inspect one repository. Never fetches: remote refs are as of the last fetch. */
export function inspectUnmerged(directory, ctx) {
  const local = localCtx(ctx, directory);
  const report = { path: directory, defaultBranch: null, outstanding: 0, branches: [], kept: [], worktrees: [], prunable: [] };
  const state = registeredPathState(directory, ctx);
  if (state === 'missing') return { ...report, error: 'Registered path does not exist' };
  if (state === 'not-a-repository') return { ...report, notRepository: true };
  const root = gitText(local, ['rev-parse', '--path-format=absolute', '--show-toplevel']).trim();
  report.path = root;
  const base = defaultBranch(local);
  if (!base) return { ...report, error: 'No default branch (no origin/HEAD, main, master or init.defaultBranch)' };
  report.defaultBranch = base.name;
  const keep = new Set(local.git(['config', '--get-all', 'totalrecall.keepBranch']).stdout?.split('\n').map(s => s.trim()).filter(Boolean) || []);

  const trees = parseWorktrees(gitText(local, ['worktree', 'list', '--porcelain', '-z']));
  const checkedOut = new Map(trees.filter(t => typeof t.branch === 'string').map(t => [t.branch.replace(/^refs\/heads\//, ''), t.worktree]));

  const rows = gitText(local, ['for-each-ref', '--format=%(refname:short)%00%(objectname)%00%(committerdate:iso-strict)%00%(upstream:short)%00%(subject)', 'refs/heads']).split('\n').filter(Boolean);
  for (const row of rows) {
    const [branch, tip, lastCommitAt, upstream, subject] = row.split('\0');
    if (branch === base.name) continue;
    const unique = uniqueCommits(local, tip, base);
    if (!unique.length) continue;
    const onRemote = Number(gitText(local, ['rev-list', '--count', tip, '--not', '--remotes', '--']).trim()) === 0;
    const entry = { branch, commits: unique.length, lastCommitAt, subject, upstream: upstream || null, pushed: onRemote, worktree: checkedOut.get(branch) || null };
    if (keep.has(branch)) report.kept.push(entry); else report.branches.push(entry);
  }

  trees.forEach((tree, index) => {
    const primary = index === 0;
    const branch = typeof tree.branch === 'string' ? tree.branch.replace(/^refs\/heads\//, '') : null;
    if (tree.prunable || !existsSync(tree.worktree)) {
      if (!primary) report.prunable.push({ path: tree.worktree, branch, reason: 'directory is gone; git worktree prune removes the record' });
      return;
    }
    // The primary checkout on the default branch is ongoing work on that branch, which audit and fleet report.
    if (primary && branch === base.name) return;
    const tctx = localCtx(ctx, tree.worktree);
    const status = gitText(tctx, ['status', '--porcelain=v1', '-z']);
    const uncommitted = status.split('\0').filter(entry => /^[ MADRCU?!]{2} /.test(entry)).length;
    const orphanCommits = branch ? 0 : Number(gitText(tctx, ['rev-list', '--count', 'HEAD', '--not', '--branches', '--tags', '--remotes', '--']).trim());
    if (!uncommitted && !orphanCommits) return;
    report.worktrees.push({ path: tree.worktree, branch, detached: !branch, uncommitted, orphanCommits, locked: Boolean(tree.locked), primary });
  });
  report.outstanding = report.branches.length + report.worktrees.length;
  return report;
}

function describeRepo(repo, home) {
  const rel = p => (home && p.startsWith(`${home}${path.sep}`) ? `~${p.slice(home.length)}` : p);
  const parts = [
    ...repo.branches.map(b => `branch ${b.branch} (+${b.commits}${b.pushed ? '' : ', not pushed'})`),
    ...repo.worktrees.map(w => `worktree ${rel(w.path)} (${[w.uncommitted ? `${w.uncommitted} uncommitted` : '', w.orphanCommits ? `${w.orphanCommits} commits on no branch` : ''].filter(Boolean).join(', ')})`),
  ];
  return `${rel(repo.path)}: ${parts.join('; ')}`;
}

export function summarize(repositories, home = process.env.HOME) {
  const outstanding = repositories.reduce((n, repo) => n + repo.outstanding, 0);
  const failed = repositories.filter(repo => repo.error);
  if (!outstanding) {
    const count = repositories.filter(repo => !repo.notRepository).length;
    const scope = repositories.length === 1 ? 'in this repository' : `in ${count} repositories`;
    return `No branch or worktree holds work outside the default branch ${scope}${failed.length ? `; ${failed.length} could not be read` : ''}.`;
  }
  const head = `${outstanding} branch${outstanding === 1 ? '' : 'es'} or worktree${outstanding === 1 ? '' : 's'} hold work not in the default branch: `;
  let text = head;
  const withWork = repositories.filter(repo => repo.outstanding);
  for (let i = 0; i < withWork.length; i++) {
    const next = `${i ? ' | ' : ''}${describeRepo(withWork[i], home)}`;
    if (text.length + next.length > SUMMARY_LIMIT) { text += ` | and ${withWork.length - i} more repositor${withWork.length - i === 1 ? 'y' : 'ies'}`; break; }
    text += next;
  }
  return `${text}${failed.length ? `. ${failed.length} repositor${failed.length === 1 ? 'y' : 'ies'} could not be read` : ''}. Details: total-recall git unmerged${repositories.length > 1 ? ' --registered' : ''}.`;
}

function textReport(repositories, summary) {
  const lines = [];
  for (const repo of repositories) {
    if (repo.error) { lines.push(`${repo.path}: ${repo.error}`); continue; }
    if (repo.notRepository) continue;
    if (!repo.outstanding && !repo.kept.length && !repo.prunable.length) continue;
    lines.push(`${repo.path} (default ${repo.defaultBranch})`);
    for (const b of repo.branches) lines.push(`  branch ${b.branch}: ${b.commits} commit${b.commits === 1 ? '' : 's'} not in ${repo.defaultBranch}${b.pushed ? '' : ', not pushed'}; last ${b.lastCommitAt} "${b.subject}"${b.worktree ? `; checked out at ${b.worktree}` : ''}`);
    for (const w of repo.worktrees) lines.push(`  worktree ${w.path} (${w.branch || 'detached HEAD'}${w.locked ? ', locked' : ''}): ${w.uncommitted} uncommitted file${w.uncommitted === 1 ? '' : 's'}${w.orphanCommits ? `, ${w.orphanCommits} commit${w.orphanCommits === 1 ? '' : 's'} on no branch` : ''}`);
    for (const b of repo.kept) lines.push(`  kept ${b.branch}: ${b.commits} commit${b.commits === 1 ? '' : 's'} not in ${repo.defaultBranch} (totalrecall.keepBranch)`);
    for (const p of repo.prunable) lines.push(`  stale worktree record ${p.path}${p.branch ? ` (${p.branch})` : ''}: ${p.reason}`);
  }
  return [...lines, summary].join('\n');
}

async function run(args, ctx) {
  try {
    const unknown = args.filter(a => a !== '--registered');
    if (unknown.length) throw new Error('Use unmerged [--registered] [--json]');
    let directories;
    if (args.includes('--registered')) directories = registeredRepositories(ctx);
    else {
      const top = ctx.git(['rev-parse', '--path-format=absolute', '--show-toplevel']);
      if (top.status !== 0) throw new Error('Not inside a git repository; use --registered for every registered repository');
      directories = [top.stdout.trim()];
    }
    const repositories = directories.map(directory => {
      try { return inspectUnmerged(directory, ctx); }
      catch (error) { return { path: directory, error: error.message, outstanding: 0, branches: [], kept: [], worktrees: [], prunable: [] }; }
    });
    const ok = repositories.every(repo => !repo.error);
    const outstanding = repositories.reduce((n, repo) => n + repo.outstanding, 0);
    const summary = summarize(repositories);
    output(ctx, { ok, outstanding, summary, repositories }, textReport(repositories, summary));
    return ok ? 0 : 1;
  } catch (error) { return failure(ctx, error); }
}

export const operations = {
  unmerged: {
    summary: 'Branches and worktrees whose commits or changes are not in the default branch',
    usage: 'unmerged [--registered] [--json]   keep a branch on purpose: git config --add totalrecall.keepBranch <name>',
    run,
  },
};
