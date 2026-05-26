/**
 * total-recall deploy
 *
 * Provision a target machine with the full Sovereign AI stack:
 *   1. Detect host architecture (aarch64 / x86_64 / arm64)
 *   2. Install Ollama (if not present)
 *   3. Pull Gemma 4 26B model (~16GB)
 *   4. Pull Kokoro-82M voice model (~200MB)
 *   4.5. Install SearXNG (native Python, no Docker) for web search on port 8888
 *   5.5. Install Playwright + computer use deps (xdotool, scrot, xvfb)
 *   5. Scaffold VFS at ~/.agent/
 *   6. Copy default config templates
 *   7. Install Caddy reverse proxy (if not present)
 *   8. Deploy Caddyfile to /etc/caddy/Caddyfile
 *   9. Install systemd units (Linux only)
 *   10. Start services
 *   11. Run initial compile
 *
 * Usage:
 *   npx total-recall deploy [options]
 *
 * Options:
 *   --skip-ollama       Skip Ollama installation
 *   --skip-searxng      Skip SearXNG installation
 *   --skip-models       Skip model pulling
 *   --skip-caddy        Skip Caddy installation
 *   --skip-systemd      Skip systemd unit installation
 *   --skip-compile      Skip initial compile
 *   --domain <domain>   Set domain for Caddyfile (default: localhost)
 *   --duckdns-token <t> DuckDNS API token — installs IP-update cron job
 *   --ui                Open install progress UI in browser (localhost:3001)
 *   --ui-port <port>    Port for the install UI server (default: 3001)
 *   --dry-run           Print what would be done without executing
 *   --help              Show this help
 */

import { execSync, execFileSync, spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { BCRYPT_COST } from '../server/auth.mjs';


const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Robust PATH-Expansion for LaunchAgents & background processes ─────────────
try {
  const HOME = os.homedir();
  const commonPaths = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(HOME, '.local/bin'),
    path.join(HOME, '.nvm/versions/node/v24.12.0/bin'),
    path.join(HOME, '.npm-global/bin'),
    path.join(HOME, 'bin'),
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ];

  const nvmVersionsDir = path.join(HOME, '.nvm', 'versions', 'node');
  if (fs.existsSync(nvmVersionsDir)) {
    const versions = fs.readdirSync(nvmVersionsDir);
    for (const v of versions) {
      commonPaths.unshift(path.join(nvmVersionsDir, v, 'bin'));
    }
  }

  const activePaths = process.env.PATH ? process.env.PATH.split(path.delimiter) : [];
  const uniquePaths = Array.from(new Set([...activePaths, ...commonPaths])).filter(p => fs.existsSync(p));
  process.env.PATH = uniquePaths.join(path.delimiter);
} catch (e) {
  // Silent fallback
}
const ROOT = path.join(__dirname, '..', '..');
const AGENT_DIR = path.join(os.homedir(), '.agent');
const BRAIN_DIR = path.join(AGENT_DIR, 'skills', 'total-recall');

// ─── Helpers ────────────────────────────────────────────────────────────────────

// Deploy UI emitter — set by deploy() if --ui flag is used
let _uiEmit = null;

function log(msg)          { console.error(`  ${msg}`); }
function logStep(step, msg){ console.error(`\n  [${step}] ${msg}`); _uiEmit?.('step', `[${step}] ${msg}`); }
function logOk(msg)        { console.error(`  ✅ ${msg}`); _uiEmit?.('ok', msg); }
function logSkip(msg)      { console.error(`  ⏭  ${msg}`); _uiEmit?.('info', msg); }
function logWarn(msg)      { console.error(`  ⚠️  ${msg}`); _uiEmit?.('warn', msg); }

function commandExists(cmd) {
  if (!cmd || !/^[a-zA-Z0-9_-]+$/.test(cmd)) {
    return false;
  }
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function run(cmd, opts = {}) {
  const result = spawnSync('sh', ['-c', cmd], {
    stdio: opts.silent ? 'pipe' : 'inherit',
    timeout: opts.timeout || 300_000, // 5 min default
    ...opts,
  });
  if (result.status !== 0 && !opts.ignoreErrors) {
    const stderr = result.stderr?.toString().trim() || '';
    throw new Error(`Command failed (exit ${result.status}): ${cmd}\n${stderr}`);
  }
  return result.stdout?.toString().trim() || '';
}

function detectArch() {
  const machine = os.arch(); // 'arm64', 'x64', etc
  const map = { arm64: 'aarch64', x64: 'x86_64', ia32: 'x86' };
  return map[machine] || machine;
}

function detectPlatform() {
  const p = os.platform();
  if (p === 'linux') return 'linux';
  if (p === 'darwin') return 'macos';
  return p;
}

function hasSystemd() {
  if (detectPlatform() !== 'linux') return false;
  if (!commandExists('systemctl')) return false;
  try {
    return fs.existsSync('/run/systemd/system');
  } catch {
    return false;
  }
}

function hasLaunchd() {
  return detectPlatform() === 'macos';
}

function launchAgentsDir() {
  return path.join(os.homedir(), 'Library', 'LaunchAgents');
}

function installPlist(templateName, dryRun) {
  const src = path.join(ROOT, 'templates', templateName);
  const dest = path.join(launchAgentsDir(), templateName);
  let content = fs.readFileSync(src, 'utf8');
  content = content.replace(/__ROOT__/g, ROOT);
  content = content.replace(/__NODE__/g, process.execPath);
  content = content.replace(/__HOME__/g, os.homedir());
  if (dryRun) {
    log(`  Would install ${templateName} → ${dest}`);
  } else {
    fs.mkdirSync(launchAgentsDir(), { recursive: true });
    fs.writeFileSync(dest, content, 'utf8');
    logOk(`Installed ${dest}`);
  }
  return dest;
}

function parseArgs(args) {
  const opts = {
    skipOllama: false,
    skipSearxng: false,
    skipModels: false,
    skipCaddy: false,
    skipSystemd: false,
    skipCompile: false,
    domain: 'localhost',
    duckdnsToken: null,
    brainRepo: null,
    backupRepo: null,
    backupObsidian: null,
    cloudflareToken: null,
    cloudflareQuick: false,
    allowInsecureHttp: false,
    ui: false,
    uiPort: 3001,
    dryRun: false,
    help: false,
    dashboardPassword: null,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--skip-ollama': opts.skipOllama = true; break;
      case '--skip-searxng': opts.skipSearxng = true; break;
      case '--skip-models': opts.skipModels = true; break;
      case '--skip-caddy': opts.skipCaddy = true; break;
      case '--skip-systemd': opts.skipSystemd = true; break;
      case '--skip-compile': opts.skipCompile = true; break;
      case '--domain': opts.domain = args[++i]; break;
      case '--duckdns-token': opts.duckdnsToken = args[++i]; break;
      case '--brain-repo': opts.brainRepo = args[++i]; break;
      case '--backup-repo': opts.backupRepo = args[++i]; break;
      case '--backup-obsidian': opts.backupObsidian = args[++i]; break;
      case '--cloudflare-token': opts.cloudflareToken = args[++i]; break;
      case '--cloudflare-quick': opts.cloudflareQuick = true; break;
      case '--allow-insecure-http': opts.allowInsecureHttp = true; break;
      case '--dashboard-password': opts.dashboardPassword = args[++i]; break;
      case '--ui': opts.ui = true; break;
      case '--ui-port': opts.uiPort = parseInt(args[++i], 10) || 3001; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--help': case '-h': opts.help = true; break;
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
  total-recall deploy — Provision a target machine with the Sovereign AI stack

  Usage: total-recall deploy [options]

  Options:
    --skip-ollama       Skip Ollama installation
    --skip-searxng      Skip SearXNG installation
    --skip-models       Skip model pulling
    --skip-caddy        Skip Caddy installation
    --skip-systemd      Skip systemd unit installation
    --skip-compile      Skip initial compile
    --domain <domain>   Set domain for Caddyfile (default: localhost)
    --duckdns-token <t> DuckDNS API token — installs IP-update cron (*.duckdns.org domains)
    --brain-repo <url>  Git repo URL to clone as the brain vault into ~/.agent/
                        e.g. https://github.com/you/my-brain.git
                        If the vault is inside the project repo (default), omit this.
    --backup-repo <url> Git remote for automatic daily vault backups
                        e.g. git@github.com:you/brain-backup.git
                        Installs a cron job (Linux) or launchd job (macOS) that
                        runs "total-recall backup --push-git <url>" at 2:00 AM.
    --backup-obsidian <path>
                        Obsidian vault path for daily rsync backup.
                        e.g. ~/Documents/Obsidian Vault
                        Installs a daily job (cron/launchd) that rsyncs the
                        memory vault into "<vault>/Total Recall/". Pair with
                        Obsidian Sync or iCloud for off-host backup.
    --allow-insecure-http
                        Permit a local/test deploy without public HTTPS.
    --ui                Open a real-time install progress page in the browser.
                        Served at http://localhost:3001 during the deploy.
    --ui-port <port>    Port for the install UI (default: 3001).
    --dry-run           Print plan without executing
    --help, -h          Show this help

  DuckDNS HTTPS setup:
    1. Sign up at https://www.duckdns.org and claim a subdomain
    2. Point the subdomain at your server IP
    3. Run: npx total-recall deploy --domain yourname.duckdns.org --duckdns-token YOUR_TOKEN
    4. Caddy auto-provisions a Let's Encrypt TLS cert (port 80 must be open)
`);
}

// ─── Scaffold VFS ───────────────────────────────────────────────────────────────

function scaffoldVfs(opts) {
  const dryRun = opts.dryRun;
  logStep('6/12', 'Scaffolding VFS at ~/.agent/');

  const scaffoldSrc = path.join(ROOT, 'scaffold', '.agent');
  if (!fs.existsSync(scaffoldSrc)) {
    throw new Error(`Scaffold source missing: ${scaffoldSrc}`);
  }

  if (fs.existsSync(AGENT_DIR)) {
    logWarn('~/.agent/ already exists — merging missing directories only');
  }

  // Recursively copy scaffold, skipping existing files
  copyDirMerge(scaffoldSrc, AGENT_DIR, dryRun);
  logOk('VFS scaffolded');

  // ── Step 5.5: Pull brain from git repo if specified ──
  // Also check if this project's .agent/skills/total-recall/memory-vault has nodes (in-repo brain)
  const inRepoVault = path.join(ROOT, '.agent', 'skills', 'total-recall', 'memory-vault');
  if (opts.brainRepo) {
    logStep('6.5/12', `Pulling brain vault from ${opts.brainRepo}`);
    if (dryRun) {
      log(`  Would clone ${opts.brainRepo} into ${AGENT_DIR}`);
    } else {
      try {
        if (commandExists('git')) {
          // Clone into a temp dir then merge into AGENT_DIR
          const tmpBrain = path.join(os.tmpdir(), `brain-${Date.now()}`);
          run(`git clone --depth=1 "${opts.brainRepo}" "${tmpBrain}"`);
          copyDirMerge(tmpBrain, AGENT_DIR, false);
          run(`rm -rf "${tmpBrain}"`);
          logOk(`Brain vault restored from ${opts.brainRepo}`);
        } else {
          logWarn('git not found — cannot clone brain repo');
        }
      } catch (err) {
        logWarn(`Brain clone failed: ${err.message}`);
      }
    }
  } else if (fs.existsSync(inRepoVault)) {
    logStep('6.5/12', 'Brain vault found in project repo — copying to ~/.agent/');
    if (!dryRun) copyDirMerge(inRepoVault, path.join(BRAIN_DIR, 'memory-vault'), false);
    logOk('In-repo brain vault merged into ~/.agent/');
  } else {
    logWarn('No brain repo specified and no in-repo vault found — starting with empty brain.');
    log('  Tip: npx total-recall deploy --brain-repo https://github.com/you/my-brain.git');
  }
}

function copyDirMerge(src, dest, dryRun) {
  if (!fs.existsSync(src)) return;

  if (!fs.existsSync(dest)) {
    if (dryRun) { log(`  mkdir ${dest}`); }
    else { fs.mkdirSync(dest, { recursive: true }); }
  }

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirMerge(srcPath, destPath, dryRun);
    } else if (!fs.existsSync(destPath)) {
      if (dryRun) { log(`  copy ${srcPath} → ${destPath}`); }
      else { fs.copyFileSync(srcPath, destPath); }
    }
  }
}

// ─── Copy Default Config ────────────────────────────────────────────────────────

function copyDefaultConfig(dryRun) {
  logStep('7/12', 'Copying default configuration');

  const configSrc = path.join(ROOT, 'templates', 'default-config');
  const configDest = path.join(BRAIN_DIR, 'config');

  if (!fs.existsSync(configSrc)) {
    logWarn(`Default config template directory not found: ${configSrc}`);
    return;
  }

  if (!fs.existsSync(configDest)) {
    if (!dryRun) fs.mkdirSync(configDest, { recursive: true });
  }

  for (const file of fs.readdirSync(configSrc)) {
    const src = path.join(configSrc, file);
    const dest = path.join(configDest, file);
    if (fs.existsSync(dest)) {
      logSkip(`${file} already exists, skipping`);
    } else {
      if (dryRun) { log(`  copy ${src} → ${dest}`); }
      else { fs.copyFileSync(src, dest); }
      logOk(`Installed ${file}`);
    }
  }
}

function isIpAddress(value) {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value || '') || /^\[[0-9a-f:]+\]$/i.test(value || '') || /^[0-9a-f:]{3,}$/i.test(value || '');
}

function hardenSecurityConfig(dryRun, dashboardPassword = null) {
  logStep('7.5/12', 'Hardening security defaults');
  const securityPath = path.join(BRAIN_DIR, 'config', 'security.yml');
  if (dryRun) {
    log(`  Would enforce HTTPS, localhost bind, hashed PATs, and private health checks in ${securityPath}`);
    return;
  }

  let config = {};
  if (fs.existsSync(securityPath)) {
    config = yaml.parse(fs.readFileSync(securityPath, 'utf8')) || {};
  }

  config.api = {
    ...(config.api || {}),
    allow_static_pats: config.api?.allow_static_pats === true,
    pats: (config.api?.allow_static_pats === true)
      ? (config.api?.pats || []).filter((pat) => pat && pat !== 'local')
      : []
  };
  config.bind = {
    ...(config.bind || {}),
    host: '127.0.0.1',
    port: config.bind?.port || 3000,
    allow_public_bind: false
  };
  config.network = {
    ...(config.network || {}),
    require_https: true,
    public_health: false,
    allowed_origins: config.network?.allowed_origins || []
  };

  if (!config.dashboard) {
    config.dashboard = {};
  }

  if (dashboardPassword) {
    const isDefault = dashboardPassword === 'totalrecall';
    log(`  🔑 Enforcing admin dashboard password (force reset: ${isDefault})`);
    config.dashboard.password_hash = bcrypt.hashSync(dashboardPassword, BCRYPT_COST);
    config.dashboard.force_password_reset = isDefault;
  } else if (!config.dashboard.password_hash) {
    log('  🔑 Dashboard credentials left unconfigured. You will set your admin password on first dashboard access.');
  }

  fs.writeFileSync(securityPath, yaml.stringify(config), { encoding: 'utf8', mode: 0o600 });
  logOk('Security config hardened: HTTPS required, Express bound to localhost, no public health, no legacy local PAT');
}

// ─── Main ───────────────────────────────────────────────────────────────────────

export default async function deploy(args) {
  const opts = parseArgs(args);
  if (opts.help) { printHelp(); return; }

  const arch = detectArch();
  const platform = detectPlatform();

  // ── Start optional deploy UI ──
  if (opts.ui) {
    try {
      const { startDeployUI, waitForInstallOptions, emitProgress, openBrowser } = await import('./deploy-ui.mjs');
      const uiUrl = await startDeployUI(opts.uiPort);
      _uiEmit = emitProgress;
      console.error(`\n  ┌─────────────────────────────────────────────┐`);
      console.error(`  │  Install UI: ${uiUrl.padEnd(34)}│`);
      console.error(`  │  Waiting for you to click Install...         │`);
      console.error(`  └─────────────────────────────────────────────┘\n`);
      openBrowser(uiUrl);

      // Block until the wizard's Phase 1 form is submitted
      const wizardOpts = await waitForInstallOptions();

      // Merge wizard config into opts
      if (wizardOpts.domain)          opts.domain          = wizardOpts.domain;
      if (wizardOpts.duckdnsToken)    opts.duckdnsToken    = wizardOpts.duckdnsToken;
      // Cloudflare: both Zero Trust tunnel token and quick-tunnel flag
      if (wizardOpts.httpsMethod === 'cloudflare-tunnel') {
        opts.cloudflareToken = wizardOpts.cloudflareToken;
      } else if (wizardOpts.httpsMethod === 'cloudflare-quick') {
        opts.cloudflareQuick = true;
      } else if (wizardOpts.cloudflareToken) {
        // Token present even without explicit method — treat as Zero Trust
        opts.cloudflareToken = wizardOpts.cloudflareToken;
      }
      if (wizardOpts.httpsMethod === 'local') opts.allowInsecureHttp = true;
      if (wizardOpts.skipSearxng) opts.skipSearxng = true;
      if (wizardOpts.skipCaddy)   opts.skipCaddy   = true;
      if (wizardOpts.skipCompile) opts.skipCompile  = true;
      if (wizardOpts.skipModels)  opts.skipModels   = true;
      if (wizardOpts.dashboardPassword) opts.dashboardPassword = wizardOpts.dashboardPassword;
      if (wizardOpts.installGlobal !== undefined) opts.installGlobal = wizardOpts.installGlobal;
      if (wizardOpts.projectPaths) opts.projectPaths = wizardOpts.projectPaths;

      console.error(`  ✅ Wizard config received — domain: ${opts.domain}`);

      if (wizardOpts.deployTarget === 'vastai' || wizardOpts.skipLocalInstall) {
        console.error(`\n  ✅ Vast.ai remote instance provisioned. Remote installation runs in background.`);
        console.error(`  📍 SSH access: ssh -p ${wizardOpts.vastSshPort} root@${wizardOpts.vastSshHost}\n`);
        return;
      }

      if (wizardOpts.deployTarget === 'localnet') {
        const ip = wizardOpts.localnetHost;
        const user = wizardOpts.localnetUser || 'root';
        logStep('1/3', `Connecting to remote host ${user}@${ip}...`);

        const check = spawnSync('ssh', [
          '-o', 'StrictHostKeyChecking=accept-new',
          '-o', 'ConnectTimeout=20',
          `${user}@${ip}`,
          'echo "OK"'
        ], { encoding: 'utf8' });

        if (check.status !== 0) {
          logWarn(`Failed to connect to ${user}@${ip} via SSH.`);
          throw new Error(`Failed to connect to ${user}@${ip} via SSH. Please ensure SSH / Remote Login is enabled on that computer and your SSH key is authorized.`);
        }
        logOk(`Connected to ${user}@${ip}`);

        logStep('2/3', 'Installing Node.js and dependencies on remote host...');
        const cmdPrefix = 'export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"; export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh";';
        spawnSync('ssh', [
          '-o', 'StrictHostKeyChecking=accept-new',
          `${user}@${ip}`,
          `${cmdPrefix} which node || (curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh -o nvm_install.sh && bash nvm_install.sh && rm nvm_install.sh && export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm install 20)`
        ], { stdio: 'inherit' });

        // Copy API Keys/secrets.enc to remote VM
        try {
          log('🔒 Persisting Google/OpenAI credentials on remote host...');
          const configDir = `~/.agent/skills/total-recall/config`;
          const secretsContent = JSON.stringify({
            google_api_key: wizardOpts.googleApiKey || '',
            openai_api_key: wizardOpts.openaiApiKey || ''
          });
          spawnSync('ssh', [
            '-o', 'StrictHostKeyChecking=accept-new',
            `${user}@${ip}`,
            `mkdir -p ${configDir} && echo '${secretsContent}' > ${configDir}/secrets.enc && chmod 600 ${configDir}/secrets.enc`
          ]);
          logOk('Credentials written remotely.');
        } catch (err) {
          logWarn(`Could not save credentials remotely: ${err.message}`);
        }

        logStep('3/3', 'Deploying Total Recall remotely...');
        let deployCmd = `npx --yes total-recall deploy --domain ${wizardOpts.domain || 'localhost'}`;
        if (wizardOpts.dashboardPassword) {
          deployCmd += ` --dashboard-password "${wizardOpts.dashboardPassword}"`;
        }
        if (wizardOpts.httpsMethod === 'cloudflare-quick') {
          deployCmd += ` --cloudflare-quick`;
        }
        spawnSync('ssh', [
          '-o', 'StrictHostKeyChecking=accept-new',
          `${user}@${ip}`,
          `${cmdPrefix} ${deployCmd}`
        ], { stdio: 'inherit' });

        logStep('Done', 'Generating access token & discovering endpoints...');
        const pat = spawnSync('ssh', [
          '-o', 'StrictHostKeyChecking=accept-new',
          `${user}@${ip}`,
          `${cmdPrefix} npx total-recall generate-pat --quiet`
        ], { encoding: 'utf8' }).stdout?.toString().trim();

        let publicUrl = `http://${ip}:3000`;
        if (wizardOpts.httpsMethod === 'cloudflare-quick') {
          log('  Fetching remote Cloudflare Quick Tunnel URL...');
          // Let's poll remote cloudflared log file via SSH to extract the URL
          for (let attempt = 1; attempt <= 12; attempt++) {
            const urlOut = spawnSync('ssh', [
              '-o', 'StrictHostKeyChecking=accept-new',
              `${user}@${ip}`,
              `${cmdPrefix} grep -oE "https://[a-zA-Z0-9-]+\\.trycloudflare\\.com" ~/.agent/skills/total-recall/logs/cloudflared.log 2>/dev/null | tail -n 1`
            ], { encoding: 'utf8' }).stdout?.toString().trim();
            if (urlOut && urlOut.startsWith('https://')) {
              publicUrl = urlOut;
              logOk(`Remote Quick Tunnel URL discovered: ${publicUrl}`);
              break;
            }
            log(`  Waiting for remote quick tunnel to boot (attempt ${attempt}/6)...`);
            spawnSync('sleep', ['2']);
          }
        }

        logOk(`Remote setup complete! Brain is running.`);
        if (pat) {
          logOk(`Access token generated successfully.`);
        }

        const { finishDeployUI: finishUI } = await import('./deploy-ui.mjs');
        finishUI({
          apiUrl: publicUrl,
          dashUrl: `${publicUrl}/dashboard`,
          healthUrl: `${publicUrl}/health`
        });

        return;
      }

      if (wizardOpts.deployTarget === 'agent-cloud') {
        const rawProvider = (wizardOpts.cloudProvider || '').toLowerCase().trim();
        const token = wizardOpts.cloudToken;
        const rawRegion = (wizardOpts.cloudRegion || '').toLowerCase().trim();

        logStep('1/6', 'Spawning local CLI provisioning agent...');

        let provider = 'digitalocean';
        if (rawProvider.includes('hetzner') || rawProvider === 'hcloud') {
          provider = 'hetzner';
        } else if (rawProvider.includes('linode') || rawProvider.includes('akamai')) {
          provider = 'linode';
        } else if (rawProvider.includes('vultr')) {
          provider = 'vultr';
        } else if (rawProvider.includes('digital') || rawProvider === 'do') {
          provider = 'digitalocean';
        } else {
          // Unrecognized — perform dynamic detection or fallbacks
          logWarn(`Unrecognized provider "${wizardOpts.cloudProvider}". Attempting token-based detection...`);
          if (token.startsWith('dop_v1_')) {
            provider = 'digitalocean';
            log('🔎 Token matches DigitalOcean pattern.');
          } else if (token.length === 64 && /^[0-9a-fA-F]+$/.test(token)) {
            provider = 'hetzner';
            log('🔎 Token matches Hetzner Cloud pattern.');
          } else if (token.length === 64) {
            provider = 'linode';
            log('🔎 Token looks like a Linode Personal Access Token.');
          } else {
            provider = 'digitalocean';
            log('🔎 Defaulting to DigitalOcean provisioning.');
          }
        }

        logStep('2/6', 'Checking / generating secure SSH key pair...');
        const sshDir = path.join(os.homedir(), '.ssh');
        let privateKeyPath = path.join(sshDir, 'id_total_recall');
        let publicKeyPath = path.join(sshDir, 'id_total_recall.pub');

        if (!fs.existsSync(sshDir)) {
          fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
        }

        if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
          log('🔑 Generating Ed25519 SSH key pair at ~/.ssh/id_total_recall...');
          const gen = spawnSync('ssh-keygen', ['-t', 'ed25519', '-f', privateKeyPath, '-N', ''], { encoding: 'utf8' });
          if (gen.status !== 0) {
            logWarn('Failed to generate Ed25519 key, falling back to RSA...');
            privateKeyPath = path.join(sshDir, 'id_rsa');
            publicKeyPath = path.join(sshDir, 'id_rsa.pub');
            if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
              spawnSync('ssh-keygen', ['-t', 'rsa', '-b', '4096', '-f', privateKeyPath, '-N', ''], { encoding: 'utf8' });
            }
          }
        }

        const publicKeyContent = fs.readFileSync(publicKeyPath, 'utf8').trim();
        logOk('SSH key pair ready');

        logStep('3/6', `Uploading SSH key and provisioning VPS instance on ${provider === 'digitalocean' ? 'DigitalOcean' : provider === 'hetzner' ? 'Hetzner' : provider === 'linode' ? 'Linode' : 'Vultr'}...`);

        let ip = null;
        if (provider === 'digitalocean') {
          log('☁️ Checking for existing SSH key on DigitalOcean...');
          const listRes = await fetch('https://api.digitalocean.com/v2/account/keys', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!listRes.ok) {
            throw new Error(`DigitalOcean API access failed (status ${listRes.status}): ${await listRes.text()}`);
          }
          const keysData = await listRes.json();
          let sshKeyId = (keysData.ssh_keys || []).find(k => k.public_key.trim() === publicKeyContent.trim())?.id;

          if (!sshKeyId) {
            log('☁️ Uploading public SSH key to DigitalOcean...');
            const regRes = await fetch('https://api.digitalocean.com/v2/account/keys', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ name: `Total Recall Key (${os.hostname()})`, public_key: publicKeyContent })
            });
            if (!regRes.ok) {
              throw new Error(`Failed to upload SSH key to DigitalOcean: ${await regRes.text()}`);
            }
            const regData = await regRes.json();
            sshKeyId = regData.ssh_key.id;
          }
          logOk(`SSH key registered (ID: ${sshKeyId})`);

          log('☁️ Creating Droplet (Ubuntu 24.04, $6/mo shared-CPU) on DigitalOcean...');
          const createRes = await fetch('https://api.digitalocean.com/v2/droplets', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: 'total-recall-brain',
              region: rawRegion || 'nyc3',
              size: 's-1vcpu-1gb',
              image: 'ubuntu-24-04-x64',
              ssh_keys: [ sshKeyId ],
              backups: false,
              ipv6: false
            })
          });
          if (!createRes.ok) {
            throw new Error(`Failed to create DigitalOcean droplet: ${await createRes.text()}`);
          }
          const createData = await createRes.json();
          const dropletId = createData.droplet.id;
          logOk(`Droplet created successfully (ID: ${dropletId})`);

          logStep('4/6', 'Waiting for droplet to boot and allocate public IP...');
          for (let attempt = 1; attempt <= 40; attempt++) {
            await new Promise(r => setTimeout(r, 6000));
            const statusRes = await fetch(`https://api.digitalocean.com/v2/droplets/${dropletId}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              const droplet = statusData.droplet;
              const state = droplet.status;
              log(`⏳ Droplet status: ${state}...`);
              if (state === 'active') {
                const ipv4 = droplet.networks.v4.find(net => net.type === 'public')?.ip_address;
                if (ipv4) {
                  ip = ipv4;
                  logOk(`Droplet public IP allocated: ${ip}`);
                  break;
                }
              }
            }
          }
        } else if (provider === 'hetzner') {
          log('☁️ Checking for existing SSH key on Hetzner Cloud...');
          const listRes = await fetch('https://api.hetzner.cloud/v1/ssh_keys', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!listRes.ok) {
            throw new Error(`Hetzner Cloud API access failed (status ${listRes.status}): ${await listRes.text()}`);
          }
          const keysData = await listRes.json();
          let sshKeyId = (keysData.ssh_keys || []).find(k => k.public_key.trim() === publicKeyContent.trim())?.id;

          if (!sshKeyId) {
            log('☁️ Uploading public SSH key to Hetzner Cloud...');
            const regRes = await fetch('https://api.hetzner.cloud/v1/ssh_keys', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ name: `Total Recall Key (${os.hostname()})`, public_key: publicKeyContent })
            });
            if (!regRes.ok) {
              throw new Error(`Failed to upload SSH key to Hetzner: ${await regRes.text()}`);
            }
            const regData = await regRes.json();
            sshKeyId = regData.ssh_key.id;
          }
          logOk(`SSH key registered (ID: ${sshKeyId})`);

          log('☁️ Creating Server (Ubuntu 24.04, low-cost cx22) on Hetzner...');
          const createRes = await fetch('https://api.hetzner.cloud/v1/servers', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: 'total-recall-brain',
              server_type: 'cx22',
              image: 'ubuntu-24.04',
              location: rawRegion || 'nbg1',
              ssh_keys: [ sshKeyId ],
              start_after_create: true
            })
          });
          if (!createRes.ok) {
            throw new Error(`Failed to create Hetzner server: ${await createRes.text()}`);
          }
          const createData = await createRes.json();
          const serverId = createData.server.id;
          logOk(`Server created successfully (ID: ${serverId})`);

          logStep('4/6', 'Waiting for server to boot and allocate public IP...');
          for (let attempt = 1; attempt <= 40; attempt++) {
            await new Promise(r => setTimeout(r, 6000));
            const statusRes = await fetch(`https://api.hetzner.cloud/v1/servers/${serverId}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              const server = statusData.server;
              const state = server.status;
              log(`⏳ Server status: ${state}...`);
              if (state === 'running') {
                const ipv4 = server.public_net?.ipv4?.ip;
                if (ipv4) {
                  ip = ipv4;
                  logOk(`Server public IP allocated: ${ip}`);
                  break;
                }
              }
            }
          }
        } else if (provider === 'linode') {
          log('☁️ Checking for existing SSH key on Linode...');
          const listRes = await fetch('https://api.linode.com/v4/profile/sshkeys', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!listRes.ok) {
            throw new Error(`Linode API access failed (status ${listRes.status}): ${await listRes.text()}`);
          }
          const keysData = await listRes.json();
          let sshKeyRegistered = (keysData.data || []).some(k => k.ssh_key.trim() === publicKeyContent.trim());

          if (!sshKeyRegistered) {
            log('☁️ Uploading public SSH key to Linode...');
            const regRes = await fetch('https://api.linode.com/v4/profile/sshkeys', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ label: `Total Recall Key (${os.hostname()})`, ssh_key: publicKeyContent })
            });
            if (!regRes.ok) {
              throw new Error(`Failed to upload SSH key to Linode: ${await regRes.text()}`);
            }
          }
          logOk('SSH key ready on Linode');

          log('☁️ Creating Linode VPS (Ubuntu 24.04, low-cost Nanode) on Akamai/Linode...');
          const createRes = await fetch('https://api.linode.com/v4/linode/instances', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              type: 'g6-nanode-1',
              region: rawRegion || 'us-east',
              image: 'linode/ubuntu24.04',
              authorized_keys: [ publicKeyContent ],
              booted: true
            })
          });
          if (!createRes.ok) {
            throw new Error(`Failed to create Linode instance: ${await createRes.text()}`);
          }
          const createData = await createRes.json();
          const linodeId = createData.id;
          logOk(`Linode instance created successfully (ID: ${linodeId})`);

          logStep('4/6', 'Waiting for Linode to boot and allocate public IP...');
          for (let attempt = 1; attempt <= 40; attempt++) {
            await new Promise(r => setTimeout(r, 6000));
            const statusRes = await fetch(`https://api.linode.com/v4/linode/instances/${linodeId}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (statusRes.ok) {
              const linode = await statusRes.json();
              const state = linode.status;
              log(`⏳ Linode status: ${state}...`);
              if (state === 'running') {
                const ipv4 = linode.ipv4?.[0];
                if (ipv4) {
                  ip = ipv4;
                  logOk(`Linode public IP allocated: ${ip}`);
                  break;
                }
              }
            }
          }
        } else if (provider === 'vultr') {
          log('☁️ Checking for existing SSH key on Vultr...');
          const listRes = await fetch('https://api.vultr.com/v2/ssh-keys', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!listRes.ok) {
            throw new Error(`Vultr API access failed (status ${listRes.status}): ${await listRes.text()}`);
          }
          const keysData = await listRes.json();
          let sshKeyId = (keysData.ssh_keys || []).find(k => k.ssh_key.trim() === publicKeyContent.trim())?.id;

          if (!sshKeyId) {
            log('☁️ Uploading public SSH key to Vultr...');
            const regRes = await fetch('https://api.vultr.com/v2/ssh-keys', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ name: `Total Recall Key (${os.hostname()})`, ssh_key: publicKeyContent })
            });
            if (!regRes.ok) {
              throw new Error(`Failed to upload SSH key to Vultr: ${await regRes.text()}`);
            }
            const regData = await regRes.json();
            sshKeyId = regData.ssh_key.id;
          }
          logOk(`SSH key registered on Vultr (ID: ${sshKeyId})`);

          log('☁️ Creating Instance (Ubuntu 24.04, low-cost vc2-1c-1gb) on Vultr...');
          const createRes = await fetch('https://api.vultr.com/v2/instances', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              region: rawRegion || 'ewr',
              plan: 'vc2-1c-1gb',
              os_id: 2284,
              sshkey_ids: [ sshKeyId ],
              enable_ipv6: false
            })
          });
          if (!createRes.ok) {
            throw new Error(`Failed to create Vultr instance: ${await createRes.text()}`);
          }
          const createData = await createRes.json();
          const instanceId = createData.instance.id;
          logOk(`Vultr instance created successfully (ID: ${instanceId})`);

          logStep('4/6', 'Waiting for server to boot and allocate public IP...');
          for (let attempt = 1; attempt <= 40; attempt++) {
            await new Promise(r => setTimeout(r, 6000));
            const statusRes = await fetch(`https://api.vultr.com/v2/instances/${instanceId}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              const inst = statusData.instance;
              const state = inst.status;
              log(`⏳ Vultr status: ${state}...`);
              if (state === 'active') {
                const ipv4 = inst.main_ip;
                if (ipv4 && ipv4 !== '0.0.0.0') {
                  ip = ipv4;
                  logOk(`Vultr public IP allocated: ${ip}`);
                  break;
                }
              }
            }
          }
        }

        if (!ip) {
          throw new Error('Timeout waiting for public IP allocation from cloud provider.');
        }

        logStep('5/6', 'SSH Bootstrapping & deploying Total Recall remotely...');
        log('⏳ Waiting for remote SSH port 22 to become reachable...');

        const sshArgs = [
          '-i', privateKeyPath,
          '-o', 'StrictHostKeyChecking=accept-new',
          '-o', 'ConnectTimeout=8',
          `root@${ip}`
        ];

        let sshConnected = false;
        for (let attempt = 1; attempt <= 30; attempt++) {
          const check = spawnSync('ssh', [...sshArgs, 'echo "OK"'], { encoding: 'utf8', timeout: 8000 });
          if (check.status === 0 && check.stdout?.trim() === 'OK') {
            sshConnected = true;
            break;
          }
          log(`⏳ Waiting for SSH service to start (attempt ${attempt}/30)...`);
          await new Promise(r => setTimeout(r, 5000));
        }

        if (!sshConnected) {
          throw new Error(`Failed to establish SSH connection to root@${ip} after 2.5 minutes.`);
        }
        logOk('SSH connection established successfully');

        log('🛠️ Installing Node.js & system dependencies on remote host...');
        const installResult = spawnSync('ssh', [
          ...sshArgs,
          'apt-get update && apt-get install -y -qq curl git sudo && ' +
          'curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh -o nvm_install.sh && bash nvm_install.sh && rm nvm_install.sh && ' +
          'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh" && nvm install 20 2>/dev/null'
        ], { stdio: 'inherit' });

        if (installResult.status !== 0) {
          throw new Error('Failed to install Node.js / nvm on remote VM.');
        }
        logOk('Node.js and nvm installed remotely');

        // Copy API Keys/secrets.enc to remote VM
        try {
          log('🔒 Persisting Google/OpenAI credentials on remote host...');
          const configDir = `~/.agent/skills/total-recall/config`;
          const secretsContent = JSON.stringify({
            google_api_key: wizardOpts.googleApiKey || '',
            openai_api_key: wizardOpts.openaiApiKey || ''
          });
          spawnSync('ssh', [
            ...sshArgs,
            `mkdir -p ${configDir} && echo '${secretsContent}' > ${configDir}/secrets.enc && chmod 600 ${configDir}/secrets.enc`
          ]);
          logOk('Credentials written remotely.');
        } catch (err) {
          logWarn(`Could not save credentials remotely: ${err.message}`);
        }

        log('🧠 Running Total Recall deploy remotely...');
        let deployCmd = `npx --yes total-recall deploy --domain ${wizardOpts.domain || 'localhost'}`;
        if (wizardOpts.dashboardPassword) {
          deployCmd += ` --dashboard-password "${wizardOpts.dashboardPassword}"`;
        }
        deployCmd += ` --cloudflare-quick`;

        const remoteDeployResult = spawnSync('ssh', [
          ...sshArgs,
          `export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh" && ${deployCmd}`
        ], { stdio: 'inherit' });

        if (remoteDeployResult.status !== 0) {
          throw new Error('Remote Total Recall deployment failed.');
        }

        logStep('6/6', 'Activating Cloudflare Quick Tunnel and secure HTTPS links...');

        let pat = spawnSync('ssh', [
          ...sshArgs,
          'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh" && npx total-recall generate-pat --quiet'
        ], { encoding: 'utf8' }).stdout?.toString().trim();

        let publicUrl = `http://${ip}:3000`;
        log('⏳ Fetching remote Cloudflare Quick Tunnel URL...');

        for (let attempt = 1; attempt <= 12; attempt++) {
          const urlOut = spawnSync('ssh', [
            ...sshArgs,
            'grep -oE "https://[a-zA-Z0-9-]+\\.trycloudflare\\.com" ~/.agent/skills/total-recall/logs/cloudflared.log 2>/dev/null | tail -n 1'
          ], { encoding: 'utf8' }).stdout?.toString().trim();
          if (urlOut && urlOut.startsWith('https://')) {
            publicUrl = urlOut;
            logOk(`Remote Quick Tunnel URL discovered: ${publicUrl}`);
            break;
          }
          log(`  Waiting for remote quick tunnel to boot (attempt ${attempt}/12)...`);
          await new Promise(r => setTimeout(r, 4000));
        }

        logOk(`Cloud VM provisioning and deployment complete!`);
        if (pat) {
          logOk(`Access token generated successfully.`);
        }

        // Persist to local wizard-config.json
        try {
          const configDir = path.join(_brainDir(), 'config');
          const configFile = path.join(configDir, 'wizard-config.json');
          fs.mkdirSync(configDir, { recursive: true });
          let current = {};
          if (fs.existsSync(configFile)) {
            try { current = JSON.parse(fs.readFileSync(configFile, 'utf8') || '{}'); } catch {}
          }
          current.deployTarget = 'agent-cloud';
          current['cfg-domain'] = publicUrl.replace('https://', '');
          current['cfg-api-url'] = publicUrl;
          current['cfg-dash-url'] = `${publicUrl}/dashboard`;
          current['cfg-health-url'] = `${publicUrl}/health`;
          if (wizardOpts.dashboardPassword) {
            current['cfg-dashboard-password'] = wizardOpts.dashboardPassword;
          }
          fs.writeFileSync(configFile, JSON.stringify(current, null, 2), { encoding: 'utf8', mode: 0o600 });
        } catch (e) {
          console.error('Failed to auto-persist cloud install options on disk:', e);
        }

        const { finishDeployUI: finishUI } = await import('./deploy-ui.mjs');
        finishUI({
          apiUrl: publicUrl,
          dashUrl: `${publicUrl}/dashboard`,
          healthUrl: `${publicUrl}/health`
        });

        return;
      }
    } catch (e) {
      console.error(`  ⚠️  Deployment failed: ${e.message}`);
      if (_uiEmit) {
        _uiEmit('error', e.message);
      }
      return;
    }
  }

  const bannerWidth = 49;
  const contentWidth = bannerWidth - 4; // account for "│  " and " │"
  const fmtLine = (label, value) => {
    const content = `${label}${value}`;
    return `  │  ${content.padEnd(contentWidth)}│`;
  };
  console.error(`
  ┌${'─'.repeat(bannerWidth)}┐
${fmtLine('Total Recall Deploy', '')}
${fmtLine('Architecture: ', arch)}
${fmtLine('Platform:     ', platform)}
${fmtLine('Target VFS:   ', '~/.agent/')}
  └${'─'.repeat(bannerWidth)}┘
`);

  if (opts.dryRun) logWarn('DRY RUN — no changes will be made\n');

  if (!opts.allowInsecureHttp && !opts.cloudflareToken && !opts.cloudflareQuick) {
    if (opts.skipCaddy) {
      throw new Error('Refusing insecure deploy: Caddy/Cloudflare is required unless --allow-insecure-http is set.');
    }
    if (opts.domain === 'localhost' || isIpAddress(opts.domain)) {
      throw new Error('Refusing insecure deploy: provide a real DNS domain for HTTPS, use Cloudflare tunnel, or pass --allow-insecure-http for local testing.');
    }
  }

  // ── Step 1: Detect architecture ──
  logStep('1/12', `Architecture detected: ${arch} (${platform})`);

  // ── Step 2: Install Ollama (DEPRECATED) ──
  logStep('2/12', 'Ollama installation (Deprecated)');
  logSkip('Skipped: Local GPU-heavy LLM model hosting via Ollama is fully deprecated in Total Recall.');

  // ── Step 3: Pull Gemma 4 model (DEPRECATED) ──
  logStep('3/12', 'Pulling Gemma 4 26B model (Deprecated)');
  logSkip('Skipped: Cognitive processing has transitioned exclusively to specialized, headlessly dispatched CLI agents.');

  // ── Step 4: Kokoro voice model (DEPRECATED) ──
  logStep('4/12', 'Kokoro-82M voice model (Deprecated)');
  logSkip('Skipped: Local text-to-speech rendering is deprecated.');

  // ── Step 4.5: Install SearXNG (native Python, no Docker required) ──
  logStep('5/12', 'Deploying SearXNG');
  if (opts.skipSearxng) {
    logSkip('Skipped (--skip-searxng)');
  } else if (opts.dryRun) {
    log('  Would install SearXNG via pip and start on port 8888');
  } else {
    try {
      const searxngDir = '/opt/searxng';
      const venvPython = `${searxngDir}/venv/bin/python`;
      const venvPip    = `${searxngDir}/venv/bin/pip`;

      if (!commandExists('python3')) {
        run('apt-get install -y python3 python3-pip python3-venv');
      }

      if (!fs.existsSync(searxngDir)) {
        log('  Cloning SearXNG...');
        run(`git clone https://github.com/searxng/searxng.git ${searxngDir}`);
      } else {
        log('  SearXNG already cloned, pulling latest...');
        run(`git -C ${searxngDir} pull --ff-only`, { ignoreErrors: true });
      }

      // Create venv + install
      if (!fs.existsSync(venvPython)) {
        log('  Creating virtualenv...');
        run(`python3 -m venv ${searxngDir}/venv`);
      }
      log('  Installing SearXNG dependencies...');
      run(`${venvPip} install --quiet -e '${searxngDir}[test]'`);

      // Write minimal settings.yml
      const settingsDir = '/etc/searxng';
      fs.mkdirSync(settingsDir, { recursive: true });
      const settingsPath = `${settingsDir}/settings.yml`;
      if (!fs.existsSync(settingsPath)) {
        fs.writeFileSync(settingsPath, [
          'use_default_settings: true',
          'server:',
          '  bind_address: "127.0.0.1"',
          '  port: 8888',
          '  secret_key: "' + crypto.randomBytes(32).toString('hex') + '"',
          '  base_url: "http://127.0.0.1:8888/"',
          'search:',
          '  formats: [html, json]',
        ].join('\n'));
      }

      // Write systemd unit (Linux) or start directly
      if (detectPlatform() === 'linux' && !opts.skipSystemd) {
        const unit = [
          '[Unit]',
          'Description=SearXNG (Total Recall web search)',
          'After=network.target',
          '',
          '[Service]',
          'Type=simple',
          `ExecStart=${venvPython} -m searx.webapp`,
          'Environment=SEARXNG_SETTINGS_PATH=/etc/searxng/settings.yml',
          'Restart=on-failure',
          'RestartSec=5',
          '',
          '[Install]',
          'WantedBy=multi-user.target',
        ].join('\n');
        fs.writeFileSync('/etc/systemd/system/searxng.service', unit);
        run('systemctl daemon-reload', { ignoreErrors: true });
        run('systemctl enable --now searxng', { ignoreErrors: true });
        logOk('SearXNG systemd service installed and started');
      } else {
        // No systemd (container/macOS) — start via nohup
        run(
          `SEARXNG_SETTINGS_PATH=/etc/searxng/settings.yml ` +
          `nohup ${venvPython} -m searx.webapp > /var/log/searxng.log 2>&1 &`,
          { ignoreErrors: true }
        );
        logOk('SearXNG started on port 8888 (nohup)');
      }
    } catch (e) {
      logWarn(`SearXNG install failed: ${e.message}`);
      logWarn('Web search will be unavailable. Re-run deploy to retry.');
    }
  }

  // ── Step 5.5: Install Playwright + Computer Use deps ──
  logStep('5.5/12', 'Installing Playwright + computer use dependencies');
  if (opts.dryRun) {
    log('  Would install: playwright chromium, xdotool, scrot, xvfb');
  } else {
    try {
      // Install Node.js Playwright package
      log('  Installing playwright npm package...');
      run(`cd "${ROOT}" && npm install --no-save playwright`, { timeout: 120_000, ignoreErrors: true });

      // Install Chromium browser via playwright
      log('  Installing Chromium via playwright...');
      run(`cd "${ROOT}" && npx playwright install chromium`, { timeout: 300_000, ignoreErrors: true });

      // Install X11 / desktop control tools (Linux only)
      if (platform === 'linux') {
        log('  Installing xdotool, scrot, xvfb...');
        run('apt-get install -y -qq xdotool scrot xvfb', { ignoreErrors: true });
        logOk('Computer use deps installed (Playwright + xdotool + scrot + xvfb)');
      } else if (platform === 'macos') {
        if (commandExists('brew')) {
          run('brew install xdotool', { ignoreErrors: true });
        }
        logOk('Playwright installed (macOS computer use uses system accessibility APIs)');
      } else {
        logOk('Playwright installed');
      }
    } catch (e) {
      logWarn(`Playwright/computer use install failed: ${e.message}`);
      logWarn('Browser + computer use tools may be unavailable. Re-run deploy to retry.');
    }
  }

  // ── Step 6: Scaffold VFS ──
  scaffoldVfs(opts);

  // ── Step 7: Copy default config ──
  copyDefaultConfig(opts.dryRun);
  hardenSecurityConfig(opts.dryRun, opts.dashboardPassword);

  // ── Step 7: Install Reverse Proxy / Tunnel ──
  if (opts.cloudflareToken || opts.cloudflareQuick) {
    logStep('8/12', 'Cloudflare Zero Trust Tunnel installation');
    let cloudflaredBin = 'cloudflared';
    if (commandExists('cloudflared')) {
      logOk('cloudflared already installed');
    } else {
      const localBin = path.join(BRAIN_DIR, 'bin', 'cloudflared');
      if (fs.existsSync(localBin)) {
        cloudflaredBin = localBin;
        logOk(`cloudflared found in VFS: ${localBin}`);
      } else if (opts.dryRun) {
        log('  Would install cloudflared and route traffic via Zero Trust');
      } else {
        if (platform === 'linux') {
          run('curl -L -s --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb');
          run('sudo dpkg -i cloudflared.deb > /dev/null');
          run('rm cloudflared.deb');
          logOk('cloudflared binary installed');
        } else if (platform === 'macos') {
          try {
            log('  Installing cloudflared via Homebrew...');
            run('brew install cloudflare/cloudflare/cloudflared');
          } catch (brewErr) {
            logWarn(`Homebrew install failed: ${brewErr.message}`);
            log('  Downloading standalone cloudflared binary as fallback...');
            run(`mkdir -p ${BRAIN_DIR}/bin`);
            const cloudflaredArch = (arch === 'aarch64' || arch === 'arm64' || os.arch() === 'arm64') ? 'arm64' : 'amd64';
            run(`curl -L -s https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${cloudflaredArch}.tgz -o ${BRAIN_DIR}/bin/cloudflared.tgz`);
            run(`tar -xzf ${BRAIN_DIR}/bin/cloudflared.tgz -C ${BRAIN_DIR}/bin/`);
            run(`chmod +x ${localBin}`);
            run(`rm ${BRAIN_DIR}/bin/cloudflared.tgz`);
            cloudflaredBin = localBin;
            logOk(`Standalone cloudflared binary (${cloudflaredArch}) downloaded and configured!`);
          }
        }
      }
    }

    if (!opts.dryRun) {
      if (opts.cloudflareToken && platform === 'linux') {
        spawnSync('sudo', ['cloudflared', 'service', 'install', opts.cloudflareToken], { stdio: 'inherit' });
        logOk('Cloudflare tunnel running securely via token');
      } else if (opts.cloudflareQuick) {
        log('  Starting Zero-Config Quick Tunnel (trycloudflare.com)...');
        run(`mkdir -p ${BRAIN_DIR}/logs`);
        run(`nohup ${cloudflaredBin} tunnel --url http://localhost:3000 > ${BRAIN_DIR}/logs/cloudflared.log 2>&1 &`);
        run('sleep 4');
        try {
          const url = run(`grep -o "https://.*\\.trycloudflare\\.com" ${BRAIN_DIR}/logs/cloudflared.log | head -1`);
          logOk(`Quick Tunnel Active: ${url}`);
        } catch (e) {
          logWarn(`Could not extract Quick Tunnel URL. Check ${BRAIN_DIR}/logs/cloudflared.log`);
        }
      }
    }
    opts.skipCaddy = true; // Tunnel replaces Caddy
  } else {
    logStep('8/12', 'Caddy reverse proxy installation');
    if (opts.skipCaddy) {
      logSkip('Skipped (--skip-caddy)');
    } else if (commandExists('caddy')) {
      logOk('Caddy already installed');
    } else {
      if (opts.dryRun) {
        log('  Would install Caddy for the target platform');
      } else {
        if (platform === 'linux') {
          run('sudo apt-get update -qq && sudo apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl', { ignoreErrors: true });
          run('curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" -o /tmp/caddy.gpg.key && sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg /tmp/caddy.gpg.key && rm /tmp/caddy.gpg.key', { ignoreErrors: true });
          run('curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" | sudo tee /etc/apt/sources.list.d/caddy-stable.list', { ignoreErrors: true });
          run('sudo apt-get update -qq && sudo apt-get install -y caddy');
        } else if (platform === 'macos') {
          if (commandExists('brew')) {
            run('brew install caddy');
          } else {
            logWarn('Homebrew not found — install Caddy manually: https://caddyserver.com/docs/install');
          }
        }
        logOk('Caddy installed');
      }
    }
  }

  // ── Step 8: Deploy Caddyfile ──
  logStep('9/12', 'Deploying Caddyfile');
  if (opts.skipCaddy) {
    logSkip('Skipped (--skip-caddy)');
  } else {
    const caddyfileSrc = path.join(ROOT, 'templates', 'Caddyfile');
    let caddyContent = fs.readFileSync(caddyfileSrc, 'utf8');
    caddyContent = caddyContent.replace(/YOUR_DOMAIN/g, opts.domain);

    if (platform === 'linux') {
      const caddyDest = '/etc/caddy/Caddyfile';
      if (opts.dryRun) {
        log(`  Would write Caddyfile to ${caddyDest} (domain: ${opts.domain})`);
      } else {
        const tmpCaddy = path.join(os.tmpdir(), 'Caddyfile.total-recall');
        fs.writeFileSync(tmpCaddy, caddyContent);
        run(`sudo cp ${tmpCaddy} ${caddyDest}`);
        fs.unlinkSync(tmpCaddy);
        logOk(`Caddyfile deployed to ${caddyDest} (domain: ${opts.domain})`);
      }
    } else {
      // macOS / other — write to ~/.agent/config/Caddyfile
      const caddyDest = path.join(BRAIN_DIR, 'config', 'Caddyfile');
      if (opts.dryRun) {
        log(`  Would write Caddyfile to ${caddyDest} (domain: ${opts.domain})`);
      } else {
        fs.writeFileSync(caddyDest, caddyContent);
        logOk(`Caddyfile written to ${caddyDest} (domain: ${opts.domain})`);
        log('  Run Caddy manually: caddy run --config ~/.agent/skills/total-recall/config/Caddyfile');
      }
    }
  }

  // ── Step 8.5: DuckDNS IP-update job ──
  if (opts.duckdnsToken && opts.domain.endsWith('.duckdns.org')) {
    logStep('9.5/12', 'Installing DuckDNS IP-update job');
    const subdomain = opts.domain.replace('.duckdns.org', '');

    // Immediately update DNS record on both platforms
    if (!opts.dryRun) {
      try {
        const tmpLog = path.join(os.tmpdir(), 'duckdns-update.log');
        run(`curl -s "https://www.duckdns.org/update?domains=${subdomain}&token=${opts.duckdnsToken}&ip=" -o "${tmpLog}"`);
        const result = fs.readFileSync(tmpLog, 'utf8').trim();
        if (result === 'OK') {
          logOk(`DuckDNS record updated for ${opts.domain}`);
        } else {
          logWarn(`DuckDNS update response: ${result} — check your token`);
        }
      } catch (e) {
        logWarn(`DuckDNS update failed: ${e.message}`);
      }
    }

    if (platform === 'linux') {
      const cronLine = `*/5 * * * * root curl -s "https://www.duckdns.org/update?domains=${subdomain}&token=${opts.duckdnsToken}&ip=" -o /var/log/duckdns.log`;
      const cronFile = '/etc/cron.d/total-recall-duckdns';
      if (opts.dryRun) {
        log(`  Would write cron job to ${cronFile}`);
      } else {
        fs.writeFileSync('/tmp/total-recall-duckdns', cronLine + '\n');
        run('sudo cp /tmp/total-recall-duckdns ' + cronFile);
        run('sudo chmod 644 ' + cronFile);
        logOk(`DuckDNS cron installed at ${cronFile} (updates every 5 minutes)`);
      }
    } else if (platform === 'macos') {
      const plistName = 'com.totalrecall.duckdns.plist';
      const src = path.join(ROOT, 'templates', plistName);
      const dest = path.join(launchAgentsDir(), plistName);
      if (opts.dryRun) {
        log(`  Would install launchd interval job → ${dest}`);
      } else {
        let content = fs.readFileSync(src, 'utf8');
        content = content.replace(/__SUBDOMAIN__/g, subdomain);
        content = content.replace(/__TOKEN__/g, opts.duckdnsToken);
        content = content.replace(/__HOME__/g, os.homedir());
        fs.mkdirSync(launchAgentsDir(), { recursive: true });
        fs.writeFileSync(dest, content, 'utf8');
        run(`launchctl load -w "${dest}"`, { ignoreErrors: true });
        logOk(`DuckDNS launchd job installed at ${dest} (updates every 5 minutes)`);
      }
    }
  }

  // ── Step 9.6: Automatic backup job ──
  if (opts.backupRepo) {
    logStep('9.6/12', `Installing automatic daily backup → ${opts.backupRepo}`);

    if (platform === 'linux') {
      const cronLine = `0 2 * * * root ${process.execPath} ${path.join(ROOT, 'bin', 'total-recall.mjs')} backup --push-git ${opts.backupRepo}`;
      const cronFile = '/etc/cron.d/total-recall-backup';
      if (opts.dryRun) {
        log(`  Would write daily backup cron to ${cronFile}`);
      } else {
        fs.writeFileSync('/tmp/total-recall-backup', cronLine + '\n');
        run('sudo cp /tmp/total-recall-backup ' + cronFile);
        run('sudo chmod 644 ' + cronFile);
        logOk(`Backup cron installed at ${cronFile} (runs daily at 2:00 AM)`);
        log(`  Remote: ${opts.backupRepo}`);
        log(`  Restore: npx total-recall deploy --brain-repo ${opts.backupRepo}`);
      }
    } else if (platform === 'macos') {
      const plistName = 'com.totalrecall.backup.plist';
      const src = path.join(ROOT, 'templates', plistName);
      const dest = path.join(launchAgentsDir(), plistName);
      if (opts.dryRun) {
        log(`  Would install launchd daily backup job → ${dest}`);
      } else {
        let content = fs.readFileSync(src, 'utf8');
        content = content.replace(/__ROOT__/g, ROOT);
        content = content.replace(/__NODE__/g, process.execPath);
        content = content.replace(/__HOME__/g, os.homedir());
        content = content.replace(/__BACKUP_REPO__/g, opts.backupRepo);
        fs.mkdirSync(launchAgentsDir(), { recursive: true });
        fs.writeFileSync(dest, content, 'utf8');
        run(`launchctl load -w "${dest}"`, { ignoreErrors: true });
        logOk(`Backup launchd job installed at ${dest} (runs daily at 2:00 AM)`);
        log(`  Remote: ${opts.backupRepo}`);
        log(`  Restore: npx total-recall deploy --brain-repo ${opts.backupRepo}`);
      }
    } else {
      logWarn(`Auto-backup scheduling not supported on ${platform} — run manually:`);
      log(`  npx total-recall backup --push-git ${opts.backupRepo}`);
    }
  }

  // ── Step 9.7: Obsidian backup job ──
  if (opts.backupObsidian) {
    const obsidianPath = opts.backupObsidian.startsWith('~')
      ? path.join(os.homedir(), opts.backupObsidian.slice(1))
      : opts.backupObsidian;
    logStep('9.7/12', `Installing daily Obsidian rsync backup → ${obsidianPath}`);

    const backupCmd = `${process.execPath} ${path.join(ROOT, 'bin', 'total-recall.mjs')} backup --obsidian "${obsidianPath}"`;

    if (platform === 'linux') {
      const cronLine = `0 3 * * * root ${backupCmd}`;
      const cronFile = '/etc/cron.d/total-recall-obsidian-backup';
      if (opts.dryRun) {
        log(`  Would write Obsidian backup cron to ${cronFile}`);
      } else {
        fs.writeFileSync('/tmp/total-recall-obsidian-backup', cronLine + '\n');
        run('sudo cp /tmp/total-recall-obsidian-backup ' + cronFile);
        run('sudo chmod 644 ' + cronFile);
        logOk(`Obsidian backup cron installed at ${cronFile} (runs daily at 3:00 AM)`);
      }
    } else if (platform === 'macos') {
      // Inline plist for Obsidian rsync — no separate template needed
      const plistName = 'com.totalrecall.obsidian-backup.plist';
      const dest = path.join(launchAgentsDir(), plistName);
      if (opts.dryRun) {
        log(`  Would install launchd Obsidian backup job → ${dest}`);
      } else {
        const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.totalrecall.obsidian-backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${path.join(ROOT, 'bin', 'total-recall.mjs')}</string>
    <string>backup</string>
    <string>--obsidian</string>
    <string>${obsidianPath}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>3</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${os.homedir()}</string>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${os.homedir()}/.agent/skills/total-recall/logs/obsidian-backup.log</string>
  <key>StandardErrorPath</key>
  <string>${os.homedir()}/.agent/skills/total-recall/logs/obsidian-backup.log</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>`;
        fs.mkdirSync(launchAgentsDir(), { recursive: true });
        fs.writeFileSync(dest, plistContent, 'utf8');
        run(`launchctl load -w "${dest}"`, { ignoreErrors: true });
        logOk(`Obsidian backup launchd job installed at ${dest} (runs daily at 3:00 AM)`);
        log(`  Vault: ${obsidianPath}/Total Recall/`);
      }
    } else {
      logWarn(`Obsidian backup scheduling not supported on ${platform} — run manually:`);
      log(`  npx total-recall backup --obsidian "${obsidianPath}"`);
    }
  }

  logStep('10/12', `Installing service units (${platform})`);
  if (opts.skipSystemd) {
    logSkip('Skipped (--skip-systemd)');
  } else if (hasSystemd()) {
    const user = os.userInfo().username;
    const units = ['total-recall-server.service', 'total-recall-daemon.service'];

    for (const unit of units) {
      const srcUnit = path.join(ROOT, 'templates', unit);
      let content = fs.readFileSync(srcUnit, 'utf8');
      content = content.replace(/%i/g, user);
      content = content.replace(/\/opt\/total-recall/g, ROOT);
      content = content.replace(/\/usr\/bin\/node/g, process.execPath);

      const dest = `/etc/systemd/system/${unit}`;
      if (opts.dryRun) {
        log(`  Would install ${unit} → ${dest}`);
      } else {
        const tmpUnit = path.join(os.tmpdir(), unit);
        fs.writeFileSync(tmpUnit, content);
        run(`sudo cp ${tmpUnit} ${dest}`);
        fs.unlinkSync(tmpUnit);
        logOk(`Installed ${unit}`);
      }
    }

    if (!opts.dryRun) {
      run('sudo systemctl daemon-reload');
      logOk('systemd daemon reloaded');
    }
  } else if (hasLaunchd()) {
    const plists = ['com.totalrecall.server.plist', 'com.totalrecall.daemon.plist'];
    for (const plist of plists) {
      installPlist(plist, opts.dryRun);
    }
  } else {
    logWarn(`No systemd or launchd on ${platform} — skipping service install`);
    log('  Use "total-recall daemon start" for manual process management');
  }

  // ── Step 10: Start services ──
  logStep('11/12', 'Starting services');
  if (hasSystemd() && !opts.skipSystemd) {
    if (opts.dryRun) {
      log('  Would enable and start total-recall-server + total-recall-daemon');
    } else {
      run('sudo systemctl enable --now total-recall-server', { ignoreErrors: true });
      run('sudo systemctl enable --now total-recall-daemon', { ignoreErrors: true });
      if (commandExists('caddy')) {
        run('sudo systemctl enable --now caddy', { ignoreErrors: true });
      }
      logOk('Services started');
    }
  } else if (hasLaunchd() && !opts.skipSystemd) {
    if (opts.dryRun) {
      log('  Would launchctl load com.totalrecall.server + com.totalrecall.daemon');
    } else {
      const agentsDir = launchAgentsDir();
      run(`launchctl load -w "${path.join(agentsDir, 'com.totalrecall.server.plist')}"`, { ignoreErrors: true });
      run(`launchctl load -w "${path.join(agentsDir, 'com.totalrecall.daemon.plist')}"`, { ignoreErrors: true });
      logOk('LaunchAgent services loaded (auto-start on login)');
    }
  } else if (platform === 'linux') {
    if (opts.dryRun) {
      log('  Would fall back to nohup starting server and cognitive daemon in background');
    } else {
      logStep('11/12 (fallback)', 'Starting server and daemon in background via nohup (no systemd)');
      try {
        fs.mkdirSync(path.join(BRAIN_DIR, 'logs'), { recursive: true });
        const serverLog = path.join(BRAIN_DIR, 'logs', 'server.log');
        const daemonLog = path.join(BRAIN_DIR, 'logs', 'daemon.log');
        const serverScript = path.join(ROOT, 'bin', 'total-recall.mjs');
        const daemonScript = path.join(ROOT, 'src', 'core', 'daemon-loop.mjs');

        const serverOut = fs.openSync(serverLog, 'a');
        const daemonOut = fs.openSync(daemonLog, 'a');

        const serverProc = spawn('node', [serverScript, 'start', '--port', '3000', '--host', '127.0.0.1'], {
          detached: true,
          stdio: ['ignore', serverOut, serverOut]
        });
        serverProc.unref();

        const daemonProc = spawn('node', [daemonScript], {
          detached: true,
          stdio: ['ignore', daemonOut, daemonOut]
        });
        daemonProc.unref();

        logOk('Server and daemon-loop started in background (safe spawn fallback)');
      } catch (err) {
        logWarn(`Background startup fallback failed: ${err.message}`);
      }
    }
  } else {
    logWarn('Services not auto-started');
    log('  Start manually:');
    log('    node src/server/index.mjs         # HTTP server');
    log('    total-recall daemon start          # Background daemon');
  }

  // ── Step 11: Initial compile + cron setup ──
  logStep('12/12', 'Running initial compile + installing agent cron');
  if (opts.skipCompile) {
    logSkip('Skipped (--skip-compile)');
  } else {
    if (opts.dryRun) {
      log('  Would compile vault surface (INSTRUCTIONS.md)');
      log('  Would install agent scheduler cron via scripts/setup-cron.sh');
    } else {
      try {
        // Compile vault surface directly (compile.mjs no longer exists — SSSS migration)
        const { compileSurface } = await import('../core/surface.mjs');
        await compileSurface({
          vaultDir: path.join(BRAIN_DIR, 'memory-vault'),
          skillsDir: path.join(AGENT_DIR, 'skills'),
          derivedDir: path.join(BRAIN_DIR, 'memory-derived'),
          instructionsFile: path.join(AGENT_DIR, 'INSTRUCTIONS.md'),
        });
        logOk('Initial compile complete');
      } catch (err) {
        logWarn(`Compile failed: ${err.message}`);
      }
      // Install the agent scheduler cron
      try {
        const setupCron = path.join(ROOT, 'scripts', 'setup-cron.sh');
        if (fs.existsSync(setupCron)) {
          run(`bash "${setupCron}"`, { silent: true });
          logOk('Agent scheduler cron installed (fires every 5 minutes)');
        } else {
          logWarn('scripts/setup-cron.sh not found — cron not installed');
        }
      } catch (err) {
        logWarn(`Cron setup failed: ${err.message}`);
      }

      // Globally link total-recall package so the CLI is immediately available
      try {
        log('Registering total-recall CLI command globally...');
        run('npm link', { cwd: ROOT, silent: true });
        logOk('total-recall CLI registered globally! Run "total-recall" anywhere in your terminal.');
      } catch (err) {
        logWarn(`Could not link CLI globally: ${err.message}`);
      }
    }
  }

  // ── Step 12.5: Provision selected project brains ──
  if (opts.projectPaths && opts.projectPaths.length > 0) {
    logStep('12.5/12', `Provisioning ${opts.projectPaths.length} project brain(s)...`);
    const initMjs = path.join(ROOT, 'bin', 'total-recall.mjs');
    for (const projPath of opts.projectPaths) {
      if (!fs.existsSync(projPath)) {
        logWarn(`Skipping ${projPath} — directory does not exist`);
        continue;
      }
      const projBrainDir = path.join(projPath, '.agent', 'skills', 'total-recall');
      if (fs.existsSync(path.join(projBrainDir, 'memory-vault'))) {
        logSkip(`${path.basename(projPath)} (brain already exists)`);
        continue;
      }
      try {
        log(`  📂 Initializing project brain in ${projPath}...`);
        const r = spawnSync(process.execPath, [initMjs, 'init', '--project'], {
          cwd: projPath,
          encoding: 'utf8',
          timeout: 30000,
          env: { ...process.env, FORCE_COLOR: '0' }
        });
        if (r.status === 0) {
          logOk(`${path.basename(projPath)} — project brain provisioned`);
        } else {
          logWarn(`${path.basename(projPath)} — init failed: ${(r.stderr || '').slice(0, 120)}`);
        }
      } catch (err) {
        logWarn(`${path.basename(projPath)} — init error: ${err.message}`);
      }
    }
  }

  // ── Done ──
  const apiUrl    = `https://${opts.domain}/v1/chat/completions`;
  const dashUrl   = `https://${opts.domain}/`;
  const healthUrl = `https://${opts.domain}/health`;

  console.error(`
  ┌─────────────────────────────────────────────────┐
  │  ✅ Deploy complete!                             │
  │                                                  │
  │  VFS:        ~/.agent/                           │
  │  Config:     ~/.agent/config/                    │
  │  API:        ${apiUrl.padEnd(35)}│
  │  Memory:     https://${opts.domain}/api/memory         │
  │  Dashboard:  ${dashUrl.padEnd(35)}│
  │  Cron:       Every 5 min — agent processes queue │
  │  Backup:     Daily 2 AM — git push to backup repo│
  │                                                  │
  │  Next steps:                                     │
  │    npx total-recall daemon status                │
  └─────────────────────────────────────────────────┘
`);

  // Signal the deploy UI (if running) that install is done
  if (opts.ui && _uiEmit) {
    try {
      const { finishDeployUI } = await import('./deploy-ui.mjs');
      finishDeployUI({ apiUrl, dashUrl, healthUrl });
      // Give the browser time to receive the done event before exiting
      await new Promise(r => setTimeout(r, 4500));
    } catch {}
  }
}
