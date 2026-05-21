/**
 * total-recall backup
 *
 * Create an encrypted or unencrypted tarball of the local ~/.agent VFS,
 * or push the vault as a git commit to a remote repository.
 *
 * Usage:
 *   npx total-recall backup [--output <path>] [--no-encrypt]
 *   npx total-recall backup --push-git <remote-url>
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { agentDir } from '../core/config.mjs';

function getAgentDir() {
  return agentDir;
}

function commandExists(cmd) {
  const r = spawnSync('which', [cmd], { stdio: 'pipe' });
  return r.status === 0;
}

function parseArgs(args) {
  const opts = { output: null, encrypt: true, pushGit: null, obsidian: null, help: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--output':
      case '-o':
        opts.output = args[++i];
        break;
      case '--no-encrypt':
        opts.encrypt = false;
        break;
      case '--push-git':
        opts.pushGit = args[++i];
        break;
      case '--obsidian':
        opts.obsidian = args[++i];
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
    }
  }
  return opts;
}

function git(cwd, ...gitArgs) {
  const result = spawnSync('git', gitArgs, { cwd, stdio: 'pipe' });
  return {
    ok: result.status === 0,
    stdout: result.stdout?.toString().trim() || '',
    stderr: result.stderr?.toString().trim() || '',
  };
}

function defaultOutput(encrypt) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = encrypt ? '.tar.gz.gpg' : '.tar.gz';
  return path.join(os.homedir(), `total-recall-backup-${stamp}${suffix}`);
}

function shellDoubleQuote(value) {
  return `"${String(value).replace(/(["\\$`])/g, '\\$1')}"`;
}

function printHelp() {
  console.log(`
  total-recall backup — Back up the VFS

  Usage: total-recall backup [options]

  Options:
    --output, -o <path>    Destination archive path (tarball mode)
    --no-encrypt           Write a plain .tar.gz archive (default: gpg-encrypted)
    --push-git <remote>    Commit vault to a git remote (sovereign, diff-based)
                           e.g. git@github.com:you/brain-backup.git
                           Initialises ~/.agent as a git repo on first run.
                           Restore: npx total-recall deploy --brain-repo <remote>
    --obsidian <path>      Rsync vault snapshot into an Obsidian vault folder.
                           e.g. ~/Documents/Obsidian Vault
                           Creates/updates "Total Recall/" inside that vault.
                           Pair with Obsidian Sync or iCloud for cloud backup.
    --help, -h             Show this help

  Scheduling:
    Add --backup-repo <remote> to "total-recall deploy" to install a
    daily backup job (cron on Linux, launchd on macOS).
    Add --backup-obsidian <path> to install a daily Obsidian rsync job.
`);
}

async function pushGitBackup(remote) {
  const AGENT_DIR = getAgentDir();
  if (!commandExists('git')) {
    console.error('  ❌ git not found — cannot push backup');
    process.exit(1);
  }

  // Initialise ~/.agent as a git repo if needed
  const gitDir = path.join(AGENT_DIR, '.git');
  if (!fs.existsSync(gitDir)) {
    console.error(`  🔧 Initialising git repo in ${AGENT_DIR}`);
    const init = git(AGENT_DIR, 'init', '-b', 'main');
    if (!init.ok) {
      // Older git may not support -b; fall back
      git(AGENT_DIR, 'init');
      git(AGENT_DIR, 'checkout', '-b', 'main');
    }
    // Exclude large derived files from git history
    const gitignore = path.join(AGENT_DIR, '.gitignore');
    if (!fs.existsSync(gitignore)) {
      fs.writeFileSync(gitignore, 'memory-derived/embeddings.jsonl\n');
    }
  }

  // Add or update the backup remote
  const remoteCheck = git(AGENT_DIR, 'remote', 'get-url', 'backup');
  if (!remoteCheck.ok) {
    git(AGENT_DIR, 'remote', 'add', 'backup', remote);
    console.error(`  🔗 Remote "backup" added → ${remote}`);
  } else if (remoteCheck.stdout !== remote) {
    git(AGENT_DIR, 'remote', 'set-url', 'backup', remote);
    console.error(`  🔗 Remote "backup" updated → ${remote}`);
  }

  // Stage all changes
  git(AGENT_DIR, 'add', '-A');
  const status = git(AGENT_DIR, 'status', '--porcelain');
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

  if (!status.stdout) {
    console.error(`  ✅ Vault unchanged — nothing to push (${stamp})`);
    return;
  }

  // Commit (fall back to embedded identity if git config is missing)
  let commit = git(AGENT_DIR, 'commit', '-m', `backup: ${stamp}`);
  if (!commit.ok) {
    commit = git(AGENT_DIR, '-c', 'user.email=backup@total-recall', '-c', 'user.name=Total Recall', 'commit', '-m', `backup: ${stamp}`);
    if (!commit.ok) {
      console.error(`  ❌ Commit failed: ${commit.stderr}`);
      process.exit(1);
    }
  }

  // Push (use --force-with-lease to guard against diverged history)
  console.error(`  📤 Pushing vault to ${remote}...`);
  let push = git(AGENT_DIR, 'push', 'backup', 'HEAD:main', '--force-with-lease');
  if (!push.ok) {
    // First-ever push has no upstream; --force is safe here
    push = git(AGENT_DIR, 'push', 'backup', 'HEAD:main', '--force');
    if (!push.ok) {
      console.error(`  ❌ Push failed: ${push.stderr}`);
      process.exit(1);
    }
  }
  console.error(`  ✅ Vault pushed to ${remote} (${stamp})`);
}

function obsidianBackup(vaultPath) {
  const AGENT_DIR = getAgentDir();
  if (!commandExists('rsync')) {
    console.error('  ❌ rsync not found — install it or use --push-git instead');
    process.exit(1);
  }

  const memoryVault = path.join(AGENT_DIR, 'memory-vault');
  if (!fs.existsSync(memoryVault)) {
    console.error(`  ❌ Memory vault not found: ${memoryVault}`);
    process.exit(1);
  }

  const expanded = vaultPath.startsWith('~')
    ? path.join(os.homedir(), vaultPath.slice(1))
    : vaultPath;

  if (!fs.existsSync(expanded)) {
    console.error(`  ❌ Obsidian vault not found: ${expanded}`);
    process.exit(1);
  }

  const dest = path.join(expanded, 'Total Recall');
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.error(`  📓 Syncing vault → ${dest} (${stamp})`);

  // rsync with delete so removed nodes don't linger in Obsidian
  const result = spawnSync(
    'rsync',
    ['-a', '--delete', '--exclude=.git', memoryVault + '/', dest + '/'],
    { stdio: 'inherit' }
  );

  if (result.status !== 0) {
    console.error(`  ❌ rsync failed (exit ${result.status})`);
    process.exit(result.status || 1);
  }
  console.error(`  ✅ Vault synced to Obsidian (${stamp})`);
}

export default async function backup(args) {
  const AGENT_DIR = getAgentDir();
  const opts = parseArgs(args);
  if (opts.help) {
    printHelp();
    return;
  }

  if (!fs.existsSync(AGENT_DIR)) {
    console.error(`  ❌ Agent directory not found: ${AGENT_DIR}`);
    process.exit(1);
  }

  // Git-push mode: sovereign diff-based backup, no tarball
  if (opts.pushGit) {
    await pushGitBackup(opts.pushGit);
    return;
  }

  // Obsidian rsync mode
  if (opts.obsidian) {
    obsidianBackup(opts.obsidian);
    return;
  }

  const output = opts.output || defaultOutput(opts.encrypt);
  fs.mkdirSync(path.dirname(output), { recursive: true });

  const homeDir = path.dirname(AGENT_DIR);
  const agentBase = path.basename(AGENT_DIR);

  let command;
  if (opts.encrypt) {
    if (!commandExists('gpg')) {
      console.error('  ❌ gpg not found; use --no-encrypt or install gpg');
      process.exit(1);
    }
    command = [
      'tar -czf -',
      '-C', shellDoubleQuote(homeDir),
      shellDoubleQuote(agentBase),
      '|',
      'gpg --symmetric --cipher-algo AES256 --output',
      shellDoubleQuote(output)
    ].join(' ');
  } else {
    command = [
      'tar -czf', shellDoubleQuote(output),
      '-C', shellDoubleQuote(homeDir),
      shellDoubleQuote(agentBase)
    ].join(' ');
  }

  console.error(`  📦 Creating backup: ${output}`);
  const result = spawnSync('sh', ['-c', command], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`  ❌ Backup failed (exit ${result.status})`);
    process.exit(result.status || 1);
  }

  const stat = fs.statSync(output);
  console.error(`  ✅ Backup complete (${stat.size} bytes)`);
}
