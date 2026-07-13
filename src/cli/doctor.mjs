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
  │  Pre-flighting persistent runtime diagnostics...         │
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

  if (ramGb >= 4) {
    logOk('System RAM is fully sufficient for headless CLI agent dispatch (≥4 GB)');
  } else if (ramGb >= 2) {
    logWarn(`System RAM (${ramGb} GB) is slightly low, but sufficient for headless execution.`);
    warnings++;
  } else {
    logFail(`System RAM (${ramGb} GB) is critically low.`);
    failures++;
  }

  // ── Step 2: Binary Dependencies ──
  hr();
  logInfo('2. SOFTWARE DEPENDENCY CHECK');

  const dependencies = [
    { name: 'git', required: true, desc: 'sync and backup operations' },
    { name: 'curl', required: true, desc: 'REST communications & API fetches' },
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
    { num: 80, desc: 'HTTP Caddy redirection (Let\'s Encrypt)', critical: false },
    { num: 443, desc: 'HTTPS Caddy TLS ingress', critical: false },
  ];

  for (const port of ports) {
    const free = await checkPort(port.num);
    if (free) {
      logOk(`Port ${String(port.num).padEnd(5)}: Free (${port.desc})`);
    } else {
      if (port.critical) {
        logFail(`Port ${String(port.num).padEnd(5)}: CONFLICT — Already bound by another service (${port.desc})`);
        failures++;
      } else {
        logWarn(`Port ${String(port.num).padEnd(5)}: In use (${port.desc})`);
        warnings++;
      }
    }
  }

  // ── Step 4: CLI Agents & Embeddings Providers ──
  hr();
  logInfo('4. CLI AGENTS & EMBEDDINGS PROVIDERS');

  const { loadRuntimeConfig } = await import('../core/runtime.mjs');
  let config;
  try {
    config = loadRuntimeConfig();
  } catch (err) {
    config = { agents: [] };
  }
  const agents = config.agents || [];

  if (agents.length > 0) {
    let healthyCount = 0;
    for (const agent of agents) {
      const exists = commandExists(agent.binary);
      if (exists) {
        logOk(`Agent ${agent.name.padEnd(8)}: Available (Binary: ${agent.binary})`);
        healthyCount++;
      } else {
        logWarn(`Agent ${agent.name.padEnd(8)}: NOT FOUND in PATH (Binary: ${agent.binary})`);
        warnings++;
      }
    }
  } else {
    logWarn('No CLI agents found in registry configuration.');
    warnings++;
  }

  const googleKey = process.env.GOOGLE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (googleKey) {
    logOk('GOOGLE_API_KEY environment variable is configured (Primary Embeddings)');
  } else if (openaiKey) {
    logOk('OPENAI_API_KEY environment variable is configured (Fallback Embeddings)');
  } else {
    logWarn('Neither GOOGLE_API_KEY nor OPENAI_API_KEY is configured in the environment.');
    log('     Tip: Configure GOOGLE_API_KEY to use gemini-embedding-2 (free tier).');
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
