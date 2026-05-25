/**
 * total-recall uninstall
 *
 * Completely stop and remove all Total Recall services, launchd agents,
 * cron jobs, VFS global directories, and local workspace shims.
 *
 * Usage:
 *   npx total-recall uninstall
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import backup from './backup.mjs';

// ─── Logging Helpers ────────────────────────────────────────────────────────
function log(msg)      { console.error(`  ${msg}`); }
function logStep(n, msg) { console.error(`\n  [${n}] ${msg}`); }
function logOk(msg)    { console.error(`  ✅ ${msg}`); }
function logSkip(msg)  { console.error(`  ⏭  ${msg}`); }
function logWarn(msg)  { console.error(`  ⚠️  ${msg}`); }

function commandExists(cmd) {
  if (!cmd || !/^[a-zA-Z0-9_-]+$/.test(cmd)) {
    return false;
  }
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function runCommand(cmd, args, opts = {}) {
  try {
    const result = spawnSync(cmd, args, { stdio: 'ignore', ...opts });
    return result.status === 0;
  } catch {
    return false;
  }
}

function hasLaunchd() {
  return os.platform() === 'darwin';
}

function hasSystemd() {
  return os.platform() === 'linux' && commandExists('systemctl');
}

// ─── Main ───────────────────────────────────────────────────────────────────
export default async function uninstall(args = []) {
  const HOME = os.homedir();
  console.error(`
  ┌─────────────────────────────────────────────────────────┐
  │  Total Recall Uninstaller                               │
  │  Performing a complete system teardown...               │
  └─────────────────────────────────────────────────────────┘
`);

  const globalAgentDir = path.join(HOME, '.agent');
  const localAgentDir = path.join(process.cwd(), '.agent');

  let pushGit = null;
  let purge = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--push-git') {
      pushGit = args[++i];
    } else if (args[i] === '--purge') {
      purge = true;
    }
  }

  // Detect configured backup git remote if present
  let detectedRemote = null;
  const SKILL_DIR = path.join(localAgentDir, 'skills', 'total-recall');
  if (!pushGit && fs.existsSync(SKILL_DIR)) {
    try {
      const remoteCheck = spawnSync('git', ['remote', 'get-url', 'backup'], { cwd: SKILL_DIR, stdio: 'pipe' });
      if (remoteCheck.status === 0) {
        detectedRemote = remoteCheck.stdout.toString().trim();
      } else {
        const originCheck = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: SKILL_DIR, stdio: 'pipe' });
        if (originCheck.status === 0) {
          detectedRemote = originCheck.stdout.toString().trim();
        }
      }
    } catch {
      // Ignored
    }
  }

  const targetRemote = pushGit || detectedRemote;
  if (targetRemote) {
    logStep('0/4', `Automatically backing up brain to remote: ${targetRemote}`);
    try {
      await backup(['--push-git', targetRemote]);
      logOk('Pre-uninstall backup successfully pushed to remote!');
    } catch (err) {
      logWarn(`Git backup push failed: ${err.message}`);
      logWarn('Falling back to local tarball backup...');
      try {
        await backup(['--no-encrypt']);
        logOk('Local tarball backup created successfully.');
      } catch (tarErr) {
        logWarn(`Local tarball backup also failed: ${tarErr.message}`);
        logWarn('Teardown aborted to protect your brain. Resolve backup issues and try again.');
        return;
      }
    }
  } else if (fs.existsSync(SKILL_DIR)) {
    logStep('0/4', 'No git remote or Obsidian vault configured — creating local tarball backup');
    try {
      await backup(['--no-encrypt']);
      logOk('Local tarball backup created before uninstall.');
    } catch (err) {
      logWarn(`Local tarball backup failed: ${err.message}`);
      logWarn('Teardown aborted to protect your brain. Resolve backup issues and try again.');
      return;
    }
  }

  // ── Step 1: Stop and disable background services ──
  logStep('1/4', 'Stopping and disabling background services');

  if (hasLaunchd()) {
    const plists = [
      'com.totalrecall.daemon',
      'com.totalrecall.server',
      'com.totalrecall.relay',
      'com.totalrecall.duckdns',
      'com.totalrecall.backup',
      'com.totalrecall.obsidian-backup'
    ];

    const launchAgentsDir = path.join(HOME, 'Library', 'LaunchAgents');

    for (const plist of plists) {
      const plistPath = path.join(launchAgentsDir, `${plist}.plist`);
      if (fs.existsSync(plistPath)) {
        log(`Unloading ${plist}...`);
        runCommand('launchctl', ['unload', '-w', plistPath]);
        try {
          fs.unlinkSync(plistPath);
          logOk(`Removed LaunchAgent plist: ${plist}.plist`);
        } catch (err) {
          logWarn(`Failed to remove plist file: ${err.message}`);
        }
      } else {
        log(`No launchd agent file found for ${plist}`);
      }
    }
  } else if (hasSystemd()) {
    const userServices = [
      'total-recall-daemon.service',
      'total-recall-server.service',
      'total-recall-relay.service'
    ];

    for (const svc of userServices) {
      log(`Stopping user systemd service ${svc}...`);
      runCommand('systemctl', ['--user', 'disable', '--now', svc]);
      const svcPath = path.join(HOME, '.config', 'systemd', 'user', svc);
      if (fs.existsSync(svcPath)) {
        try {
          fs.unlinkSync(svcPath);
          logOk(`Removed systemd service file: ${svc}`);
        } catch (err) {
          logWarn(`Failed to remove service file: ${err.message}`);
        }
      }
    }
    runCommand('systemctl', ['--user', 'daemon-reload']);

    // Check system services
    const rootServices = [
      'total-recall-daemon.service',
      'total-recall-server.service'
    ];
    let reloadedRootSystemd = false;
    for (const svc of rootServices) {
      const dest = `/etc/systemd/system/${svc}`;
      if (fs.existsSync(dest)) {
        log(`Stopping system-wide systemd service ${svc} (requires sudo)...`);
        spawnSync('sudo', ['systemctl', 'disable', '--now', svc], { stdio: 'inherit' });
        try {
          spawnSync('sudo', ['rm', '-f', dest], { stdio: 'inherit' });
          logOk(`Removed system service file: ${dest}`);
          reloadedRootSystemd = true;
        } catch (err) {
          logWarn(`Failed to remove system service file: ${err.message}`);
        }
      }
    }
    if (reloadedRootSystemd) {
      spawnSync('sudo', ['systemctl', 'daemon-reload'], { stdio: 'inherit' });
    }

    // Cron jobs
    const cronJobs = [
      '/etc/cron.d/total-recall-duckdns',
      '/etc/cron.d/total-recall-backup',
      '/etc/cron.d/total-recall-obsidian-backup'
    ];
    for (const job of cronJobs) {
      if (fs.existsSync(job)) {
        log(`Removing cron job: ${job} (requires sudo)...`);
        try {
          spawnSync('sudo', ['rm', '-f', job], { stdio: 'inherit' });
          logOk(`Removed cron file: ${job}`);
        } catch (err) {
          logWarn(`Failed to remove cron file: ${err.message}`);
        }
      }
    }
  } else {
    log('No systemd or launchd detected. Moving to direct process management.');
  }

  // ── Step 2: Stop detached background Node.js processes ──
  logStep('2/4', 'Stopping any standalone background processes');

  const dirsToScan = [
    path.join(globalAgentDir, 'skills', 'total-recall'),
    path.join(localAgentDir, 'skills', 'total-recall'),
  ];
  for (const dir of dirsToScan) {
    if (!fs.existsSync(dir)) continue;
    const logsDir = path.join(dir, 'logs');
    if (!fs.existsSync(logsDir)) continue;

    const pidFiles = ['daemon.pid', 'relay.pid'];
    for (const file of pidFiles) {
      const p = path.join(logsDir, file);
      if (fs.existsSync(p)) {
        try {
          const pid = parseInt(fs.readFileSync(p, 'utf8').trim(), 10);
          if (!isNaN(pid)) {
            // Check if alive
            try {
              process.kill(pid, 0);
              log(`Sending SIGTERM to detached process (PID ${pid})...`);
              process.kill(pid, 'SIGTERM');
              // Give it a brief moment to clean up
              let killed = false;
              for (let i = 0; i < 5; i++) {
                try {
                  process.kill(pid, 0);
                  spawnSync('sleep', ['0.2']);
                } catch {
                  killed = true;
                  break;
                }
              }
              if (!killed) {
                logWarn(`Process ${pid} did not exit. Sending SIGKILL...`);
                process.kill(pid, 'SIGKILL');
              }
              logOk(`Stopped process ${pid} (${file})`);
            } catch {
              log(`Process PID ${pid} is already stopped.`);
            }
          }
          fs.unlinkSync(p);
        } catch (err) {
          logWarn(`Could not cleanly stop process from PID file ${file}: ${err.message}`);
        }
      }
    }
  }

  // ── Step 3: Clean up workspace shims ──
  logStep('3/4', 'Cleaning up active workspace shims in current directory');

  const shimFiles = [
    '.clauderules',
    'CLAUDE.md',
    '.cursorrules',
    'AGENTS.md',
    'GEMINI.md',
    '.github/copilot-instructions.md',
    '.vscode/copilot-instructions.md',
    '.windsurfrules',
    'WINDSURF.md',
    'INSTRUCTIONS.md'
  ];

  for (const file of shimFiles) {
    const filePath = path.join(process.cwd(), file);
    if (!fs.existsSync(filePath)) continue;

    try {
      const stat = fs.lstatSync(filePath);
      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(filePath);
        if (target.includes('.agent') || target.includes('INSTRUCTIONS.md')) {
          fs.unlinkSync(filePath);
          logOk(`Removed symlink: ${file} → ${target}`);
        } else {
          logSkip(`Preserved symlink ${file} (points to ${target}, not part of Total Recall)`);
        }
      } else {
        // Normal file
        let content = fs.readFileSync(filePath, 'utf8');
        const startTag = '<!-- BEGIN INJECTED MEMORY -->';
        const endTag = '<!-- END INJECTED MEMORY -->';

        if (content.includes(startTag) && content.includes(endTag)) {
          const startIndex = content.indexOf(startTag);
          const endIndex = content.indexOf(endTag) + endTag.length;
          
          let cleanedContent = content.slice(0, startIndex) + content.slice(endIndex);
          cleanedContent = cleanedContent.trim();

          // Also remove "Tier 1 Invariants" headers if injected by total-recall init/compile
          if (cleanedContent.startsWith('# Tier 1 Invariants (Total Recall Hot Memory)')) {
            const nextHeading = cleanedContent.indexOf('\n#', 40);
            if (nextHeading !== -1) {
              cleanedContent = cleanedContent.slice(nextHeading).trim();
            } else {
              cleanedContent = '';
            }
          }

          if (cleanedContent === '' || cleanedContent === '<!-- END INJECTED MEMORY -->') {
            fs.unlinkSync(filePath);
            logOk(`Removed fully empty rule file: ${file}`);
          } else {
            fs.writeFileSync(filePath, cleanedContent, 'utf8');
            logOk(`Cleaned injected Total Recall block from: ${file}`);
          }
        } else if (file === 'INSTRUCTIONS.md' && (content.includes('# Invariant Memory') || content.includes('# Tier 1 Invariants'))) {
          // If INSTRUCTIONS.md is primarily our file, delete it
          fs.unlinkSync(filePath);
          logOk(`Removed compiled instructions file: ${file}`);
        } else {
          logSkip(`No Total Recall injected blocks found in: ${file}`);
        }
      }
    } catch (err) {
      logWarn(`Failed to audit/clean rule file ${file}: ${err.message}`);
    }
  }

  // ── Step 4: Purge Total Recall data ──
  logStep('4/4', 'Removing Total Recall brain and runtime artifacts');

  // What we remove:
  //   .agent/skills/total-recall/  — the brain (already backed up)
  //   .agent/INSTRUCTIONS.md, AGENTS.md, etc. — compiled shims
  // What we NEVER touch:
  //   .agent/                      — always stays
  //   .agent/skills/               — always stays (user may have other skills)
  //   .agent/skills/<other>/       — other user skills, never ours to delete

  for (const agentDir of [globalAgentDir, localAgentDir]) {
    if (!fs.existsSync(agentDir)) {
      logSkip(`${agentDir === globalAgentDir ? 'Global' : 'Local'} .agent VFS is not present`);
      continue;
    }
    const label = agentDir === globalAgentDir ? 'Global' : 'Local';
    log(`Cleaning ${label} .agent at ${agentDir}...`);

    // 1. Remove the brain: .agent/skills/total-recall/
    const brainPath = path.join(agentDir, 'skills', 'total-recall');
    if (fs.existsSync(brainPath)) {
      try {
        fs.rmSync(brainPath, { recursive: true, force: true });
        logOk(`${label}: Removed brain (skills/total-recall/)`);
      } catch (err) {
        logWarn(`${label}: Failed to remove brain: ${err.message}`);
      }
    }

    // 2. Strip Total Recall injected blocks from IDE instruction files.
    //    These files belong to the IDE ecosystem, NOT to Total Recall.
    //    TR only injects managed blocks between comment markers.
    const shimFiles = ['INSTRUCTIONS.md', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md',
      'CODEX.md', '.clauderules', '.cursorrules', '.codexrules',
      'WINDSURF.md', '.windsurfrules'];
    const INJECT_PATTERNS = [
      /<!-- BEGIN INJECTED MEMORY:.*?-->[\s\S]*?<!-- END INJECTED MEMORY -->\n?/g,
      /<!-- BEGIN INJECTED ACTIVE DIRECTIVES:.*?-->[\s\S]*?<!-- END INJECTED ACTIVE DIRECTIVES -->\n?/g,
    ];
    // Check both .agent/ level and project root
    const shimDirs = [agentDir, agentDir === localAgentDir ? path.dirname(localAgentDir) : null].filter(Boolean);
    for (const dir of shimDirs) {
      for (const file of shimFiles) {
        const p = path.join(dir, file);
        if (!fs.existsSync(p)) continue;
        try {
          let content = fs.readFileSync(p, 'utf8');
          let changed = false;
          for (const pat of INJECT_PATTERNS) {
            const cleaned = content.replace(pat, '');
            if (cleaned !== content) { content = cleaned; changed = true; }
          }
          if (changed) {
            // If only whitespace remains after stripping, delete the file
            if (content.trim().length === 0) {
              fs.rmSync(p, { force: true });
            } else {
              fs.writeFileSync(p, content, 'utf8');
            }
          }
        } catch {}
      }
    }
    logOk(`${label}: Stripped Total Recall injections from IDE instruction files`);
  }

  console.error(`
  ┌─────────────────────────────────────────────────────────┐
  │  ✅ Uninstall Complete!                                  │
  │  Total Recall has been successfully removed from your   │
  │  system, workspaces, and background agents.             │
  └─────────────────────────────────────────────────────────┘
`);
}
