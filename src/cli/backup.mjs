/**
 * total-recall backup
 *
 * Back up the meta-skill folder (the user's brain) to:
 *   - GitHub repo (diff-based, sovereign)
 *   - Encrypted/plain tarball
 *   - Obsidian vault (rsync)
 *
 * The meta-skill at .agent/skills/total-recall/ IS the brain — it contains
 * rules, knowledge, preferences, corrections, research, integrations,
 * automations, sub-skills, and scripts. Everything else is derived/runtime.
 *
 * Usage:
 *   npx total-recall backup [--output <path>] [--no-encrypt]
 *   npx total-recall backup --push-git <remote-url>
 *   npx total-recall backup --obsidian <path>
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { agentDir } from '../core/config.mjs';

function getAgentDir() {
  return process.env.AGENT_DIR || process.env._TR_TEST_AGENT_DIR || agentDir;
}

/** The meta-skill folder — this is what gets backed up */
function getSkillDir() {
  return path.join(getAgentDir(), 'skills', 'total-recall');
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
  total-recall backup — Back up the meta-skill (your brain)

  Usage: total-recall backup [options]

  Options:
    --output, -o <path>    Destination archive path (tarball mode)
    --no-encrypt           Write a plain .tar.gz archive (default: gpg-encrypted)
    --push-git <remote>    Commit brain to a git remote (sovereign, diff-based)
                           e.g. git@github.com:you/total-recall-brain.git
                           Initialises the skill folder as a git repo on first run.
    --obsidian <path>      Rsync brain snapshot into an Obsidian vault folder.
                           e.g. ~/Documents/Obsidian Vault
                           Creates/updates "Total Recall/" inside that vault.
                           Pair with Obsidian Sync or iCloud for cloud backup.
    --help, -h             Show this help

  What gets backed up:
    .agent/skills/total-recall/   — The meta-skill (rules, knowledge, skills,
                                    integrations, automations, scripts)

  What does NOT get backed up (runtime/derived, can be regenerated):
    memory-derived/               — Embeddings, indexes (inside the brain, but regenerable)
    sessions/                     — Conversation logs (inside the brain, ingested from IDEs)

  Scheduling:
    Add --backup-repo <remote> to "total-recall deploy" to install a
    daily backup job (cron on Linux, launchd on macOS).
    Add --backup-obsidian <path> to install a daily Obsidian rsync job.
`);
}

async function pushGitBackup(remote) {
  const SKILL_DIR = getSkillDir();
  if (!commandExists('git')) {
    console.error('  ❌ git not found — cannot push backup');
    process.exit(1);
  }

  if (!fs.existsSync(SKILL_DIR)) {
    console.error(`  ❌ Meta-skill not found: ${SKILL_DIR}`);
    console.error('  Run: npx total-recall init');
    process.exit(1);
  }

  // Initialise the skill folder as a git repo if needed
  const gitDir = path.join(SKILL_DIR, '.git');
  if (!fs.existsSync(gitDir)) {
    console.error(`  🔧 Initialising git repo in ${SKILL_DIR}`);
    const init = git(SKILL_DIR, 'init', '-b', 'main');
    if (!init.ok) {
      git(SKILL_DIR, 'init');
      git(SKILL_DIR, 'checkout', '-b', 'main');
    }
  }

  // Add or update the backup remote
  const remoteCheck = git(SKILL_DIR, 'remote', 'get-url', 'backup');
  if (!remoteCheck.ok) {
    git(SKILL_DIR, 'remote', 'add', 'backup', remote);
    console.error(`  🔗 Remote "backup" added → ${remote}`);
  } else if (remoteCheck.stdout !== remote) {
    git(SKILL_DIR, 'remote', 'set-url', 'backup', remote);
    console.error(`  🔗 Remote "backup" updated → ${remote}`);
  }

  // Stage all changes
  git(SKILL_DIR, 'add', '-A');
  const status = git(SKILL_DIR, 'status', '--porcelain');
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

  if (!status.stdout) {
    console.error(`  ✅ Brain unchanged — nothing to push (${stamp})`);
    return;
  }

  // Commit (fall back to embedded identity if git config is missing)
  let commit = git(SKILL_DIR, 'commit', '-m', `backup: ${stamp}`);
  if (!commit.ok) {
    commit = git(SKILL_DIR, '-c', 'user.email=backup@total-recall', '-c', 'user.name=Total Recall', 'commit', '-m', `backup: ${stamp}`);
    if (!commit.ok) {
      console.error(`  ❌ Commit failed: ${commit.stderr}`);
      process.exit(1);
    }
  }

  // Push (use --force-with-lease to guard against diverged history)
  console.error(`  📤 Pushing brain to ${remote}...`);
  let push = git(SKILL_DIR, 'push', 'backup', 'HEAD:main', '--force-with-lease');
  if (!push.ok) {
    push = git(SKILL_DIR, 'push', 'backup', 'HEAD:main', '--force');
    if (!push.ok) {
      console.error(`  ❌ Push failed: ${push.stderr}`);
      process.exit(1);
    }
  }
  console.error(`  ✅ Brain pushed to ${remote} (${stamp})`);
}

function obsidianBackup(vaultPath) {
  const SKILL_DIR = getSkillDir();
  if (!commandExists('rsync')) {
    console.error('  ❌ rsync not found — install it or use --push-git instead');
    process.exit(1);
  }

  if (!fs.existsSync(SKILL_DIR)) {
    console.error(`  ❌ Meta-skill not found: ${SKILL_DIR}`);
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
  console.error(`  📓 Syncing brain → ${dest} (${stamp})`);

  // rsync with delete so removed files don't linger in Obsidian
  const result = spawnSync(
    'rsync',
    ['-a', '--delete', '--exclude=.git', SKILL_DIR + '/', dest + '/'],
    { stdio: 'inherit' }
  );

  if (result.status !== 0) {
    console.error(`  ❌ rsync failed (exit ${result.status})`);
    process.exit(result.status || 1);
  }
  console.error(`  ✅ Brain synced to Obsidian (${stamp})`);
}

export default async function backup(args) {
  const SKILL_DIR = getSkillDir();
  const opts = parseArgs(args);
  if (opts.help) {
    printHelp();
    return;
  }

  if (!fs.existsSync(SKILL_DIR)) {
    console.error(`  ❌ Meta-skill not found: ${SKILL_DIR}`);
    console.error('  Run: npx total-recall init');
    process.exit(1);
  }

  // Git-push mode: sovereign diff-based backup
  if (opts.pushGit) {
    await pushGitBackup(opts.pushGit);
    return;
  }

  // Obsidian rsync mode
  if (opts.obsidian) {
    obsidianBackup(opts.obsidian);
    return;
  }

  // Tarball mode: back up the meta-skill folder
  const output = opts.output || defaultOutput(opts.encrypt);
  fs.mkdirSync(path.dirname(output), { recursive: true });

  const parentDir = path.dirname(SKILL_DIR);
  const skillBase = path.basename(SKILL_DIR);

  let command;
  if (opts.encrypt) {
    if (!commandExists('gpg')) {
      console.error('  ❌ gpg not found; use --no-encrypt or install gpg');
      process.exit(1);
    }
    command = [
      'tar -czf -',
      '-C', shellDoubleQuote(parentDir),
      shellDoubleQuote(skillBase),
      '|',
      'gpg --symmetric --cipher-algo AES256 --output',
      shellDoubleQuote(output)
    ].join(' ');
  } else {
    command = [
      'tar -czf', shellDoubleQuote(output),
      '-C', shellDoubleQuote(parentDir),
      shellDoubleQuote(skillBase)
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
