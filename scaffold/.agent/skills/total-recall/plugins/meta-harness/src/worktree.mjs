/** Isolated git checkouts for writing and verifying agents. Nothing here merges into the operator's branch. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SECRET_FILE = /^(\.env(\..*)?|.*\.(pem|key|p12|pfx)|secrets\.enc|id_(rsa|ed25519|ecdsa)|credentials(\.json)?)$/i;
const git = (cwd, args, timeout = 30000, options) => {
  assertGitPointer(cwd, options);
  return spawnSync('git', args, { cwd, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
};
function must(cwd, args, what, options) {
  const result = git(cwd, args, 30000, options);
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
export function createWorktree(cwd, { branch, ref = 'HEAD', prefix = 'meta-harness-', existingBranch = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const args = branch ? existingBranch ? ['worktree', 'add', directory, branch] : ['worktree', 'add', '-b', branch, directory, ref] : ['worktree', 'add', '--detach', directory, ref];
  const result = git(cwd, args, 120000);
  if (result.status !== 0) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw new Error(`Creating a worktree failed: ${String(result.stderr).trim().slice(0, 300)}`);
  }
  ACTIVE_WORKTREES.set(directory, { cwd, branch: branch || null, base: headCommit(directory) });
  seedMandatorySkills(cwd, directory);
  linkPrivatePlans(cwd, directory);
  return directory;
}
/**
 * Plans in docs/projects are private and untracked in public repositories, so a checkout lacks them
 * and an agent would start a duplicate plan (A-116). Link the one real plan folder in; never commit it.
 */
const PLANS = 'docs/projects';
function linkPrivatePlans(cwd, directory) {
  const root = git(cwd, ['rev-parse', '--show-toplevel']).stdout.trim();
  const source = path.join(root, PLANS), target = path.join(directory, PLANS);
  if (!root || !fs.existsSync(source) || fs.existsSync(target)) return;
  if (git(cwd, ['ls-files', '--', PLANS]).stdout.trim()) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(source, target);
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
/**
 * Give an agent's checkout its own dependencies before it starts (A-109). A link would let an
 * agent's `npm install` write into the operator's tree, so the checkout gets a copy-on-write
 * clone of `node_modules` (macOS clonefile, Linux reflink: no extra disk), or, when the operator
 * has none, a frozen install from the lockfile. Returns what it did, for the attempt record.
 */
export function provideDependencies(cwd, directory, { run = spawnSync } = {}) {
  if (!fs.existsSync(path.join(directory, 'package.json'))) return { action: 'none', reason: 'no package.json' };
  const target = path.join(directory, 'node_modules');
  if (fs.existsSync(target)) return { action: 'present' };
  const modules = path.join(cwd, 'node_modules');
  if (fs.existsSync(modules)) {
    const args = process.platform === 'darwin' ? ['-c', '-R', modules, target] : ['-a', '--reflink=auto', modules, target];
    const copied = run('cp', args, { stdio: 'ignore' });
    if (copied.status === 0) return { action: 'cloned' };
  }
  const lock = [['package-lock.json', 'npm', ['ci', '--no-audit', '--no-fund']], ['pnpm-lock.yaml', 'pnpm', ['install', '--frozen-lockfile']], ['yarn.lock', 'yarn', ['install', '--frozen-lockfile']]]
    .find(([file]) => fs.existsSync(path.join(directory, file)));
  if (!lock) return { action: 'none', reason: 'no lockfile' };
  const installed = run(lock[1], lock[2], { cwd: directory, stdio: 'ignore', timeout: 600000 });
  return installed.status === 0 ? { action: 'installed', manager: lock[1] } : { action: 'failed', manager: lock[1] };
}

/**
 * Push a finished job's branch (A-113, Greg 2026-11-09: agents push finished work themselves).
 * Only `meta-harness/...` branches are pushed, so a job can never push a deploy branch.
 * No `origin` remote means nothing to push. Returns what happened, for the job record.
 */
export function pushBranch(cwd, branch) {
  if (!branch || !branch.startsWith('meta-harness/')) return { pushed: false, reason: 'not a job branch' };
  if (git(cwd, ['remote', 'get-url', 'origin']).status !== 0) return { pushed: false, reason: 'no origin remote' };
  const result = git(cwd, ['push', '-q', '-u', 'origin', `${branch}:${branch}`], 120000);
  return result.status === 0 ? { pushed: true, remote: 'origin', branch } : { pushed: false, reason: String(result.stderr || result.error || '').trim().slice(0, 300) };
}
export const deleteBranch = (cwd, branch) => git(cwd, ['branch', '-D', branch]).status === 0;
export function removeWorktree(cwd, directory) {
  if (!directory) return;
  ACTIVE_WORKTREES.delete(directory);
  for (const link of ['node_modules', PLANS]) {
    try { if (fs.lstatSync(path.join(directory, link)).isSymbolicLink()) fs.rmSync(path.join(directory, link)); } catch { /* no link */ }
  }
  git(cwd, ['worktree', 'remove', '--force', directory], 60000);
  fs.rmSync(directory, { recursive: true, force: true });
  GIT_POINTERS.delete(path.resolve(directory));
}
/**
 * An agent user can write the checkout directory, so it can unlink or replace `<cwd>/.git` even though it
 * cannot write inside it. Record it before such a run; commitAll verifies it before root runs git there,
 * because a planted hook or config (core.hooksPath, core.fsmonitor, filter drivers) would run as root.
 */
const GIT_POINTERS = new Map();
const gitPointerPath = directory => path.join(path.resolve(directory), '.git');
/** Filesystem-only inventory: never enter git metadata or follow workspace symlinks. */
export function gitMetadataEntries(directory) {
  const pending = [path.resolve(directory)], found = [];
  while (pending.length) {
    const cwd = pending.pop();
    const entries = fs.readdirSync(cwd, { withFileTypes: true });
    const dot = entries.find(entry => entry.name === '.git');
    if (dot) found.push({ cwd, metadata: path.join(cwd, '.git'), symlink: dot.isSymbolicLink() });
    const bare = entries.some(entry => entry.name === 'HEAD' && entry.isFile()) &&
      ['objects', 'refs'].every(name => entries.some(entry => entry.name === name && entry.isDirectory()));
    if (bare) { found.push({ cwd, metadata: cwd, symlink: false }); continue; }
    for (const entry of entries) if (entry.name !== '.git' && entry.isDirectory()) pending.push(path.join(cwd, entry.name));
  }
  return found;
}

function snapshotGitPath(dot, lstat) {
  let stat;
  try { stat = lstat(dot); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { type: 'missing' };
  }
  if (stat.isSymbolicLink()) throw new Error(`${dot} is a symlink, so it cannot be protected from the agent user.`);
  if (!stat.isDirectory() && !stat.isFile()) throw new Error(`${dot} is not a git directory or pointer file.`);
  return { type: stat.isDirectory() ? 'directory' : 'file', ino: stat.ino, dev: stat.dev,
    ...(stat.isFile() ? { content: fs.readFileSync(dot) } : {}) };
}
export function recordGitPointer(directory, { lstat = fs.lstatSync, protect = [] } = {}) {
  // A second attempt cannot bless metadata that a previous agent already replaced.
  assertGitPointer(directory, { lstat });
  const dot = gitPointerPath(directory);
  const paths = [...new Set([dot, ...protect.map(item => path.resolve(item))])];
  const snapshots = new Map(paths.map(item => [item, snapshotGitPath(item, lstat)]));
  const pointer = snapshots.get(dot);
  GIT_POINTERS.set(path.resolve(directory), { snapshots, entries: new Set(gitMetadataEntries(directory).map(entry => entry.metadata)) });
  return pointer;
}
/** The reason the checkout's `.git` is no longer what was recorded, or null. Directories never recorded are not checked. */
export function gitPointerProblem(directory = process.cwd(), { lstat = fs.lstatSync } = {}) {
  const recorded = GIT_POINTERS.get(path.resolve(directory));
  if (!recorded) return null;
  const { snapshots, entries } = recorded;
  for (const [dot, expected] of snapshots) {
    const problem = gitPathProblem(dot, expected, lstat);
    if (problem) return problem;
    // lstat on the final component alone would follow an agent-replaced ancestor symlink.
    const relative = path.relative(path.resolve(directory), dot);
    if (relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
      for (let parent = path.dirname(dot); parent !== path.resolve(directory); parent = path.dirname(parent)) {
        if (lstat(parent).isSymbolicLink()) return `${parent} is now a symlink`;
      }
    }
  }
  // Root git may inspect embedded repos/submodules. Metadata created during the run is untrusted too.
  try {
    for (const entry of gitMetadataEntries(directory)) if (!entries.has(entry.metadata)) return `${entry.metadata} was created`;
  } catch (error) { return `Cannot inspect git metadata in ${directory}: ${error.message}`; }
  return null;
}
function gitPathProblem(dot, expected, lstat) {
  let stat;
  try { stat = lstat(dot); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return expected.type === 'missing' ? null : `${dot} was removed`;
  }
  if (expected.type === 'missing') return `${dot} was created`;
  if (stat.isSymbolicLink()) return `${dot} is now a symlink`;
  if (stat.uid !== 0) return `${dot} is not owned by root (uid ${stat.uid})`;
  if (stat.ino !== expected.ino || stat.dev !== expected.dev) return `${dot} was replaced`;
  if (expected.type === 'directory') return stat.isDirectory() ? null : `${dot} was replaced`;
  if (!stat.isFile()) return `${dot} was replaced`;
  return fs.readFileSync(dot).equals(expected.content) ? null : `${dot} changed`;
}
function assertGitPointer(directory, options) {
  const problem = gitPointerProblem(directory, options);
  if (problem) throw new Error(`Refusing to run git as root: ${problem} during an agent-user run.`);
}
/** Commit whatever the agent left. Returns the commit, or null when it changed nothing. */
export function commitAll(directory, message, { lstat = fs.lstatSync } = {}) {
  assertGitPointer(directory, { lstat });
  const run = args => git(directory, args, 30000, { lstat });
  const require = (args, what) => must(directory, args, what, { lstat });
  // Stage everything git does not ignore. Naming node_modules in the pathspec fails when it is
  // ignored (A-114), so it is unstaged afterwards instead, for repositories that do not ignore it.
  require(['add', '-A'], 'Staging agent changes');
  run(['rm', '-r', '--cached', '-q', '--ignore-unmatch', '--', 'node_modules']);
  // The linked private plan folder (A-116) is the operator's, never part of the agent's commit.
  try { if (fs.lstatSync(path.join(directory, PLANS)).isSymbolicLink()) run(['rm', '-r', '--cached', '-q', '--ignore-unmatch', '--', PLANS]); } catch { /* no link */ }
  // Seeded skills are scaffolding, not the agent's work. A repository that tracks them keeps normal history.
  for (const file of MANDATORY_SKILLS) if (run(['cat-file', '-e', `HEAD:${file}`]).status !== 0) run(['rm', '--cached', '-q', '--ignore-unmatch', '--', file]);
  if (run(['diff', '--cached', '--quiet']).status === 0) return null;
  const staged = run(['diff', '--cached', '--name-only']).stdout.split('\n').filter(Boolean);
  const secret = staged.filter(file => SECRET_FILE.test(path.basename(file)));
  if (secret.length) throw new Error(`Refusing to commit files that look like credentials: ${secret.join(', ')}`);
  require(['commit', '-m', message], 'Committing agent changes');
  return require(['rev-parse', 'HEAD'], 'Reading HEAD');
}
/** Remove owned checkouts. Cancellation keeps branches that contain work. */
export function removeActiveWorktrees({ preserveChanges = false } = {}) {
  const saved = [];
  for (const [directory, { cwd, branch, base }] of [...ACTIVE_WORKTREES]) {
    let wip = null;
    if (preserveChanges && branch) {
      try { wip = commitAll(directory, 'meta-harness: unfinished work from a cancelled job'); }
      catch (error) {
        // Do not destroy edits if the WIP commit fails (for example, a credential file).
        saved.push({ branch, directory, error: error.message });
        continue;
      }
      if (wip || headCommit(directory) !== base) saved.push({ branch, wip, commit: headCommit(directory) });
    }
    removeWorktree(cwd, directory);
    if (branch && (!preserveChanges || !saved.some(item => item.branch === branch))) deleteBranch(cwd, branch);
  }
  return saved;
}
