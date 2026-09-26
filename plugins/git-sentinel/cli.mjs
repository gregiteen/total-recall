#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';

function git(args, cwd = process.cwd()) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch (err) {
    return null;
  }
}

export async function run(argv = []) {
  // argv: ["node", "total-recall", "git-sentinel", "<subcommand>", ...flags]
  const clean = Array.isArray(argv) ? argv.slice(3) : [];
  const isJson = clean.includes('--json');
  const action = clean.find(a => !a.startsWith('--')) || 'audit';

  const cwd = process.cwd();
  const isInsideWorkTree = git(['rev-parse', '--is-inside-work-tree'], cwd) === 'true';

  if (!isInsideWorkTree) {
    // Report and set the exit code; never process.exit() — a host that runs
    // this in-process would be stopped with it.
    console.error(`${cwd} is not inside a git repository.`);
    process.exitCode = 1;
    return;
  }

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd) || 'unknown';
  const statusOutput = git(['status', '--porcelain'], cwd) || '';
  const lines = statusOutput.split('\n').filter(Boolean);

  const staged = lines.filter(l => l.match(/^[MADRC]/)).length;
  const unstaged = lines.filter(l => l.match(/^.[MADRCU?]/) && !l.startsWith('??')).length;
  const untracked = lines.filter(l => l.startsWith('??')).length;
  const isClean = lines.length === 0;

  const unpushedOutput = git(['log', '@{u}..HEAD', '--oneline'], cwd);
  const unpushedCount = unpushedOutput ? unpushedOutput.split('\n').filter(Boolean).length : 0;

  const stashOutput = git(['stash', 'list'], cwd);
  const stashCount = stashOutput ? stashOutput.split('\n').filter(Boolean).length : 0;

  const lastCommit = git(['log', '-1', '--format=%h — %s (%cr)'], cwd) || 'No commits yet';

  const auditReport = {
    branch,
    isClean,
    unpushedCommits: unpushedCount,
    stagedFiles: staged,
    unstagedFiles: unstaged,
    untrackedFiles: untracked,
    totalDirty: lines.length,
    stashCount,
    lastCommit,
    timestamp: new Date().toISOString()
  };

  if (isJson) {
    console.log(JSON.stringify(auditReport, null, 2));
    return;
  }

  if (action === 'diff') {
    const diffStat = git(['diff', '--stat'], cwd);
    console.log('\n🔍 Git Sentinel — Working Tree Changes:\n');
    console.log(diffStat || '  No unstaged changes.\n');
    return;
  }

  console.log('\n🛡️  Git Sentinel — Repository State\n');
  console.log(`  Active Branch:      \x1b[36m${branch}\x1b[0m`);
  console.log(`  Worktree State:     ${isClean ? '\x1b[32mClean ✅\x1b[0m' : `\x1b[33mDirty (${lines.length} modified/untracked files) ⚠️\x1b[0m`}`);
  if (!isClean) {
    console.log(`    - Staged files:   ${staged}`);
    console.log(`    - Unstaged files: ${unstaged}`);
    console.log(`    - Untracked:      ${untracked}`);
  }
  console.log(`  Unpushed Commits:   ${unpushedCount === 0 ? 'Up to date with upstream ✅' : `\x1b[33m${unpushedCount} commit(s) ahead ⬆️\x1b[0m`}`);
  console.log(`  Stash Stack:        ${stashCount} saved stashes`);
  console.log(`  Head Commit:        ${lastCommit}\n`);
}

export default run;
