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
export default async function uninstall() {
  const HOME = os.homedir();
  console.error(`
  ┌─────────────────────────────────────────────────────────┐
  │  Total Recall Uninstaller                               │
  │  Performing a complete system teardown...               │
  └─────────────────────────────────────────────────────────┘
`);

  const globalAgentDir = path.join(HOME, '.agent');
  const localAgentDir = path.join(process.cwd(), '.agent');

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

  const dirsToScan = [globalAgentDir, localAgentDir];
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

  // ── Step 4: Purge VFS directory ──
  logStep('4/4', 'Purging VFS and configuration folders');

  if (fs.existsSync(globalAgentDir)) {
    log(`Purging Global ~/.agent VFS at ${globalAgentDir}...`);
    try {
      fs.rmSync(globalAgentDir, { recursive: true, force: true });
      logOk('Purged: Global ~/.agent VFS');
    } catch (err) {
      logWarn(`Failed to delete global agent directory: ${err.message}`);
    }
  } else {
    logSkip('Global ~/.agent VFS is not present');
  }

  if (fs.existsSync(localAgentDir)) {
    log(`Cleaning Local workspace .agent VFS at ${localAgentDir}...`);
    // In a development environment, .agent/skills/ and .agent/memory-vault/ may be tracked in git.
    // To protect against deleting source files, we only remove runtime folders.
    const subdirs = ['memory-derived', 'memory-inbox', 'sessions', 'logs', 'scheduler'];
    for (const sub of subdirs) {
      const p = path.join(localAgentDir, sub);
      if (fs.existsSync(p)) {
        try {
          fs.rmSync(p, { recursive: true, force: true });
          logOk(`Removed local runtime folder: .agent/${sub}`);
        } catch (err) {
          logWarn(`Failed to delete local folder .agent/${sub}: ${err.message}`);
        }
      }
    }
    // Check if anything else is left. If empty, we can remove .agent entirely.
    try {
      const files = fs.readdirSync(localAgentDir);
      const keeps = files.filter(f => f === 'skills' || f === 'memory-vault');
      if (keeps.length === 0) {
        fs.rmSync(localAgentDir, { recursive: true, force: true });
        logOk('Purged empty local workspace .agent folder');
      } else {
        logOk('Preserved version-controlled local workspace .agent folders (skills, memory-vault)');
      }
    } catch {
      // ignore
    }
  } else {
    logSkip('Local workspace .agent VFS is not present');
  }

  console.error(`
  ┌─────────────────────────────────────────────────────────┐
  │  ✅ Uninstall Complete!                                  │
  │  Total Recall has been successfully removed from your   │
  │  system, workspaces, and background agents.             │
  └─────────────────────────────────────────────────────────┘
`);
}
