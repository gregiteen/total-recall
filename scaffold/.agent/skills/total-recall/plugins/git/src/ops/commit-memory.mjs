import { spawn } from 'node:child_process';
import { git, tr, ledger, intent, session } from '../lib/context.mjs';
import { defaultBranch } from './unmerged.mjs';

/**
 * Ask OpenWiki to refresh this repository without waiting for it. A due refresh
 * regenerates pages with a model for minutes; OpenWiki throttles repeats, keeps
 * its own 30-minute limit and writes the outcome to openwiki/.refresh-attempt.json.
 * Waiting here held every commit for 30 s, then killed only the CLI: the
 * generator finished on its own while the commit reported the refresh as failed.
 */
export function requestWikiRefresh(ctx, launch = spawn) {
  try {
    const child = launch(ctx.env.GIT_PLUGIN_TR_BIN || 'total-recall', ['openwiki', 'refresh', '--repo', ctx.cwd, '--apply', '--json'], {
      cwd: ctx.cwd, env: ctx.env, detached: true, stdio: 'ignore', shell: false,
    });
    child.on?.('error', () => {});
    child.unref?.();
    return child.pid ? { status: 'requested', command: 'openwiki refresh', outcome: 'openwiki/.refresh-attempt.json' } : { status: 'failed', command: 'openwiki refresh', reason: 'could not start' };
  } catch {
    return { status: 'failed', command: 'openwiki refresh', reason: 'could not start' };
  }
}

export const guards = [{
  name: 'commit-memory',
  before() {},
  async after(args, ctx, status) {
    if (args[0] !== 'commit' || status !== 0 || args.some(arg => ['--dry-run', '--short', '--porcelain', '--long'].includes(arg))) return;
    const sha = git(ctx, ['rev-parse', '--verify', 'HEAD']).trim();
    const store = await ledger(ctx, 'commits', true);
    if (store.read([]).some(row => row.sha === sha)) return;
    const message = git(ctx, ['show', '-s', '--format=%B', sha]).trimEnd();
    const files = git(ctx, ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-m', '-z', sha]).split('\0').filter(Boolean);
    const record = { type: 'git.commit_context', sha, message, ...intent(message), files: [...new Set(files)], timestamp: new Date().toISOString() };
    record.session = session(ctx.env) || record.session;
    // Save the commit before any optional provider call.
    store.append(record, { idempotencyKey: `commit-${sha}` });
    const memory = record.decisions.length ? tr(ctx, ['remember', 'decision', `${record.decisions.join('\n')}\nCommit: ${sha}`, '--project', '--slug', `git-decision-${sha}`]) : null;
    let wiki;
    // The wiki documents the default branch. Regenerating it from a feature branch spends model
    // calls on pages that only conflict when the branch merges.
    const branch = ctx.git(['symbolic-ref', '--quiet', '--short', 'HEAD']);
    const base = defaultBranch(ctx);
    if (!base || branch.status !== 0 || String(branch.stdout).trim() !== base.name) wiki = { status: 'skipped', reason: 'not on the default branch' };
    else {
      const available = tr(ctx, ['openwiki', '--help']);
      wiki = available.status !== 0 || available.error ? { status: 'skipped', reason: 'OpenWiki is unavailable' } : requestWikiRefresh(ctx);
    }
    store.append({ type: 'git.commit_memory', sha, timestamp: new Date().toISOString(), memory: memory === null ? 'skipped: no named decision' : memory.status === 0 && !memory.error ? 'recorded' : 'failed', openwiki: wiki });
    if (memory && (memory.status !== 0 || memory.error)) console.error('Commit saved. Repository decision memory failed.');
    if (wiki.status === 'failed') console.error('Commit saved. The OpenWiki refresh could not be started.');
  },
}];
