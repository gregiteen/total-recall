/**
 * total-recall deploy
 *
 * Provision a target machine with the full Sovereign AI stack:
 *   1. Detect host architecture (aarch64 / x86_64 / arm64)
 *   2. Install Ollama (if not present)
 *   3. Pull Gemma 4 26B model (~16GB)
 *   4. Pull Kokoro-82M voice model (~200MB)
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
 *   --skip-searxng      Skip SearXNG Docker installation
 *   --skip-models       Skip model pulling
 *   --skip-caddy        Skip Caddy installation
 *   --skip-systemd      Skip systemd unit installation
 *   --skip-compile      Skip initial compile
 *   --domain <domain>   Set domain for Caddyfile (default: localhost)
 *   --duckdns-token <t> DuckDNS API token — installs IP-update cron job
 *   --dry-run           Print what would be done without executing
 *   --help              Show this help
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const AGENT_DIR = path.join(os.homedir(), '.agent');

// ─── Helpers ────────────────────────────────────────────────────────────────────

function log(msg) { console.error(`  ${msg}`); }
function logStep(step, msg) { console.error(`\n  [${step}] ${msg}`); }
function logOk(msg) { console.error(`  ✅ ${msg}`); }
function logSkip(msg) { console.error(`  ⏭  ${msg}`); }
function logWarn(msg) { console.error(`  ⚠️  ${msg}`); }

function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
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
  return commandExists('systemctl');
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
    cloudflareToken: null,
    dryRun: false,
    help: false,
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
      case '--cloudflare-token': opts.cloudflareToken = args[++i]; break;
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
    --skip-searxng      Skip SearXNG Docker installation
    --skip-models       Skip model pulling
    --skip-caddy        Skip Caddy installation
    --skip-systemd      Skip systemd unit installation
    --skip-compile      Skip initial compile
    --domain <domain>   Set domain for Caddyfile (default: localhost)
    --duckdns-token <t> DuckDNS API token — installs IP-update cron (*.duckdns.org domains)
    --brain-repo <url>  Git repo URL to clone as the brain vault into ~/.agent/
                        e.g. https://github.com/you/my-brain.git
                        If the vault is inside the project repo (default), omit this.
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

function scaffoldVfs(dryRun) {
  logStep('5/11', 'Scaffolding VFS at ~/.agent/');

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
  // Also check if this project's .agent/memory-vault has nodes (in-repo brain)
  const inRepoVault = path.join(ROOT, '.agent', 'memory-vault');
  if (opts?.brainRepo) {
    logStep('5.5/11', `Pulling brain vault from ${opts.brainRepo}`);
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
    logStep('5.5/11', 'Brain vault found in project repo — copying to ~/.agent/');
    if (!dryRun) copyDirMerge(inRepoVault, path.join(AGENT_DIR, 'memory-vault'), false);
    logOk('In-repo brain vault merged into ~/.agent/');
  } else {
    logWarn('No brain repo specified and no in-repo vault found — starting with empty brain.');
    log('  Tip: npx total-recall deploy --brain-repo https://github.com/you/my-brain.git');
  }
}

function copyDirMerge(src, dest, dryRun) {
  if (!fs.existsSync(src)) return;

  if (!fs.existsSync(dest)) {
    if (dryRun) { log(`  mkdir ${dest}`); return; }
    fs.mkdirSync(dest, { recursive: true });
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
  logStep('6/11', 'Copying default configuration');

  const configSrc = path.join(ROOT, 'templates', 'default-config');
  const configDest = path.join(AGENT_DIR, 'config');

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

// ─── Main ───────────────────────────────────────────────────────────────────────

export default async function deploy(args) {
  const opts = parseArgs(args);
  if (opts.help) { printHelp(); return; }

  const arch = detectArch();
  const platform = detectPlatform();

  console.error(`
  ┌─────────────────────────────────────────────────┐
  │  Total Recall Deploy                             │
  │  Architecture: ${arch.padEnd(40)}│
  │  Platform:     ${platform.padEnd(40)}│
  │  Target VFS:   ~/.agent/                         │
  └─────────────────────────────────────────────────┘
`);

  if (opts.dryRun) logWarn('DRY RUN — no changes will be made\n');

  // ── Step 1: Detect architecture ──
  logStep('1/11', `Architecture detected: ${arch} (${platform})`);

  // ── Step 2: Install Ollama ──
  logStep('2/11', 'Ollama installation');
  if (opts.skipOllama) {
    logSkip('Skipped (--skip-ollama)');
  } else if (commandExists('ollama')) {
    logOk('Ollama already installed');
  } else {
    if (opts.dryRun) {
      log('  Would install Ollama via curl -fsSL https://ollama.com/install.sh | sh');
    } else {
      log('Installing Ollama...');
      run('curl -fsSL https://ollama.com/install.sh | sh');
      logOk('Ollama installed');
    }
  }

  // ── Step 3: Pull Gemma 4 model ──
  logStep('3/11', 'Pulling Gemma 4 26B model');
  if (opts.skipModels) {
    logSkip('Skipped (--skip-models)');
  } else if (!commandExists('ollama')) {
    logWarn('Ollama not found — cannot pull models');
  } else {
    if (opts.dryRun) {
      log('  Would run: ollama pull gemma4:26b');
    } else {
      log('  Running: ollama pull gemma4:26b (this will take a while...)');
      run('ollama pull gemma4:26b', { timeout: 3600_000 }); // 1hr timeout
      logOk('Gemma 4 model pulled');
    }
  }

  // ── Step 4: Pull Kokoro voice model ──
  logStep('4/12', 'Pulling Kokoro-82M voice model');
  if (opts.skipModels) {
    logSkip('Skipped (--skip-models)');
  } else if (!commandExists('ollama')) {
    logWarn('Ollama not found — cannot pull models');
  } else {
    if (opts.dryRun) {
      log('  Would run: ollama pull kokoro:82m');
    } else {
      try {
        run('ollama pull kokoro:82m', { timeout: 600_000, ignoreErrors: true }); // 10min timeout
        logOk('Kokoro-82M model pulled (or skipped if unavailable)');
      } catch (e) {
        logWarn('Failed to pull Kokoro-82M model (may not be in registry)');
      }
    }
  }

  // ── Step 4.5: Install SearXNG ──
  logStep('5/12', 'Deploying SearXNG (Docker)');
  if (opts.skipSearxng) {
    logSkip('Skipped (--skip-searxng)');
  } else {
    if (!commandExists('docker')) {
      if (opts.dryRun) {
        log('  Would install Docker');
      } else {
        log('  Installing Docker...');
        run('curl -fsSL https://get.docker.com | sh');
        logOk('Docker installed');
      }
    }
    
    if (opts.dryRun) {
      log('  Would run: docker run -d -p 8888:8080 searxng/searxng');
    } else {
      try {
        const isRunning = run('docker ps -q -f name=total-recall-searxng', { ignoreErrors: true });
        if (isRunning) {
          logOk('SearXNG container already running');
        } else {
          log('  Starting SearXNG container on port 8888...');
          run('docker rm -f total-recall-searxng', { ignoreErrors: true });
          run('docker run -d --name total-recall-searxng -p 8888:8080 -e "SEARXNG_BASE_URL=http://127.0.0.1:8888/" -e "INSTANCE_NAME=total-recall" searxng/searxng', { ignoreErrors: true });
          logOk('SearXNG container started');
        }
      } catch (e) {
        logWarn('Failed to start SearXNG container: ' + e.message);
      }
    }
  }

  // ── Step 5: Scaffold VFS ──
  scaffoldVfs(opts.dryRun);

  // ── Step 6: Copy default config ──
  copyDefaultConfig(opts.dryRun);

  // ── Step 7: Install Reverse Proxy / Tunnel ──
  if (opts.cloudflareToken) {
    logStep('7/11', 'Cloudflare Zero Trust Tunnel installation');
    if (commandExists('cloudflared')) {
      logOk('cloudflared already installed');
    } else {
      if (opts.dryRun) {
        log('  Would install cloudflared and route traffic via Zero Trust');
      } else {
        if (platform === 'linux') {
          run('curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb');
          run('sudo dpkg -i cloudflared.deb');
          run('rm cloudflared.deb');
          run(`sudo cloudflared service install ${opts.cloudflareToken}`);
          logOk('Cloudflare tunnel installed and running securely');
        } else if (platform === 'macos') {
          run('brew install cloudflare/cloudflare/cloudflared');
          logWarn(`Run this manually: sudo cloudflared service install ${opts.cloudflareToken}`);
        }
      }
    }
    opts.skipCaddy = true; // Tunnel replaces Caddy
  } else {
    logStep('7/11', 'Caddy reverse proxy installation');
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
          run('curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg', { ignoreErrors: true });
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
  logStep('8/11', 'Deploying Caddyfile');
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
      const caddyDest = path.join(AGENT_DIR, 'config', 'Caddyfile');
      if (opts.dryRun) {
        log(`  Would write Caddyfile to ${caddyDest} (domain: ${opts.domain})`);
      } else {
        fs.writeFileSync(caddyDest, caddyContent);
        logOk(`Caddyfile written to ${caddyDest} (domain: ${opts.domain})`);
        log('  Run Caddy manually: caddy run --config ~/.agent/config/Caddyfile');
      }
    }
  }

  // ── Step 8.5: DuckDNS IP-update cron job ──
  if (opts.duckdnsToken && opts.domain.endsWith('.duckdns.org')) {
    logStep('8.5/11', 'Installing DuckDNS IP-update cron job');
    const subdomain = opts.domain.replace('.duckdns.org', '');
    const cronLine = `*/5 * * * * root curl -s "https://www.duckdns.org/update?domains=${subdomain}&token=${opts.duckdnsToken}&ip=" -o /var/log/duckdns.log`;
    const cronFile = '/etc/cron.d/total-recall-duckdns';
    if (opts.dryRun) {
      log(`  Would write cron job to ${cronFile}`);
      log(`  Cron: ${cronLine}`);
    } else if (platform === 'linux') {
      // Immediately update DNS record
      try {
        run(`curl -s "https://www.duckdns.org/update?domains=${subdomain}&token=${opts.duckdnsToken}&ip=" -o /tmp/duckdns-update.log`);
        const result = fs.readFileSync('/tmp/duckdns-update.log', 'utf8').trim();
        if (result === 'OK') {
          logOk(`DuckDNS record updated for ${opts.domain}`);
        } else {
          logWarn(`DuckDNS update response: ${result} — check your token`);
        }
      } catch (e) {
        logWarn(`DuckDNS update failed: ${e.message}`);
      }
      // Install cron job for ongoing updates
      fs.writeFileSync('/tmp/total-recall-duckdns', cronLine + '\n');
      run('sudo cp /tmp/total-recall-duckdns ' + cronFile);
      run('sudo chmod 644 ' + cronFile);
      logOk(`DuckDNS cron installed at ${cronFile} (updates every 5 minutes)`);
    } else {
      logWarn('DuckDNS cron install only supported on Linux — run curl manually or use a launchd plist on macOS');
    }
  }

  logStep('9/11', 'Installing systemd units');
  if (opts.skipSystemd || !hasSystemd()) {
    if (!hasSystemd() && !opts.skipSystemd) {
      logWarn(`systemd not available on ${platform} — skipping`);
      log('  Use "total-recall daemon start" for process management instead');
    } else {
      logSkip('Skipped (--skip-systemd)');
    }
  } else {
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
  }

  // ── Step 10: Start services ──
  logStep('10/11', 'Starting services');
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
  } else {
    logWarn('No systemd — services not auto-started');
    log('  Start manually:');
    log('    node src/server/index.mjs         # HTTP server');
    log('    total-recall daemon start          # Background daemon');
  }

  // ── Step 11: Initial compile + cron setup ──
  logStep('11/11', 'Running initial compile + installing agent cron');
  if (opts.skipCompile) {
    logSkip('Skipped (--skip-compile)');
  } else {
    if (opts.dryRun) {
      log('  Would compile vault surface (INSTRUCTIONS.md)');
      log('  Would install agent scheduler cron via scripts/setup-cron.sh');
    } else {
      try {
        // Compile vault surface directly (compile.mjs no longer exists — SSSS migration)
        const path = await import('node:path');
        const osm = await import('node:os');
        const { compileSurface } = await import('../core/surface.mjs');
        const AGENT = path.default.join(osm.default.homedir(), '.agent');
        await compileSurface({
          vaultDir: path.default.join(AGENT, 'memory-vault'),
          skillsDir: path.default.join(AGENT, 'skills'),
          derivedDir: path.default.join(AGENT, 'memory-derived'),
          instructionsFile: path.default.join(AGENT, 'INSTRUCTIONS.md'),
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
    }
  }

  // ── Done ──
  console.error(`
  ┌─────────────────────────────────────────────────┐
  │  ✅ Deploy complete!                             │
  │                                                  │
  │  VFS:        ~/.agent/                           │
  │  Config:     ~/.agent/config/                    │
  │  API:        http://${opts.domain}:3000/v1/chat/completions │
  │  Memory:     http://${opts.domain}:3000/api/memory         │
  │  Dashboard:  http://${opts.domain}/              │
  │  Cron:       Every 5 min — agent processes queue │
  │                                                  │
  │  Next steps:                                     │
  │    npx total-recall daemon status                │
  └─────────────────────────────────────────────────┘
`);
}
