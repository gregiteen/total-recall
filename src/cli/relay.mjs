/**
 * total-recall relay
 *
 * Local background daemon. Watches all IDE session directories on the user's
 * machine (Claude Code, Codex, Antigravity, VS Code Copilot, Cursor) and ships
 * new conversation sessions to the remote Total Recall brain via the REST API.
 * The brain's dream cycle then distills sessions into SSSS memory nodes.
 *
 * This runs on the USER'S LOCAL MACHINE, not on the server. It bridges the gap
 * between local IDE sessions and a remote brain.
 *
 * Usage:
 *   npx total-recall relay start    Start the relay daemon
 *   npx total-recall relay stop     Stop the relay daemon
 *   npx total-recall relay status   Show relay status + last sync times
 *   npx total-recall relay once     Single scan (no watch loop) — good for testing
 *   npx total-recall relay --help   Show this help
 *
 * Config (read from ~/.agent/skills/total-recall/config/brain.json):
 *   { "url": "https://yourdomain.duckdns.org", "token": "tr_..." }
 *
 * Install as system service:
 *   npx total-recall relay install   Install launchd (macOS) or systemd (Linux) service
 *   npx total-recall relay uninstall Remove the service
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveAgentDir } from './agent-dir.mjs';
import { agentDir as configAgentDir, brainDir as configBrainDir } from '../core/config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const HOME = os.homedir();

// ─── Config ───────────────────────────────────────────────────────────────────

function loadBrainConfig(agentDir) {
  const p = path.join(agentDir, 'config', 'brain.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function brainUrl(config) {
  return (config?.url || 'http://localhost:3000').replace(/\/$/, '');
}

function brainHeaders(config) {
  const h = { 'Content-Type': 'application/json' };
  if (config?.token) h['Authorization'] = `Bearer ${config.token}`;
  return h;
}

// ─── State: last-seen file mtimes ─────────────────────────────────────────────

function stateFile(agentDir) {
  return path.join(agentDir, 'logs', 'relay-state.json');
}

function loadState(agentDir) {
  const p = stateFile(agentDir);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

function saveState(agentDir, state) {
  const p = stateFile(agentDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2), 'utf8');
}

// ─── IDE source definitions (mirrors session-watcher SOURCES) ─────────────────

function getSources() {
  return [
    {
      name: 'claude-code',
      root: path.join(HOME, '.claude', 'projects'),
      filter: (f) => f.endsWith('.jsonl'),
      dirFilter: null,
    },
    {
      name: 'codex',
      root: path.join(HOME, '.codex', 'sessions'),
      filter: (f) => f.endsWith('.jsonl'),
      dirFilter: null,
    },
    {
      name: 'antigravity',
      root: path.join(HOME, '.gemini', 'antigravity', 'brain'),
      filter: (f) => f === 'overview.txt' || f === 'transcript.jsonl',
      dirFilter: null,
    },
    {
      name: 'vscode',
      root: path.join(HOME, 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage'),
      filter: (f) => f.endsWith('.jsonl'),
      dirFilter: (d) => d === 'chatSessions',
    },
    {
      name: 'cursor',
      root: path.join(HOME, '.cursor', 'projects'),
      filter: (f) => f.endsWith('.jsonl'),
      dirFilter: null,
    },
  ];
}

// ─── File walker ──────────────────────────────────────────────────────────────

function findFiles(root, filter, dirFilter = null, maxDepth = 5) {
  const results = [];
  if (!fs.existsSync(root)) return results;

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!dirFilter || depth === 0 || dirFilter(entry.name)) walk(full, depth + 1);
      } else if (entry.isFile() && filter(entry.name)) {
        results.push(full);
      }
    }
  }

  walk(root, 0);
  return results;
}

// ─── Ship a file to the brain ─────────────────────────────────────────────────

async function shipFile(filePath, sourceName, brainBaseUrl, headers) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { return false; }
  if (!content.trim()) return false;

  // Detect project name from the file path by looking for a parent git repo
  let project = null;
  try {
    let dir = path.dirname(filePath);
    for (let i = 0; i < 8 && dir !== path.dirname(dir); i++) {
      if (fs.existsSync(path.join(dir, '.git'))) {
        project = path.basename(dir);
        break;
      }
      dir = path.dirname(dir);
    }
  } catch { /* non-fatal */ }

  const payload = {
    id: crypto.createHash('sha256').update(filePath).digest('hex').slice(0, 12),
    source: sourceName,
    path: filePath,
    project,
    content: content.slice(0, 40_000_000), // cap at 40MB to stay well under the server's 50MB JSON body limit
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
  };

  try {
    const res = await fetch(`${brainBaseUrl}/api/sessions/ingest`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Single scan pass ─────────────────────────────────────────────────────────

async function runScan(agentDir, { verbose = false } = {}) {
  const config = loadBrainConfig(agentDir);
  if (!config) {
    if (verbose) console.error('[relay] No brain.json config found. Run: npx total-recall connect claude-code --brain <url> --token <pat>');
    return { shipped: 0, skipped: 0, errors: 0 };
  }

  const base = brainUrl(config);
  const headers = brainHeaders(config);
  const state = loadState(agentDir);
  const sources = getSources();

  let shipped = 0, skipped = 0, errors = 0;

  for (const source of sources) {
    const files = findFiles(source.root, source.filter, source.dirFilter);
    for (const filePath of files) {
      let mtime;
      try { mtime = fs.statSync(filePath).mtimeMs; } catch { continue; }

      const key = filePath;
      if (state[key] && state[key] >= mtime) {
        skipped++;
        continue;
      }

      const ok = await shipFile(filePath, source.name, base, headers);
      if (ok) {
        state[key] = mtime;
        shipped++;
        if (verbose) console.error(`[relay] shipped ${source.name}: ${path.basename(filePath)}`);
      } else {
        errors++;
        if (verbose) console.error(`[relay] failed  ${source.name}: ${path.basename(filePath)}`);
      }
    }
  }

  saveState(agentDir, state);
  return { shipped, skipped, errors };
}

// ─── Watch loop ───────────────────────────────────────────────────────────────

async function runLoop(agentDir, intervalMs = 60_000) {
  console.error(`[relay] started — watching all IDEs, shipping to brain every ${intervalMs / 1000}s`);
  const logFile = path.join(agentDir, 'logs', 'relay.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });

  const log = (msg) => {
    const line = `${new Date().toISOString()} ${msg}\n`;
    process.stderr.write(line);
    try { fs.appendFileSync(logFile, line); } catch {}
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const { shipped, skipped, errors } = await runScan(agentDir, { verbose: false });
      if (shipped > 0 || errors > 0) {
        log(`scan: shipped=${shipped} skipped=${skipped} errors=${errors}`);
      }
    } catch (e) {
      log(`scan error: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ─── Process management ───────────────────────────────────────────────────────

function pidFile(agentDir) {
  return path.join(agentDir, 'logs', 'relay.pid');
}

function readPid(agentDir) {
  const p = pidFile(agentDir);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf8').trim();
  const pid = parseInt(raw, 10);
  return isNaN(pid) ? null : pid;
}

function isRunning(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// ─── launchd / systemd service installation ───────────────────────────────────

function installService(agentDir) {
  const platform = os.platform();
  const nodeBin = process.execPath;
  const scriptPath = path.join(ROOT, 'bin', 'total-recall.mjs');

  if (platform === 'darwin') {
    const plistName = 'com.totalrecall.relay';
    const plistDest = path.join(HOME, 'Library', 'LaunchAgents', `${plistName}.plist`);
    const logOut = path.join(agentDir, 'logs', 'relay.log');
    const logErr = path.join(agentDir, 'logs', 'relay-err.log');

    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>             <string>${plistName}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodeBin}</string>
    <string>${scriptPath}</string>
    <string>relay</string>
    <string>_loop</string>
  </array>
  <key>RunAtLoad</key>         <true/>
  <key>KeepAlive</key>         <true/>
  <key>StandardOutPath</key>   <string>${logOut}</string>
  <key>StandardErrorPath</key> <string>${logErr}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>AGENT_DIR</key><string>${agentDir}</string>
  </dict>
</dict>
</plist>`;

    fs.mkdirSync(path.dirname(plistDest), { recursive: true });
    fs.writeFileSync(plistDest, plist, 'utf8');
    spawnSync('launchctl', ['unload', plistDest], { stdio: 'ignore' });
    const r = spawnSync('launchctl', ['load', plistDest], { stdio: 'inherit' });
    if (r.status === 0) {
      console.log(`  ✅ Relay service installed and started (launchd)`);
      console.log(`     Plist: ${plistDest}`);
      console.log(`     Logs:  ${logOut}`);
    } else {
      console.error('  ⚠️  launchctl load failed — try: launchctl load ' + plistDest);
    }

  } else if (platform === 'linux') {
    const unitName = 'total-recall-relay';
    const unitDest = path.join(HOME, '.config', 'systemd', 'user', `${unitName}.service`);
    const logOut = path.join(agentDir, 'logs', 'relay.log');

    const unit = `[Unit]
Description=Total Recall IDE Session Relay
After=network.target

[Service]
Type=simple
ExecStart=${nodeBin} ${scriptPath} relay _loop
Restart=always
RestartSec=10
StandardOutput=append:${logOut}
StandardError=append:${logOut}
Environment=AGENT_DIR=${agentDir}

[Install]
WantedBy=default.target
`;

    fs.mkdirSync(path.dirname(unitDest), { recursive: true });
    fs.writeFileSync(unitDest, unit, 'utf8');
    spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' });
    const r = spawnSync('systemctl', ['--user', 'enable', '--now', unitName], { stdio: 'inherit' });
    if (r.status === 0) {
      console.log(`  ✅ Relay service installed and started (systemd --user)`);
      console.log(`     Unit: ${unitDest}`);
      console.log(`     Logs: journalctl --user -u ${unitName} -f`);
    } else {
      console.error('  ⚠️  systemctl failed — try: systemctl --user enable --now ' + unitName);
    }

  } else {
    console.error('  ⚠️  Auto-install not supported on this platform. Run manually:');
    console.error(`     ${nodeBin} ${scriptPath} relay _loop`);
  }
}

function uninstallService() {
  const platform = os.platform();
  if (platform === 'darwin') {
    const plistDest = path.join(HOME, 'Library', 'LaunchAgents', 'com.totalrecall.relay.plist');
    if (fs.existsSync(plistDest)) {
      spawnSync('launchctl', ['unload', plistDest], { stdio: 'ignore' });
      fs.unlinkSync(plistDest);
      console.log('  ✅ Relay service removed');
    } else {
      console.log('  No relay service installed');
    }
  } else if (platform === 'linux') {
    const unitName = 'total-recall-relay';
    spawnSync('systemctl', ['--user', 'disable', '--now', unitName], { stdio: 'ignore' });
    const unitDest = path.join(HOME, '.config', 'systemd', 'user', `${unitName}.service`);
    if (fs.existsSync(unitDest)) fs.unlinkSync(unitDest);
    spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' });
    console.log('  ✅ Relay service removed');
  } else {
    console.log('  Nothing to uninstall on this platform');
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(args) {
  const opts = { command: null, help: false };
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') { opts.help = true; break; }
    if (!opts.command) opts.command = arg;
  }
  return opts;
}

function printHelp() {
  console.log(`
  total-recall relay — Local IDE session relay to remote brain

  Usage: npx total-recall relay <command>

  Commands:
    start      Start relay in background (detached process)
    stop       Stop background relay
    status     Show relay status + sources found on this machine
    once       Single scan pass (no loop) — for testing
    install    Install as launchd (macOS) or systemd (Linux) service
    uninstall  Remove the service

  The relay watches:
    Claude Code   ~/.claude/projects/
    Codex         ~/.codex/sessions/
    Antigravity   ~/.gemini/antigravity/brain/
    VS Code       ~/Library/Application Support/Code/User/workspaceStorage/*/chatSessions/
    Cursor        ~/.cursor/projects/

  New/updated session files are shipped to the brain at:
    POST <brain_url>/api/sessions/ingest

  Config: ~/.agent/skills/total-recall/config/brain.json  (written by: npx total-recall connect)
`);
}

export default async function relay(args) {
  const opts = parseArgs(args);
  if (opts.help || !opts.command) { printHelp(); return; }

  const brDir = configBrainDir;
  fs.mkdirSync(path.join(brDir, 'logs'), { recursive: true });

  switch (opts.command) {

    case '_loop': {
      // Internal: run the watch loop (called by launchd/systemd or `start`)
      const pid = process.pid;
      fs.writeFileSync(pidFile(brDir), String(pid), 'utf8');
      process.on('SIGTERM', () => { try { fs.unlinkSync(pidFile(brDir)); } catch {} process.exit(0); });
      process.on('SIGINT',  () => { try { fs.unlinkSync(pidFile(brDir)); } catch {} process.exit(0); });
      await runLoop(brDir);
      break;
    }

    case 'start': {
      const pid = readPid(brDir);
      if (isRunning(pid)) {
        console.log(`  Relay already running (PID ${pid})`);
        break;
      }
      const child = spawn(process.execPath, [
        path.join(ROOT, 'bin', 'total-recall.mjs'), 'relay', '_loop',
      ], {
        detached: true,
        stdio: ['ignore',
          fs.openSync(path.join(brDir, 'logs', 'relay.log'), 'a'),
          fs.openSync(path.join(brDir, 'logs', 'relay-err.log'), 'a'),
        ],
        env: { ...process.env, AGENT_DIR: configAgentDir },
      });
      child.unref();
      fs.writeFileSync(pidFile(brDir), String(child.pid), 'utf8');
      console.log(`  ✅ Relay started (PID ${child.pid})`);
      console.log(`     Log: ${path.join(brDir, 'logs', 'relay.log')}`);
      break;
    }

    case 'stop': {
      const pid = readPid(brDir);
      if (!isRunning(pid)) {
        console.log('  Relay is not running');
        try { fs.unlinkSync(pidFile(brDir)); } catch {}
        break;
      }
      process.kill(pid, 'SIGTERM');
      try { fs.unlinkSync(pidFile(brDir)); } catch {}
      console.log(`  ✅ Relay stopped (PID ${pid})`);
      break;
    }

    case 'status': {
      const pid = readPid(brDir);
      const running = isRunning(pid);
      console.log(`\n  Relay: ${running ? `running (PID ${pid})` : 'stopped'}`);

      const config = loadBrainConfig(brDir);
      if (config) {
        console.log(`  Brain: ${brainUrl(config)}`);
        console.log(`  Auth:  ${config.token ? 'PAT configured' : 'no token'}`);
      } else {
        console.log('  Brain: not configured (run: npx total-recall connect --brain <url> --token <pat>)');
      }

      console.log('\n  Sources on this machine:');
      for (const src of getSources()) {
        const exists = fs.existsSync(src.root);
        const files = exists ? findFiles(src.root, src.filter, src.dirFilter).length : 0;
        console.log(`    ${exists ? '✅' : '○ '} ${src.name.padEnd(14)} ${exists ? `${files} session files` : 'not found'}`);
      }

      const state = loadState(brDir);
      const tracked = Object.keys(state).length;
      if (tracked > 0) {
        const latest = Object.values(state).sort((a, b) => b - a)[0];
        console.log(`\n  Tracked: ${tracked} files, last sync ${new Date(latest).toLocaleString()}`);
      }
      console.log();
      break;
    }

    case 'once': {
      console.log('  Running single scan...');
      const { shipped, skipped, errors } = await runScan(brDir, { verbose: true });
      console.log(`\n  Done: shipped=${shipped} skipped=${skipped} errors=${errors}`);
      break;
    }

    case 'install':   installService(brDir); break;
    case 'uninstall': uninstallService(); break;

    default:
      console.error(`  Unknown command: ${opts.command}`);
      printHelp();
  }
}
