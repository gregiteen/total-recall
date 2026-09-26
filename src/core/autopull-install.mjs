/**
 * Install the auto-pull timer on a host that serves a brain from a git checkout.
 *
 * The daemon's package auto-update only reaches npm installs in registered
 * projects; it deliberately skips source checkouts. A brain running from a
 * checkout therefore never updated unless someone pulled and restarted it by
 * hand, and the one host with a timer (a droplet cron) pointed at a script that
 * could not restart anything. This installs scripts/auto-pull.sh — the repo's
 * own copy, so the updater updates itself — on a 5-minute timer:
 *   - macOS: a LaunchAgent (com.totalrecall.autopull) with StartInterval;
 *   - Linux: a crontab line, replacing any earlier auto-pull line.
 *
 * Nothing here names a machine or a repository: paths come from where this
 * package is running, ports from flags, the environment or the brain's own
 * LaunchAgent.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const AUTOPULL_LABEL = 'com.totalrecall.autopull';
export const AUTOPULL_INTERVAL_SECONDS = 300;

/** The checkout this CLI runs from (…/src/core → repo root). */
export function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** LaunchAgent that runs the checkout's auto-pull.sh every `interval` seconds. */
export function buildLaunchAgentPlist({ script, env = {}, logFile, interval = AUTOPULL_INTERVAL_SECONDS, label = AUTOPULL_LABEL }) {
  const envEntries = Object.entries(env)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `\t\t<key>${xmlEscape(k)}</key>\n\t\t<string>${xmlEscape(v)}</string>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t<string>${xmlEscape(label)}</string>
\t<key>ProgramArguments</key>
\t<array>
\t\t<string>/bin/bash</string>
\t\t<string>${xmlEscape(script)}</string>
\t</array>
\t<key>EnvironmentVariables</key>
\t<dict>
${envEntries}
\t</dict>
\t<key>StartInterval</key>
\t<integer>${Number(interval)}</integer>
\t<key>RunAtLoad</key>
\t<true/>
\t<key>StandardOutPath</key>
\t<string>${xmlEscape(logFile)}</string>
\t<key>StandardErrorPath</key>
\t<string>${xmlEscape(logFile)}</string>
</dict>
</plist>
`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/** The crontab line that runs auto-pull.sh every 5 minutes. */
export function buildCronLine({ script, env = {} }) {
  const assignments = Object.entries(env)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${shellQuote(v)}`)
    .join(' ');
  return `*/5 * * * * ${assignments ? `${assignments} ` : ''}/bin/bash ${shellQuote(script)} >/dev/null 2>&1`;
}

/** Replace every earlier auto-pull line with `line`; keep everything else. */
export function mergeCrontab(existing, line) {
  const kept = String(existing || '')
    .split('\n')
    .filter((l) => l.trim() && !/auto-pull\.sh/.test(l));
  return `${[...kept, line].join('\n')}\n`;
}

/**
 * The port the brain from `repoDir` serves: the PORT of the LaunchAgent that
 * runs it (macOS), else null.
 */
export function detectLaunchAgentPort(repoDir, { home = os.homedir(), readPlist = readPlistValue } = {}) {
  const dir = path.join(home, 'Library', 'LaunchAgents');
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.plist') || entry === `${AUTOPULL_LABEL}.plist`) continue;
    const file = path.join(dir, entry);
    const cwd = readPlist(file, 'WorkingDirectory');
    const args = readPlist(file, 'ProgramArguments') || '';
    if (cwd !== repoDir && !args.includes(`${repoDir}/`)) continue;
    const port = readPlist(file, 'EnvironmentVariables:PORT');
    if (port && /^\d+$/.test(port.trim())) return Number(port.trim());
  }
  return null;
}

function readPlistValue(file, key) {
  try {
    return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Install (or refresh) the timer. Returns what it did; `dryRun` returns the
 * plan without writing.
 */
export function installAutoPull({
  repoDir = packageRoot(),
  port,
  noBuild = false,
  platform = process.platform,
  home = os.homedir(),
  dryRun = false,
} = {}) {
  const script = path.join(repoDir, 'scripts', 'auto-pull.sh');
  if (!fs.existsSync(path.join(repoDir, '.git'))) {
    throw new Error(`${repoDir} is not a git checkout; npm installs update through the daemon (total-recall update --apply).`);
  }
  if (!fs.existsSync(script)) throw new Error(`Missing ${script}`);

  const resolvedPort =
    port || Number(process.env.TR_PORT) || (platform === 'darwin' ? detectLaunchAgentPort(repoDir, { home }) : null) || 3000;
  const env = {
    TR_REPO_DIR: repoDir,
    TR_PORT: String(resolvedPort),
    TR_AUTOPULL_NO_BUILD: noBuild ? '1' : undefined,
  };
  const logDir = path.join(home, '.agent', 'logs');

  if (platform === 'darwin') {
    const plistPath = path.join(home, 'Library', 'LaunchAgents', `${AUTOPULL_LABEL}.plist`);
    const plist = buildLaunchAgentPlist({
      script,
      env: { ...env, HOME: home, PATH: process.env.PATH },
      logFile: path.join(logDir, 'auto-pull.launchd.log'),
    });
    if (dryRun) return { platform, plistPath, plist, port: resolvedPort };
    fs.mkdirSync(logDir, { recursive: true });
    fs.mkdirSync(path.dirname(plistPath), { recursive: true });
    fs.writeFileSync(plistPath, plist, { mode: 0o644 });
    const domain = `gui/${process.getuid()}`;
    spawnSync('launchctl', ['bootout', `${domain}/${AUTOPULL_LABEL}`], { stdio: 'ignore' });
    const boot = spawnSync('launchctl', ['bootstrap', domain, plistPath], { encoding: 'utf8' });
    if (boot.status !== 0) throw new Error(`launchctl bootstrap failed: ${(boot.stderr || '').trim()}`);
    return { platform, plistPath, port: resolvedPort, installed: true };
  }

  const line = buildCronLine({ script, env });
  const current = spawnSync('crontab', ['-l'], { encoding: 'utf8' });
  const merged = mergeCrontab(current.status === 0 ? current.stdout : '', line);
  if (dryRun) return { platform, cronLine: line, crontab: merged, port: resolvedPort };
  const write = spawnSync('crontab', ['-'], { input: merged, encoding: 'utf8' });
  if (write.status !== 0) throw new Error(`crontab write failed: ${(write.stderr || '').trim()}`);
  return { platform, cronLine: line, port: resolvedPort, installed: true };
}
