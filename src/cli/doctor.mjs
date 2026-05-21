/**
 * total-recall doctor
 *
 * System diagnostic utility to pre-flight check all dependencies,
 * hardware requirements, software binaries, port conflicts, and model servers
 * before doing a full deployment or initialization.
 *
 * Usage:
 *   npx total-recall doctor
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import child_process from 'node:child_process';

// ─── Formatting & UI Helpers ────────────────────────────────────────────────
function log(msg)     { console.log(`  ${msg}`); }
function logOk(msg)   { console.log(`  ✅ \x1b[32m${msg}\x1b[0m`); }
function logWarn(msg) { console.log(`  ⚠️  \x1b[33m${msg}\x1b[0m`); }
function logFail(msg) { console.log(`  ❌ \x1b[31m${msg}\x1b[0m`); }
function logInfo(msg) { console.log(`  ℹ  \x1b[34m${msg}\x1b[0m`); }

function hr() {
  console.log('  ' + '─'.repeat(58));
}

function commandExists(cmd) {
  if (!cmd || !/^[a-zA-Z0-9_-]+$/.test(cmd)) {
    return false;
  }
  try {
    child_process.execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getSystemRamGb() {
  return Math.round(os.totalmem() / (1024 * 1024 * 1024));
}

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false); // Port taken
      } else {
        resolve(true); // Other error (e.g. permission), treat as unavailable for binding
      }
    });
    server.once('listening', () => {
      server.close(() => resolve(true)); // Port free
    });
    server.listen(port, '127.0.0.1');
  });
}

// ─── Main Doctor Routine ─────────────────────────────────────────────────────
export default async function doctor() {
  console.log(`
  ┌─────────────────────────────────────────────────────────┐
  │  Total Recall System Doctor                             │
  │  Pre-flighting sovereign runtime diagnostics...         │
  └─────────────────────────────────────────────────────────┘
`);

  let warnings = 0;
  let failures = 0;

  // ── Step 1: System Hardware Check ──
  hr();
  logInfo('1. HARDWARE COMPATIBILITY DIAGNOSTICS');
  
  const platform = os.platform();
  const arch = os.arch();
  const cpus = os.cpus().length;
  const ramGb = getSystemRamGb();

  log(`Platform:      ${platform} (${arch})`);
  log(`CPU Cores:     ${cpus} threads`);
  log(`Total Memory:  ${ramGb} GB RAM`);

  if (ramGb >= 16) {
    logOk('System RAM matches recommendations for large models (≥16 GB)');
  } else if (ramGb >= 8) {
    logWarn(`System RAM (${ramGb} GB) is slightly low. Recommended: ≥16 GB.`);
    log('     Tip: Configure a smaller kernel model (e.g., gemma5:2b or gemma4:9b)');
    warnings++;
  } else {
    logFail(`System RAM (${ramGb} GB) is critically low (under 8 GB).`);
    log('     Running local Gemma 4 26B models will likely trigger out-of-memory crashes.');
    log('     Recommendation: Deploy to a remote cloud host or use an external API provider.');
    failures++;
  }

  // ── Step 2: Binary Dependencies ──
  hr();
  logInfo('2. SOFTWARE DEPENDENCY CHECK');

  const dependencies = [
    { name: 'git', required: true, desc: 'sync and backup operations' },
    { name: 'curl', required: true, desc: 'Ollama install & REST communications' },
    { name: 'python3', required: true, desc: 'native SearXNG search engine' },
    { name: 'pip3', required: false, desc: 'SearXNG package installation (fallback to python3 -m pip)' },
    { name: 'caddy', required: false, desc: 'auto-TLS reverse proxying' },
    { name: 'docker', required: false, desc: 'containerized fallback services' },
  ];

  for (const dep of dependencies) {
    const present = commandExists(dep.name === 'pip3' ? 'pip' : dep.name);
    if (present) {
      logOk(`${dep.name.padEnd(8)}: Present`);
    } else {
      if (dep.required) {
        logFail(`${dep.name.padEnd(8)}: MISSING — Required for ${dep.desc}`);
        failures++;
      } else {
        logWarn(`${dep.name.padEnd(8)}: Missing (Optional — used for ${dep.desc})`);
        warnings++;
      }
    }
  }

  // Check python venv capability
  if (commandExists('python3')) {
    try {
      child_process.execSync('python3 -c "import venv"', { stdio: 'ignore' });
      logOk('python-venv: Installed');
    } catch {
      logFail('python-venv: MISSING — Required for local SearXNG deployment');
      log('     Tip: Run: apt-get install -y python3-venv');
      failures++;
    }
  }

  // ── Step 3: Network Port Conflicts ──
  hr();
  logInfo('3. NETWORKING PORT AVAILABILITY');

  const ports = [
    { num: 3000, desc: 'Total Recall API Server', critical: true },
    { num: 8888, desc: 'SearXNG Web Search Engine', critical: false },
    { num: 11434, desc: 'Ollama local LLM API', critical: false },
    { num: 80, desc: 'HTTP Caddy redirection (Let\'s Encrypt)', critical: false },
    { num: 443, desc: 'HTTPS Caddy TLS ingress', critical: false },
  ];

  for (const port of ports) {
    const free = await checkPort(port.num);
    if (free) {
      logOk(`Port ${String(port.num).padEnd(5)}: Free (${port.desc})`);
    } else {
      // Check if it's already running our own service
      let ownedByUs = false;
      if (port.num === 11434 && commandExists('ollama')) {
        try {
          const res = child_process.execSync('curl -s http://127.0.0.1:11434/api/tags', { encoding: 'utf8' });
          if (res.includes('models')) ownedByUs = true;
        } catch { /* ignore */ }
      }

      if (ownedByUs) {
        logOk(`Port ${String(port.num).padEnd(5)}: In use by active Ollama Service`);
      } else if (port.critical) {
        logFail(`Port ${String(port.num).padEnd(5)}: CONFLICT — Already bound by another service (${port.desc})`);
        failures++;
      } else {
        logWarn(`Port ${String(port.num).padEnd(5)}: In use (${port.desc})`);
        warnings++;
      }
    }
  }

  // ── Step 4: Ollama & LLM Models ──
  hr();
  logInfo('4. OLLAMA ENGINE & MODELS');

  if (commandExists('ollama')) {
    try {
      const response = child_process.execSync('curl -s http://127.0.0.1:11434/api/tags', { encoding: 'utf8' });
      const parsed = JSON.parse(response);
      logOk('Ollama server: Running');
      const models = parsed.models || [];
      const hasGemma4 = models.some(m => m.name.startsWith('gemma4:26b'));
      const hasEmbed = models.some(m => m.name.startsWith('nomic-embed-text'));

      if (hasGemma4) {
        logOk('Model gemma4:26b: Installed');
      } else {
        logWarn('Model gemma4:26b: Missing (Will be pulled during npx total-recall deploy)');
        warnings++;
      }

      if (hasEmbed) {
        logOk('Model nomic-embed-text: Installed');
      } else {
        logWarn('Model nomic-embed-text: Missing (Will be pulled during npx total-recall deploy)');
        warnings++;
      }
    } catch {
      logWarn('Ollama server: Installed but not running. Start it to use local models.');
      warnings++;
    }
  } else {
    logWarn('Ollama: Not installed. Recommended for sovereign/local LLM inference.');
    warnings++;
  }

  // ── Step 5: Privilege & Workspace Environment ──
  hr();
  logInfo('5. SECURITY & WORKSPACE INTEGRITY');

  // VFS permissions
  const home = os.homedir();
  const vfsPath = path.join(home, '.agent');
  if (fs.existsSync(vfsPath)) {
    try {
      fs.accessSync(vfsPath, fs.constants.R_OK | fs.constants.W_OK);
      logOk('VFS folder permissions (~/.agent): Read/Write Stable');
    } catch {
      logFail('VFS folder permissions (~/.agent): ACCESS DENIED');
      failures++;
    }
  } else {
    logOk('VFS folder (~/.agent): Ready to scaffold');
  }

  // Sudo access (non-blocking check)
  if (platform === 'linux') {
    try {
      child_process.execSync('sudo -n true', { stdio: 'ignore' });
      logOk('Sudo access: Passwordless sudo enabled (ideal for automated deploy)');
    } catch {
      logWarn('Sudo access: Passwordless sudo disabled (deployment will prompt for root password)');
      warnings++;
    }
  }

  // ── Diagnostics Summary ──
  hr();
  console.log('\n  ┌─────────────────────────────────────────────────────────┐');
  if (failures === 0 && warnings === 0) {
    console.log('  │  🎉 Diagnostics Passed! System is perfectly healthy.     │');
    console.log('  │  Ready for npx total-recall setup or deploy.            │');
  } else if (failures === 0) {
    console.log(`  │  ⚠️  Diagnostics passed with ${warnings} warning(s).                 │`);
    console.log('  │  System is ready, but check recommendations above.      │');
  } else {
    console.log(`  │  ❌ Diagnostics failed with ${failures} error(s) and ${warnings} warning(s).    │`);
    console.log('  │  Please resolve critical failures before deploying.     │');
  }
  console.log('  └─────────────────────────────────────────────────────────┘\n');

  if (failures > 0) {
    process.exitCode = 1;
  }
}
