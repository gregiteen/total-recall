#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const GIT_TIMEOUT_MS = 15000;
const GIT_MAX_BUFFER = 64 * 1024 * 1024;
const VERBS = ['audit', 'diff', 'help'];

/**
 * Run git without throwing. Never trims stdout (porcelain rows begin with
 * significant spaces) and never forwards stderr to the caller's terminal.
 * @returns {{ ok: boolean, code: number|null, stdout: string, stderr: string, missing: boolean }}
 */
export function git(args, cwd = process.cwd()) {
  try {
    const stdout = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
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

function usage() {
  return 'Usage: total-recall git-sentinel [audit|diff|help] [--json]';
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

export async function run(argv = []) {
  // argv: ["node", "total-recall", "git-sentinel", "<subcommand>", ...flags]
  // Never process.exit(): a host running this in-process would be stopped too.
  const clean = Array.isArray(argv) ? argv.slice(3) : [];
  const isJson = clean.includes('--json');
  const wantsHelp = clean.includes('--help') || clean.includes('-h');
  const action = clean.find((a) => !a.startsWith('-')) || 'audit';
  const fail = (message, code = 1, extra = {}) => {
    process.exitCode = code;
    if (isJson) console.log(JSON.stringify({ ok: false, error: message, ...extra }, null, 2));
    else console.error(message);
  };

  if (wantsHelp || action === 'help') {
    console.log(usage());
    return;
  }
  if (!VERBS.includes(action)) {
    fail(`Unknown git-sentinel command "${action}". ${usage()}`, 2);
    return;
  }

  const cwd = process.cwd();
  const audit = collectAudit(cwd);
  if (audit.report === undefined) {
    fail(audit.error, 1, { errors: audit.errors });
    return;
  }

  if (action === 'diff') {
    const diff = git(['diff', '--stat'], cwd);
    if (!diff.ok) {
      fail('git diff failed; working tree changes are unknown.', 1, { errors: ['diff'] });
      return;
    }
    if (isJson) console.log(JSON.stringify({ ok: true, diffStat: diff.stdout.trimEnd(), timestamp: new Date().toISOString() }, null, 2));
    else {
      console.log('\n  Git Hygiene — Working Tree Changes:\n');
      console.log(diff.stdout.trimEnd() || '  No unstaged changes.\n');
    }
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
