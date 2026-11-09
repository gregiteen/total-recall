#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const GIT_TIMEOUT_MS = 15000;
const GIT_MAX_BUFFER = 64 * 1024 * 1024;
const VERBS = ['audit', 'diff', 'identity', 'worktree-list', 'worktree-create', 'worktree-remove'];

/**
 * Run git without throwing. Never trims stdout (porcelain rows begin with
 * significant spaces) and never forwards stderr to the caller's terminal.
 * @returns {{ ok: boolean, code: number|null, stdout: string, stderr: string, missing: boolean }}
 */
export function git(args, cwd = process.cwd(), input) {
  try {
    const stdout = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      ...(input === undefined ? { stdio: ['ignore', 'pipe', 'pipe'] } : { input, stdio: ['pipe', 'pipe', 'pipe'] }),
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER,
      env: { ...process.env, LC_ALL: 'C', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    });
    return { ok: true, code: 0, stdout, stderr: '', missing: false };
  } catch (err) {
    return {
      ok: false,
      code: typeof err?.status === 'number' ? err.status : null,
      stdout: typeof err?.stdout === 'string' ? err.stdout : '',
      stderr: typeof err?.stderr === 'string' ? err.stderr : '',
      missing: err?.code === 'ENOENT',
    };
  }
}

/**
 * Parse `git status --porcelain=v1 -z` output. Column positions are preserved
 * and file names (which may contain spaces) never influence the XY columns.
 */
export function parsePorcelainZ(output) {
  const parts = String(output ?? '').split('\0');
  const counts = { staged: 0, unstaged: 0, untracked: 0, conflicted: 0, total: 0 };
  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i];
    if (entry.length < 3) continue;
    const x = entry[0];
    const y = entry[1];
    counts.total += 1;
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') i += 1; // skip original path
    if (x === '?' && y === '?') { counts.untracked += 1; continue; }
    if (x === '!' && y === '!') { counts.total -= 1; continue; }
    const conflicted = x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D');
    if (conflicted) counts.conflicted += 1;
    if ('MADRCT'.includes(x) && !conflicted) counts.staged += 1;
    if ('MADRCTU'.includes(y)) counts.unstaged += 1;
  }
  return counts;
}

function countLines(text) {
  return text.split('\n').filter(Boolean).length;
}

/** Collect an audit report. Unknown values are null, never zero. */
export function collectAudit(cwd = process.cwd()) {
  const errors = [];
  const inside = git(['rev-parse', '--is-inside-work-tree'], cwd);
  if (inside.missing) {
    return { ok: false, error: 'git executable not found', errors: ['git-missing'] };
  }
  if (!inside.ok || inside.stdout.trim() !== 'true') {
    return { ok: false, error: `${cwd} is not inside a git worktree.`, errors: ['not-a-worktree'] };
  }

  // HEAD state
  let headState = 'branch';
  let branch = null;
  const sym = git(['symbolic-ref', '-q', '--short', 'HEAD'], cwd);
  const headCommit = git(['rev-parse', '--verify', '-q', 'HEAD'], cwd);
  if (sym.ok) {
    branch = sym.stdout.trim();
    if (!headCommit.ok) headState = 'unborn';
  } else if (sym.code === 1) {
    headState = 'detached';
  } else {
    headState = 'unknown';
    errors.push('head-state');
  }

  // Worktree status (essential)
  const status = git(['status', '--porcelain=v1', '-z', '--untracked-files=normal'], cwd);
  let counts = null;
  if (status.ok) counts = parsePorcelainZ(status.stdout);
  else errors.push('status');

  // Upstream
  let upstream = null;
  let upstreamStatus;
  let ahead = null;
  let behind = null;
  if (headState === 'detached') upstreamStatus = 'detached';
  else if (headState === 'unknown') upstreamStatus = 'unknown';
  else if (headState === 'unborn') upstreamStatus = 'unborn';
  else {
    const up = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], cwd);
    if (up.ok) {
      upstream = up.stdout.trim();
      const lr = git(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], cwd);
      const m = lr.ok ? lr.stdout.trim().match(/^(\d+)\s+(\d+)$/) : null;
      if (m) {
        behind = Number(m[1]);
        ahead = Number(m[2]);
        upstreamStatus = 'tracking';
      } else {
        upstreamStatus = 'error';
        errors.push('upstream-compare');
      }
    } else if (/no upstream configured|no such branch/i.test(up.stderr)) {
      upstreamStatus = 'none';
    } else if (/upstream branch .* not stored as a remote-tracking branch|unknown revision/i.test(up.stderr)) {
      upstreamStatus = 'gone';
    } else {
      upstreamStatus = 'error';
      errors.push('upstream');
    }
  }

  // Stash
  const stash = git(['stash', 'list'], cwd);
  const stashCount = stash.ok ? countLines(stash.stdout) : null;
  if (!stash.ok) errors.push('stash');

  // Last commit
  let lastCommit = null;
  if (headState === 'unborn') lastCommit = 'No commits yet';
  else {
    const last = git(['log', '-1', '--format=%h — %s (%cr)'], cwd);
    if (last.ok) lastCommit = last.stdout.trim() || null;
    else errors.push('last-commit');
  }

  const report = {
    branch,
    headState,
    isClean: counts ? counts.total === 0 : null,
    upstream,
    upstreamStatus,
    unpushedCommits: ahead,
    behindCommits: behind,
    stagedFiles: counts ? counts.staged : null,
    unstagedFiles: counts ? counts.unstaged : null,
    untrackedFiles: counts ? counts.untracked : null,
    conflictedFiles: counts ? counts.conflicted : null,
    totalDirty: counts ? counts.total : null,
    stashCount,
    lastCommit,
    errors,
    timestamp: new Date().toISOString(),
  };
  // status and head-state are essential: without them the report cannot be trusted.
  const essentialFailed = errors.includes('status') || errors.includes('head-state');
  return { ok: !essentialFailed, report, errors };
}

/** Git falls back to user@hostname when no email is configured, which publishes the machine name. */
const MACHINE_EMAIL = /@[^@\s]+\.(local|lan|home|internal)$|@localhost$/i;

/**
 * Who commits in this repository, and which identities its history already publishes.
 * Unknown values are null, never empty.
 */
export function collectIdentity(cwd = process.cwd()) {
  const read = (key) => {
    const row = git(['config', '--show-origin', '--get', key], cwd);
    if (!row.ok) return { value: null, source: null };
    const [source, ...value] = row.stdout.trim().split('\t');
    return { value: value.join('\t') || null, source };
  };
  const name = read('user.name');
  const email = read('user.email');
  const findings = [];
  if (!name.value) findings.push('user.name is not configured, so git guesses the author name');
  if (!email.value) findings.push('user.email is not configured, so git guesses the address from this machine');
  else if (MACHINE_EMAIL.test(email.value)) findings.push(`user.email ${email.value} names a machine`);

  const log = git(['log', '--format=%ae'], cwd);
  let history = null;
  if (log.ok) {
    const counts = new Map();
    for (const row of log.stdout.split('\n').filter(Boolean)) counts.set(row, (counts.get(row) || 0) + 1);
    history = [...counts].sort((a, b) => b[1] - a[1])
      .map(([address, commits]) => ({ email: address, commits, machine: MACHINE_EMAIL.test(address) }));
  }
  const machineCommits = history ? history.filter((row) => row.machine).reduce((sum, row) => sum + row.commits, 0) : null;
  return { name, email, ok: findings.length === 0, findings, history, machineCommits };
}

function printIdentity(r) {
  console.log('\n  Git Hygiene — Commit Identity\n');
  console.log(`  user.name:          ${r.name.value ?? 'not configured'}${r.name.source ? ` (${r.name.source})` : ''}`);
  console.log(`  user.email:         ${r.email.value ?? 'not configured'}${r.email.source ? ` (${r.email.source})` : ''}`);
  for (const finding of r.findings) console.log(`  \x1b[31m${finding}\x1b[0m`);
  if (r.history === null) console.log('  History:            unknown (git log failed)');
  else {
    console.log('  History:');
    for (const row of r.history) console.log(`    ${String(row.commits).padStart(5)}  ${row.email}${row.machine ? '  \x1b[33mmachine address\x1b[0m' : ''}`);
  }
  console.log('');
}

function usage(operations = {}) {
  const features = Object.entries(operations).sort(([a], [b]) => a.localeCompare(b))
    .map(([name, op]) => `  ${(op.usage || name).split('\n')[0].padEnd(46)} ${op.summary}`).join('\n');
  return `Usage: total-recall git <command> [arguments] [--json]

Every git command works here: anything that is not listed below runs git itself, with your
arguments, git's hooks, output and exit status. Example: total-recall git pull --rebase.
Git's own help for a command: total-recall git help <command>.

Plugin operations:
  audit | identity                               Repository state; commit identity and its history
  diff --json [--patch] [--cached] [--base <ref>]  The card's diff (plain diff is git's)
  worktree-list | worktree-create <path> [--base <ref>] | worktree-remove <path> [--force]
${features ? features + '\n' : ''}  --help                                         This help; <operation> --help for one operation`;
}

function gitResult(args, cwd) {
  const result = git(args, cwd);
  if (!result.ok) throw new Error(result.missing ? 'Git executable not found' : result.stderr.trim() || `Git ${args[0]} failed`);
  return result.stdout;
}

function resolveCommit(ref, cwd) {
  return gitResult(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], cwd).trim();
}

function worktrees(cwd) {
  return gitResult(['worktree', 'list', '--porcelain', '-z'], cwd).split('\0\0').filter(Boolean).map(record => {
    const tree = {};
    for (const row of record.split('\0')) {
      const [key, ...words] = row.split(' ');
      const value = words.join(' ');
      if (key === 'worktree') tree.path = value;
      else if (key === 'HEAD') tree.head = value;
      else if (key === 'branch') tree.branch = value;
      else if (['bare', 'detached', 'locked', 'prunable'].includes(key)) tree[key] = value || true;
    }
    if (!tree.path) throw new Error('Git worktree listing omitted a path');
    return tree;
  });
}

function worktreeOperation(action, values, target, cwd) {
  if (action === 'worktree-list') return { ok: true, worktrees: worktrees(cwd) };
  const targetPath = path.resolve(cwd, target);
  if (action === 'worktree-create') {
    const commit = resolveCommit(values.base ?? 'HEAD', cwd);
    gitResult(['worktree', 'add', '--detach', '--', targetPath, commit], cwd);
    return { ok: true, path: realpathSync(targetPath), head: commit, detached: true };
  }

  const real = realpathSync(targetPath);
  const registered = worktrees(cwd);
  if (!registered.some(tree => tree.path === real)) throw new Error('Target is not a registered worktree of this repository');
  if (registered[0]?.path === real) throw new Error('Refusing to remove the main worktree');
  const current = realpathSync(cwd);
  if (real === current || current.startsWith(real + path.sep)) throw new Error('Refusing to remove the current worktree');
  gitResult(['worktree', 'remove', ...(values.force ? ['--force'] : []), '--', real], cwd);
  return { ok: true, path: real, removed: true };
}

function fmt(value, known) {
  return value === null || value === undefined ? known : value;
}

function printAudit(r) {
  const unk = '\x1b[31munknown (command failed)\x1b[0m';
  console.log('\n  Git Hygiene — Repository State\n');
  const branchLabel = r.headState === 'detached' ? 'detached HEAD'
    : r.headState === 'unborn' ? `${r.branch} (no commits yet)` : fmt(r.branch, 'unknown');
  console.log(`  Active Branch:      \x1b[36m${branchLabel}\x1b[0m`);
  if (r.isClean === null) console.log(`  Worktree State:     ${unk}`);
  else {
    console.log(`  Worktree State:     ${r.isClean ? '\x1b[32mClean\x1b[0m' : `\x1b[33mDirty (${r.totalDirty} modified/untracked files)\x1b[0m`}`);
    if (!r.isClean) {
      console.log(`    - Staged files:   ${r.stagedFiles}`);
      console.log(`    - Unstaged files: ${r.unstagedFiles}`);
      console.log(`    - Untracked:      ${r.untrackedFiles}`);
      if (r.conflictedFiles) console.log(`    - Conflicted:     ${r.conflictedFiles}`);
    }
  }
  let upstreamLine;
  switch (r.upstreamStatus) {
    case 'tracking':
      upstreamLine = r.unpushedCommits === 0 && r.behindCommits === 0
        ? `Up to date with ${r.upstream}`
        : `\x1b[33m${r.unpushedCommits} ahead, ${r.behindCommits} behind ${r.upstream}\x1b[0m`;
      break;
    case 'none': upstreamLine = 'No upstream configured (sync state unknown)'; break;
    case 'gone': upstreamLine = 'Upstream branch is missing (sync state unknown)'; break;
    case 'detached': upstreamLine = 'Detached HEAD (no upstream)'; break;
    case 'unborn': upstreamLine = 'No commits yet (no upstream)'; break;
    default: upstreamLine = unk;
  }
  console.log(`  Upstream:           ${upstreamLine}`);
  console.log(`  Stash Stack:        ${r.stashCount === null ? unk : `${r.stashCount} saved stashes`}`);
  console.log(`  Head Commit:        ${fmt(r.lastCommit, unk)}\n`);
}

/**
 * Feature operations live in src/ops/<name>.mjs, one file per feature. Each module may export:
 * - `operations`: { <name>: { summary, usage, run(args, ctx) } }; `run` returns an exit status.
 * - `guards`: [{ name, before(args, ctx) }] run before git's own commands, in file order. `before`
 *   returns nothing to allow, `{ args }` to rewrite the arguments, or `{ refuse: <message> }`.
 *   An optional `after(args, ctx, status)` runs after git finishes; its failure is reported, never fatal.
 * `ctx` is { cwd, env, json, git(args) -> spawnSync result with captured output }.
 * Help is built from this registry, so every operation is in `--help`.
 */
const OPS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src', 'ops');
let GIT_COMMANDS;
function isGitCommand(name) {
  if (!GIT_COMMANDS) GIT_COMMANDS = new Set(String(spawnSync('git', ['--list-cmds=main,others,alias,nohelpers'], { encoding: 'utf8' }).stdout || '').split('\n').filter(Boolean));
  return GIT_COMMANDS.has(name);
}

export async function loadRegistry(dir = OPS_DIR) {
  const operations = {}, guards = [];
  let files = [];
  try { files = readdirSync(dir).filter(f => f.endsWith('.mjs') && !f.includes('.spec.') && !f.includes('.test.')).sort(); } catch { /* no feature modules */ }
  for (const file of files) {
    // One module that fails to load disables only its own operations; git and every other operation keep working.
    let mod;
    try { mod = await import(pathToFileURL(path.join(dir, file)).href); }
    catch (error) {
      const name = file.replace(/\.mjs$/, '');
      if (!operations[name]) operations[name] = { summary: `unavailable: ${String(error.message).split('\n')[0]}`, usage: name, file, broken: true,
        run: () => { console.error(`${name} is unavailable: ${error.message.split('\n')[0]}`); return 1; } };
      continue;
    }
    for (const [name, op] of Object.entries(mod.operations || {})) {
      if (operations[name]) throw new Error(`Operation "${name}" is defined twice (${file})`);
      operations[name] = { ...op, file };
    }
    for (const guard of mod.guards || []) guards.push({ ...guard, file });
  }
  return { operations, guards };
}

function context(cwd, json) {
  return {
    cwd, env: process.env, json,
    git: (args, options = {}) => spawnSync('git', args, { cwd, env: process.env, encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER, ...options }),
  };
}

/**
 * Plugin operations: audit, identity, help, the checked commit, the hyphenated worktree-* operations
 * and `diff` with --json or --base (the card's diff). Everything else is git's own CLI.
 * `commit` stays a plugin operation only in its checked form (-m/--message, -a/--all, paths).
 * Any other git commit flag (--amend, --fixup, -S and the rest) goes to git's own commit.
 */
export function isPassthrough(args, featureOps = []) {
  const [first] = args;
  if (first === undefined) return false;
  if (featureOps.includes(first)) return false;
  if (first.startsWith('-')) return !['--json', '--help', '-h'].includes(first);
  if (['audit', 'identity', 'worktree-list', 'worktree-create', 'worktree-remove'].includes(first)) return false;
  if (first === 'diff') return !args.includes('--json') && !args.some(a => a === '--base' || a.startsWith('--base='));
  return true;
}

export async function run(argv = []) {
  // argv: ["node", "total-recall", "git", "<subcommand>", ...flags]
  // Never process.exit(): a host running this in-process would be stopped too.
  const clean = Array.isArray(argv) ? argv.slice(3) : [];
  const registry = await loadRegistry();
  const cwd0 = process.cwd();
  const featureOp = registry.operations[clean[0]];
  const wantsOpHelp = clean.includes('--help') || clean.includes('-h');
  // Guards see every command, plugin operations included (a plugin `commit` is still a commit).
  // Each guard decides from args[0] whether the command concerns it.
  const runGuards = async (args, phase, status) => {
    for (const guard of registry.guards) {
      if (phase === 'before') {
        const verdict = await guard.before?.(args, context(cwd0, false));
        if (verdict?.refuse) return { refuse: `${args[0]} refused by ${guard.name}: ${verdict.refuse}` };
        if (verdict?.args) args = verdict.args;
      } else if (guard.after) {
        try { await guard.after(args, context(cwd0, false), status); }
        catch (error) { console.error(`${guard.name} after ${args[0]}: ${error.message}`); }
      }
    }
    return { args };
  };
  // `-h` on a plugin operation that is also a git command (commit, bundle) is git's own usage;
  // `--help` shows the plugin operation's help.
  const gitUsage = featureOp && clean.includes('-h') && !clean.includes('--help') && isGitCommand(clean[0]);
  if (featureOp && !wantsOpHelp || gitUsage) {
    if (gitUsage) {
      const ran = spawnSync('git', clean, { cwd: cwd0, stdio: 'inherit', env: process.env });
      process.exitCode = ran.status ?? 1;
      return;
    }
    const checked = await runGuards(clean, 'before');
    if (checked.refuse) { console.error(checked.refuse); process.exitCode = 1; return; }
    const status = await featureOp.run(checked.args.slice(1).filter(a => a !== '--json'), context(cwd0, clean.includes('--json')));
    process.exitCode = typeof status === 'number' ? status : 0;
    await runGuards(checked.args, 'after', process.exitCode);
    return;
  }
  if (featureOp) { console.log(`total-recall git ${clean[0]} — ${featureOp.summary}\n${featureOp.usage || ''}`.trimEnd()); return; }
  // The whole git CLI: every command that is not a plugin operation runs git itself, with the
  // caller's arguments unchanged (unless a guard rewrites them), git's own hooks, output and exit status.
  if (isPassthrough(clean, Object.keys(registry.operations))) {
    const checked = await runGuards(clean, 'before');
    if (checked.refuse) { console.error(`git ${checked.refuse}`); process.exitCode = 1; return; }
    const ran = spawnSync('git', checked.args, { cwd: cwd0, stdio: 'inherit', env: process.env });
    if (ran.error) console.error(`git could not start: ${ran.error.message}`);
    process.exitCode = ran.status ?? 1;
    await runGuards(checked.args, 'after', process.exitCode);
    return;
  }
  const isJson = clean.includes('--json');
  const wantsHelp = clean.includes('--help') || clean.includes('-h');
  let [action = 'audit', ...args] = clean.filter(arg => arg !== '--json');
  const fail = (message, code = 1, extra = {}) => {
    process.exitCode = code;
    if (isJson) console.log(JSON.stringify({ ok: false, error: message, ...extra }, null, 2));
    else console.error(message);
  };

  if (wantsHelp) {
    console.log(usage(registry.operations));
    return;
  }
  if (!VERBS.includes(action)) {
    fail(`Unknown git plugin command "${action}". ${usage()}`, 2);
    return;
  }

  const options = action === 'diff' ? { patch: { type: 'boolean' }, cached: { type: 'boolean' }, base: { type: 'string' } }
    : action === 'worktree-create' ? { base: { type: 'string' } }
    : action === 'worktree-remove' ? { force: { type: 'boolean' } }
    : {};
  const targetRequired = action === 'worktree-create' || action === 'worktree-remove';
  let parsed;
  try {
    parsed = parseArgs({ args, options, allowPositionals: targetRequired });
    if (targetRequired && parsed.positionals.length !== 1) throw new Error('Supply exactly one worktree path');
  } catch (error) {
    fail(error.message, 2);
    return;
  }

  const cwd = process.cwd();
  if (action === 'diff' || action.startsWith('worktree-')) {
    try {
      let result;
      if (action === 'diff') {
        const { patch, cached, base } = parsed.values;
        const commit = base === undefined ? undefined : resolveCommit(base, cwd);
        const output = gitResult(['diff', '--no-ext-diff', '--no-textconv', patch ? '--patch' : '--stat', ...(cached ? ['--cached'] : []), ...(commit ? [commit] : []), '--'], cwd);
        result = { ok: true, [patch ? 'patch' : 'diffStat']: patch ? output : output.trimEnd(), cached: Boolean(cached), base: base ?? null, timestamp: new Date().toISOString() };
        if (!isJson) console.log(output.trimEnd() || 'No changes.');
      } else {
        result = worktreeOperation(action, parsed.values, parsed.positionals[0], cwd);
        if (!isJson) {
          if (result.worktrees) for (const tree of result.worktrees) console.log(`${tree.path} ${tree.branch || tree.head || ''}`.trimEnd());
          else console.log(`${result.removed ? 'Removed' : 'Created'} worktree ${result.path}`);
        }
      }
      if (isJson) console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      fail(error.message, 1, { errors: [action] });
    }
    return;
  }

  const audit = collectAudit(cwd);
  if (audit.report === undefined) {
    fail(audit.error, 1, { errors: audit.errors });
    return;
  }

  if (action === 'identity') {
    const identity = collectIdentity(cwd);
    if (!identity.ok) process.exitCode = 1;
    if (isJson) console.log(JSON.stringify(identity, null, 2));
    else printIdentity(identity);
    return;
  }

  if (!audit.ok) process.exitCode = 1;
  if (isJson) {
    console.log(JSON.stringify(audit.report, null, 2));
    return;
  }
  printAudit(audit.report);
  if (!audit.ok) console.error(`Audit incomplete: ${audit.errors.join(', ')} failed.`);
}

export default run;
