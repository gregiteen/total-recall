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

/** Checkouts this process created and has not removed, so termination can clean them up. */
const ACTIVE_WORKTREES = new Map();

/** `branch` creates a new branch from `ref`. Without it, the checkout is detached at `ref` (read-only use). */
export function createWorktree(cwd, { branch, ref = 'HEAD', prefix = 'meta-harness-' } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const args = branch ? ['worktree', 'add', '-b', branch, directory, ref] : ['worktree', 'add', '--detach', directory, ref];
  const result = git(cwd, args, 120000);
  if (result.status !== 0) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw new Error(`Creating a worktree failed: ${String(result.stderr).trim().slice(0, 300)}`);
  }
  ACTIVE_WORKTREES.set(directory, { cwd, branch: branch || null });
  seedMandatorySkills(cwd, directory);
  return directory;
}
/**
 * An agent's own Total Recall preflight needs these two files at the repository root, and they are
 * usually gitignored, so a fresh checkout lacks them and every agent inside it would report itself blocked.
 */
const MANDATORY_SKILLS = ['.agent/skills/total-recall/SKILL.md', '.agent/skills/ssss/SKILL.md'];
function seedMandatorySkills(cwd, directory) {
  const root = git(cwd, ['rev-parse', '--show-toplevel']).stdout.trim();
  for (const file of MANDATORY_SKILLS) {
    const source = path.join(root, file), target = path.join(directory, file);
    if (fs.existsSync(source) && !fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
  }
}
/** Gates need dependencies. Link them only for the gate, after the agent has finished, so no agent can write through the link. */
export function linkDependencies(cwd, directory) {
  const modules = path.join(cwd, 'node_modules');
  if (fs.existsSync(modules) && !fs.existsSync(path.join(directory, 'node_modules'))) fs.symlinkSync(modules, path.join(directory, 'node_modules'));
  // The repository's gate configuration is usually gitignored too, and without it the gate could not run here.
  const root = git(cwd, ['rev-parse', '--show-toplevel']).stdout.trim();
  const quality = path.join(root, '.agent/skills/code-quality');
  const target = path.join(directory, '.agent/skills/code-quality');
  if (fs.existsSync(quality) && !fs.existsSync(target)) fs.cpSync(quality, target, { recursive: true, filter: source => !source.includes(`${path.sep}reports`) });
}
export const deleteBranch = (cwd, branch) => git(cwd, ['branch', '-D', branch]).status === 0;
export function removeWorktree(cwd, directory) {
  if (!directory) return;
  ACTIVE_WORKTREES.delete(directory);
  try { if (fs.lstatSync(path.join(directory, 'node_modules')).isSymbolicLink()) fs.rmSync(path.join(directory, 'node_modules')); } catch { /* no link */ }
  git(cwd, ['worktree', 'remove', '--force', directory], 60000);
  fs.rmSync(directory, { recursive: true, force: true });
}
/** Commit whatever the agent left. Returns the commit, or null when it changed nothing. */
export function commitAll(directory, message) {
  must(directory, ['add', '-A', '--', '.', ':!node_modules'], 'Staging agent changes');
  // Seeded skills are scaffolding, not the agent's work. A repository that tracks them keeps normal history.
  for (const file of MANDATORY_SKILLS) if (git(directory, ['cat-file', '-e', `HEAD:${file}`]).status !== 0) git(directory, ['rm', '--cached', '-q', '--ignore-unmatch', '--', file]);
  if (git(directory, ['diff', '--cached', '--quiet']).status === 0) return null;
  const staged = git(directory, ['diff', '--cached', '--name-only']).stdout.split('\n').filter(Boolean);
  const secret = staged.filter(file => SECRET_FILE.test(path.basename(file)));
  if (secret.length) throw new Error(`Refusing to commit files that look like credentials: ${secret.join(', ')}`);
  must(directory, ['commit', '-m', message], 'Committing agent changes');
  return headCommit(directory);
}
/** A stopped run's checkouts and unfinished branches go with it. A branch already handed back has no active checkout. */
export function removeActiveWorktrees() {
  for (const [directory, { cwd, branch }] of [...ACTIVE_WORKTREES]) {
    removeWorktree(cwd, directory);
    if (branch) deleteBranch(cwd, branch);
  }
}
