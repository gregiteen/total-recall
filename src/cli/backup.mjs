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

import { resolveAgentDir, resolveBrainDir, parseLayerFlag } from './agent-dir.mjs';

/** The meta-skill folder — this is what gets backed up */
function getSkillDir(layer = 'auto') {
  return resolveBrainDir(layer);
}

function commandExists(cmd) {
  const r = spawnSync('which', [cmd], { stdio: 'pipe' });
  return r.status === 0;
}

function parseArgs(args) {
  // Parse layer flag first
  const { layer, remainingArgs } = parseLayerFlag(args);
  const opts = { output: null, encrypt: true, pushGit: null, obsidian: null, install: false, help: false, layer };
  for (let i = 0; i < remainingArgs.length; i++) {
    switch (remainingArgs[i]) {
      case '--output':
      case '-o':
        opts.output = remainingArgs[++i];
        break;
      case '--no-encrypt':
        opts.encrypt = false;
        break;
      case '--push-git':
        opts.pushGit = remainingArgs[++i];
        break;
      case '--obsidian':
        opts.obsidian = remainingArgs[++i];
        break;
      case '--install':
        opts.install = true;
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

async function pushGitBackup(remote, layer = 'auto') {
  const SKILL_DIR = getSkillDir(layer);
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

  // Resolve the remote: if the argument is an existing remote name, use its URL.
  // Otherwise treat it as a URL and configure the 'backup' remote to point there.
  const remoteCheck = git(SKILL_DIR, 'remote', 'get-url', remote);
  if (remoteCheck.ok) {
    // Argument is an existing remote name — use it as-is, don't overwrite
    console.error(`  🔗 Using existing remote "${remote}" → ${remoteCheck.stdout}`);
  } else if (remote.includes('/') || remote.includes(':')) {
    // Argument looks like a URL — add or update the 'backup' remote
    const backupCheck = git(SKILL_DIR, 'remote', 'get-url', 'backup');
    if (!backupCheck.ok) {
      git(SKILL_DIR, 'remote', 'add', 'backup', remote);
      console.error(`  🔗 Remote "backup" added → ${remote}`);
    } else if (backupCheck.stdout !== remote) {
      git(SKILL_DIR, 'remote', 'set-url', 'backup', remote);
      console.error(`  🔗 Remote "backup" updated → ${remote}`);
    }
    // Push to the 'backup' remote name, not the raw URL
    remote = 'backup';
  } else {
    console.error(`  ❌ "${remote}" is not a configured git remote and doesn't look like a URL.`);
    console.error('  Use a remote name (e.g. "backup") or a full URL (e.g. "https://github.com/user/repo.git")');
    process.exit(1);
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

function obsidianBackup(vaultPath, layer = 'auto') {
  const SKILL_DIR = getSkillDir(layer);
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

  // Remove stale symlinks (e.g. from a prior install that used the wrong path)
  // so rsync can create the real directory
  try {
    const stat = fs.lstatSync(dest);
    if (stat.isSymbolicLink()) {
      console.error(`  ⚠️  Removing stale symlink at ${dest}`);
      fs.unlinkSync(dest);
    }
  } catch {
    // dest doesn't exist yet — that's fine
  }

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

/**
 * --install: Full automatic backup setup.
 *   1. Creates a private GitHub repo via `gh` CLI
 *   2. Writes .gitignore for derived/cache files
 *   3. Inits git, does first push
 *   4. Installs a daily launchd plist (macOS) or cron job (Linux)
 */
async function installBackup(layer = 'auto') {
  const SKILL_DIR = getSkillDir(layer);
  if (!fs.existsSync(SKILL_DIR)) {
    console.error(`  ❌ Meta-skill not found: ${SKILL_DIR}`);
    console.error('  Run: npx total-recall init');
    process.exit(1);
  }

  if (!commandExists('gh')) {
    console.error('  ❌ GitHub CLI (gh) not found. Install: brew install gh');
    process.exit(1);
  }

  // Determine a repo name from the project directory
  const projectDir = process.cwd();
  const projectName = path.basename(projectDir).replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  const isGlobal = SKILL_DIR.startsWith(os.homedir() + '/.agent');
  const repoName = isGlobal ? 'global-brain-backup' : `${projectName}-brain-backup`;

  // Get GitHub username
  const whoami = spawnSync('gh', ['api', 'user', '--jq', '.login'], { stdio: 'pipe' });
  if (whoami.status !== 0) {
    console.error('  ❌ Not authenticated with GitHub CLI. Run: gh auth login');
    process.exit(1);
  }
  const ghUser = whoami.stdout.toString().trim();
  const remoteUrl = `git@github.com:${ghUser}/${repoName}.git`;

  console.error(`\n  🧠 Installing automatic backup for brain at:`);
  console.error(`     ${SKILL_DIR}`);
  console.error(`     → ${ghUser}/${repoName} (private)\n`);

  // 1. Create GitHub repo (skip if exists)
  const checkRepo = spawnSync('gh', ['repo', 'view', `${ghUser}/${repoName}`, '--json', 'name'], { stdio: 'pipe' });
  if (checkRepo.status !== 0) {
    console.error('  📦 Creating private GitHub repo...');
    const create = spawnSync('gh', ['repo', 'create', `${ghUser}/${repoName}`, '--private', '--description', `Auto-backup: ${isGlobal ? 'Global brain (identity layer)' : projectName + ' project brain'}`], { stdio: 'pipe' });
    if (create.status !== 0) {
      console.error(`  ❌ Failed to create repo: ${create.stderr?.toString()}`);
      process.exit(1);
    }
    console.error(`  ✅ Created ${ghUser}/${repoName}`);
  } else {
    console.error(`  ✅ Repo ${ghUser}/${repoName} already exists`);
  }

  // 2. Write .gitignore for derived/cache files
  const gitignorePath = path.join(SKILL_DIR, '.gitignore');
  const gitignoreEntries = ['memory-derived/', 'sessions/', '*.backup', 'logs/', 'node_modules/'];
  let existingIgnore = '';
  if (fs.existsSync(gitignorePath)) {
    existingIgnore = fs.readFileSync(gitignorePath, 'utf8');
  }
  const missing = gitignoreEntries.filter(e => !existingIgnore.includes(e));
  if (missing.length > 0) {
    fs.appendFileSync(gitignorePath, '\n# Auto-added by total-recall backup --install\n' + missing.join('\n') + '\n');
    console.error(`  ✅ Updated .gitignore (added ${missing.length} entries)`);
  }

  // 3. Init git + first push
  await pushGitBackup(remoteUrl, layer);

  // 4. Install scheduled backup
  const platform = os.platform();
  const nodeBin = process.execPath;
  const trBin = path.join(path.dirname(nodeBin), 'total-recall');
  const label = isGlobal ? 'com.totalrecall.backup.global' : `com.totalrecall.backup.${projectName}`;

  if (platform === 'darwin') {
    // macOS: launchd plist
    const plistDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
    fs.mkdirSync(plistDir, { recursive: true });
    const logName = isGlobal ? 'backup-global.log' : `backup-${projectName}.log`;
    const logsDir = path.join(os.homedir(), '.agent', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    // Stagger times: global=2:30, projects get 2:00 + hash-based offset
    const minute = isGlobal ? 30 : (projectName.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 30);

    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodeBin}</string>
    <string>${trBin}</string>
    <string>backup</string>
    <string>--push-git</string>
    <string>${remoteUrl}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${projectDir}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>2</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${os.homedir()}</string>
    <key>PATH</key>
    <string>${path.dirname(nodeBin)}:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${path.join(logsDir, logName)}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(logsDir, logName)}</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>`;

    const plistPath = path.join(plistDir, `${label}.plist`);
    fs.writeFileSync(plistPath, plist);

    // Unload if exists, then load
    spawnSync('launchctl', ['remove', label], { stdio: 'pipe' });
    const load = spawnSync('launchctl', ['load', '-w', plistPath], { stdio: 'pipe' });
    if (load.status === 0) {
      console.error(`  ✅ Installed daily backup (2:${String(minute).padStart(2, '0')} AM)`);
    } else {
      console.error(`  ⚠️  launchctl load returned ${load.status} — plist saved, may need manual load`);
    }

  } else if (platform === 'linux') {
    // Linux: cron job
    const cronLine = `0 2 * * * ${nodeBin} ${trBin} backup --push-git ${remoteUrl} >> ${path.join(os.homedir(), '.agent', 'logs', 'backup.log')} 2>&1`;
    const existing = spawnSync('crontab', ['-l'], { stdio: 'pipe' });
    const currentCron = existing.stdout?.toString() || '';
    if (!currentCron.includes(repoName)) {
      const newCron = currentCron.trimEnd() + '\n' + cronLine + '\n';
      const install = spawnSync('crontab', ['-'], { input: newCron, stdio: 'pipe' });
      if (install.status === 0) {
        console.error('  ✅ Installed daily cron job (2:00 AM)');
      } else {
        console.error('  ⚠️  Could not install cron job — add manually:');
        console.error(`     ${cronLine}`);
      }
    } else {
      console.error('  ✅ Cron job already exists');
    }
  }

  console.error(`\n  🎉 Backup fully installed!`);
  console.error(`     Repo:     github.com/${ghUser}/${repoName}`);
  console.error(`     Schedule: Daily at 2:${platform === 'darwin' ? 'XX' : '00'} AM`);
  console.error(`     Manual:   total-recall backup --push-git ${remoteUrl}`);
}

export default async function backup(args) {
  const opts = parseArgs(args);
  const SKILL_DIR = getSkillDir(opts.layer);
  if (opts.help) {
    printHelp();
    return;
  }

  if (!fs.existsSync(SKILL_DIR)) {
    console.error(`  ❌ Meta-skill not found: ${SKILL_DIR}`);
    console.error('  Run: npx total-recall init');
    process.exit(1);
  }

  // Install mode: full automatic setup
  if (opts.install) {
    await installBackup(opts.layer);
    return;
  }

  // Git-push mode: sovereign diff-based backup
  if (opts.pushGit) {
    await pushGitBackup(opts.pushGit, opts.layer);
    return;
  }

  // Obsidian rsync mode
  if (opts.obsidian) {
    obsidianBackup(opts.obsidian, opts.layer);
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
