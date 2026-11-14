import { git, tr, ledger, intent, session } from '../lib/context.mjs';

// A commit never starts an OpenWiki refresh. Requesting one after every commit on the default
// branch paid a model to re-check wiki pages after each automatic version-pin commit, in about
// 40 repositories per Total Recall release. OpenWiki refreshes from its own nightly task on one
// selected node (total-recall openwiki schedule).

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
    store.append({ type: 'git.commit_memory', sha, timestamp: new Date().toISOString(), memory: memory === null ? 'skipped: no named decision' : memory.status === 0 && !memory.error ? 'recorded' : 'failed' });
    if (memory && (memory.status !== 0 || memory.error)) console.error('Commit saved. Repository decision memory failed.');
  },
}];
