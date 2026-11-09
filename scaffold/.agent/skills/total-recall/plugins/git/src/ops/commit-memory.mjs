import { git, tr, ledger, intent, session } from '../lib/context.mjs';

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
    const available = tr(ctx, ['openwiki', '--help']);
    let wiki;
    if (available.status !== 0 || available.error) wiki = { status: 'skipped', reason: 'OpenWiki is unavailable' };
    else {
      // The current OpenWiki CLI accepts a refresh request, but has no queue verb.
      const refresh = tr(ctx, ['openwiki', 'refresh', '--repo', ctx.cwd, '--apply', '--json']);
      wiki = { status: refresh.status === 0 && !refresh.error ? 'requested' : 'failed', command: 'openwiki refresh' };
    }
    store.append({ type: 'git.commit_memory', sha, timestamp: new Date().toISOString(), memory: memory === null ? 'skipped: no named decision' : memory.status === 0 && !memory.error ? 'recorded' : 'failed', openwiki: wiki });
    if (memory && (memory.status !== 0 || memory.error)) console.error('Commit saved. Repository decision memory failed.');
    if (wiki.status === 'failed') console.error('Commit saved. OpenWiki refresh failed.');
  },
}];
