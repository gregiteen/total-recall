/** Isolated git checkouts for writing and verifying agents. Nothing here merges into the operator's branch. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SECRET_FILE = /^(\.env(\..*)?|.*\.(pem|key|p12|pfx)|secrets\.enc|id_(rsa|ed25519|ecdsa)|credentials(\.json)?)$/i;
const git = (cwd, args, timeout = 30000) => spawnSync('git', args, { cwd, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
function must(cwd, args, what) {
  const result = git(cwd, args);
  if (result.status !== 0) throw new Error(`${what} failed: ${String(result.stderr || result.error || '').trim().slice(0, 300)}`);
  return result.stdout.trim();
}
export const isGitRepo = cwd => git(cwd, ['rev-parse', '--is-inside-work-tree']).status === 0;
export const headCommit = cwd => must(cwd, ['rev-parse', 'HEAD'], 'Reading HEAD');
export const isDirty = cwd => git(cwd, ['status', '--porcelain']).stdout.trim().length > 0;
export const diffBetween = (cwd, base, head) => must(cwd, ['diff', `${base}...${head}`], 'Reading the diff');

/** `branch` creates a new branch from `ref`. Without it, the checkout is detached at `ref` (read-only use). */
export function createWorktree(cwd, { branch, ref = 'HEAD', prefix = 'meta-harness-' } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const args = branch ? ['worktree', 'add', '-b', branch, directory, ref] : ['worktree', 'add', '--detach', directory, ref];
  const result = git(cwd, args, 120000);
  if (result.status !== 0) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw new Error(`Creating a worktree failed: ${String(result.stderr).trim().slice(0, 300)}`);
  }
  return directory;
}
/** Gates need dependencies. Link them only for the gate, after the agent has finished, so no agent can write through the link. */
export function linkDependencies(cwd, directory) {
  const modules = path.join(cwd, 'node_modules');
  if (fs.existsSync(modules) && !fs.existsSync(path.join(directory, 'node_modules'))) fs.symlinkSync(modules, path.join(directory, 'node_modules'));
}
export const deleteBranch = (cwd, branch) => git(cwd, ['branch', '-D', branch]).status === 0;
export function removeWorktree(cwd, directory) {
  if (!directory) return;
  try { if (fs.lstatSync(path.join(directory, 'node_modules')).isSymbolicLink()) fs.rmSync(path.join(directory, 'node_modules')); } catch { /* no link */ }
  git(cwd, ['worktree', 'remove', '--force', directory], 60000);
  fs.rmSync(directory, { recursive: true, force: true });
}
/** Commit whatever the agent left. Returns the commit, or null when it changed nothing. */
export function commitAll(directory, message) {
  must(directory, ['add', '-A', '--', '.', ':!node_modules'], 'Staging agent changes');
  if (git(directory, ['diff', '--cached', '--quiet']).status === 0) return null;
  const staged = git(directory, ['diff', '--cached', '--name-only']).stdout.split('\n').filter(Boolean);
  const secret = staged.filter(file => SECRET_FILE.test(path.basename(file)));
  if (secret.length) throw new Error(`Refusing to commit files that look like credentials: ${secret.join(', ')}`);
  must(directory, ['commit', '-m', message], 'Committing agent changes');
  return headCommit(directory);
}
