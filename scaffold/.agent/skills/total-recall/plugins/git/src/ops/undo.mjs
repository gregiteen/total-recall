import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { failure, gitText, helpOnly, invocation, output, repoId, stateStore } from './_support.mjs';

export function destructive(args) {
  const [command, ...tail] = args;
  if (helpOnly(tail)) return false;
  const options = tail.slice(0, tail.indexOf('--') < 0 ? tail.length : tail.indexOf('--'));
  return (command === 'reset' && options.some(a => a === '--hard' || a.startsWith('--hard='))) ||
    (command === 'checkout' && tail.includes('--') && tail.indexOf('--') < tail.length - 1) ||
    command === 'restore' ||
    (command === 'clean' && !options.some(a => a === '--dry-run' || /^-[^-]*n/.test(a))) ||
    (command === 'branch' && options.some(a => a === '--delete' && options.includes('--force') || /^-[^-]*D/.test(a))) ||
    (command === 'stash' && ['drop', 'clear'].includes(tail[0])) ||
    ['rebase', 'filter-branch'].includes(command) ||
    (command === 'update-ref' && options.includes('-d'));
}

const backupPrefix = 'refs/git-plugin/undo/';
const objectEnv = ctx => ({ ...ctx.env,
  GIT_AUTHOR_NAME: 'Git undo', GIT_AUTHOR_EMAIL: 'git-undo@example.invalid',
  GIT_COMMITTER_NAME: 'Git undo', GIT_COMMITTER_EMAIL: 'git-undo@example.invalid' });

/** Use a private index. Do not stage files in the user's index. */
function untrackedSnapshot(ctx, includeIgnored) {
  const files = gitText(ctx, ['ls-files', '--others', ...(includeIgnored ? [] : ['--exclude-standard']), '-z']).split('\0').filter(Boolean);
  if (!files.length) return null;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'git-undo-index-'));
  const env = { ...objectEnv(ctx), GIT_INDEX_FILE: path.join(dir, 'index') };
  try {
    gitText(ctx, ['read-tree', '--empty'], { env });
    // Bounded argv also supports names that start with a dash.
    for (let i = 0; i < files.length; i += 100) gitText(ctx, ['add', '--force', '--', ...files.slice(i, i + 100)], { env });
    const tree = gitText(ctx, ['write-tree'], { env }).trim();
    return gitText(ctx, ['commit-tree', tree, '-m', 'Git undo untracked files'], { env }).trim();
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

export async function snapshot(ctx, command, { includeIgnored = false } = {}) {
  const store = await stateStore(ctx);
  const repository = repoId(ctx);
  const worktree = gitText(ctx, ['rev-parse', '--show-toplevel']).trim();
  const originalCtx = ctx;
  ctx = { ...ctx, git: (args, options) => originalCtx.git(['-C', worktree, ...args], options) };
  const id = randomUUID();
  const refs = gitText(ctx, ['for-each-ref', '--format=%(refname) %(objectname)']).trim().split('\n')
    .filter(row => row && !row.startsWith(backupPrefix)).map(row => {
      const [name, oid] = row.split(' '); return { name, oid };
    });
  const head = gitText(ctx, ['rev-parse', '--verify', 'HEAD']).trim();
  const sym = ctx.git(['symbolic-ref', '-q', 'HEAD']);
  const status = gitText(ctx, ['status', '--porcelain=v1', '-z']);
  const stash = status ? gitText(ctx, ['stash', 'create'], { env: objectEnv(ctx) }).trim() || null : null;
  const untracked = untrackedSnapshot(ctx, includeIgnored);
  const stashes = gitText(ctx, ['stash', 'list', '--format=%H%x00%gs']).trim().split('\n').filter(Boolean).map(row => {
    const [oid, message] = row.split('\0'); return { oid, message };
  });
  const objects = [...new Set([head, stash, untracked, ...refs.map(r => r.oid), ...stashes.map(r => r.oid)].filter(Boolean))];
  // Pin objects before the event is durable. Git GC must not remove a snapshot.
  for (let i = 0; i < objects.length; i += 1) gitText(ctx, ['update-ref', `${backupPrefix}${id}/${i}`, objects[i]]);
  const event = { id, type: 'git.snapshot', timestamp: new Date().toISOString(), repository, worktree,
    command: [command[0]], refs, head, symbolicHead: sym.status === 0 ? sym.stdout.trim() : null,
    stash, untracked, stashes, includeIgnored };
  store.append(event);
  return event;
}

async function before(args, ctx) {
  const call = invocation(args, ctx);
  if (helpOnly(args)) return;
  if (!destructive([call.command, ...call.args])) return;
  try {
    await snapshot(call.ctx, [call.command, ...call.args], {
      includeIgnored: call.command === 'clean' && call.args.some(a => a === '-X' || a === '-x' || /^-[^-]*[xX]/.test(a)),
    });
  } catch { return { refuse: 'Cannot save an undo snapshot. No destructive command was run.' }; }
}

async function restore(ctx, event) {
  // Keep the current state recoverable if restoration fails or the user changes their mind.
  await snapshot(ctx, ['undo', event.id], { includeIgnored: event.includeIgnored });
  const current = gitText(ctx, ['for-each-ref', '--format=%(refname) %(objectname)']).trim().split('\n').filter(Boolean);
  const desired = new Map(event.refs.map(row => [row.name, row.oid]));
  for (const row of current) {
    const [name, oid] = row.split(' ');
    if (!name.startsWith(backupPrefix) && !desired.has(name)) gitText(ctx, ['update-ref', '-d', name, oid]);
  }
  for (const [name, oid] of desired) gitText(ctx, ['update-ref', name, oid]);
  if (event.symbolicHead) gitText(ctx, ['symbolic-ref', 'HEAD', event.symbolicHead]);
  else gitText(ctx, ['update-ref', '--no-deref', 'HEAD', event.head]);
  gitText(ctx, ['reset', '--hard', event.head]);
  if (event.stash) gitText(ctx, ['stash', 'apply', '--index', event.stash]);
  if (event.untracked) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'git-undo-restore-'));
    const env = { ...ctx.env, GIT_INDEX_FILE: path.join(dir, 'index') };
    try {
      gitText(ctx, ['read-tree', event.untracked], { env });
      gitText(ctx, ['checkout-index', '--all', '--force'], { env });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  // A ref alone cannot recover entries removed with stash clear.
  gitText(ctx, ['update-ref', '-d', 'refs/stash']);
  for (const row of [...event.stashes].reverse()) gitText(ctx, ['stash', 'store', '-m', row.message || 'Recovered stash', row.oid]);
  const store = await stateStore(ctx);
  store.append({ id: randomUUID(), type: 'git.undo', event: event.id, repository: event.repository, timestamp: new Date().toISOString() });
}

async function run(args, ctx) {
  try {
    if (args.length > 1 || args.some(a => a.startsWith('-') && a !== '--list')) throw new Error('Use undo [<event>] or undo --list');
    const store = await stateStore(ctx);
    const repository = repoId(ctx);
    const worktree = gitText(ctx, ['rev-parse', '--show-toplevel']).trim();
    const history = store.read([]);
    const events = history.filter(e => e.type === 'git.snapshot' && e.repository === repository && e.worktree === worktree);
    if (args[0] === '--list') {
      output(ctx, { ok: true, events }, events.map(e => `${e.id} ${e.timestamp} ${e.command[0]}`).join('\n') || 'No undo snapshots.');
      return 0;
    }
    const used = new Set(history.filter(e => e.type === 'git.undo').map(e => e.event));
    const event = args[0] ? events.find(e => e.id === args[0]) : events.findLast(e => !used.has(e.id) && e.command[0] !== 'undo');
    if (!event) throw new Error('No matching undo snapshot for this worktree');
    await restore(ctx, event);
    output(ctx, { ok: true, restored: event.id }, `Restored snapshot ${event.id}.`);
    return 0;
  } catch (error) { return failure(ctx, error); }
}

export const guards = [{ name: 'undo', before }];
export const operations = { undo: { summary: 'Restore refs, the index and files from an undo snapshot', usage: 'undo [<event>] [--list] [--json]', run } };
