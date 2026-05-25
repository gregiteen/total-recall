/**
 * total-recall setup
 *
 * Interactive first-time setup wizard:
 *   1. Ask what provider (Hetzner / DigitalOcean / RunPod / own server / local)
 *   2. Collect API key with masked input
 *   3. Provision the server via provider API
 *   4. SSH in and run deploy
 *   5. Ask what IDEs / chat apps to connect
 *   6. Run connect for each
 *
 * Usage:
 *   npx total-recall setup [--yes] [--dry-run]
 */

import readline from 'node:readline';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { resolveAgentDir, resolveBrainDir } from './agent-dir.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── UI helpers ─────────────────────────────────────────────────────────────

function box(title, body = '') {
  const line = '─'.repeat(58);
  console.log(`\n  ┌${line}┐`);
  console.log(`  │  ${title.padEnd(56)}│`);
  if (body) console.log(`  │  ${body.padEnd(56)}│`);
  console.log(`  └${line}┘`);
}

function hr() {
  console.log('\n  ' + '─'.repeat(58));
}

function ok(msg) { console.log(`  ✅ ${msg}`); }
function info(msg) { console.log(`  ℹ  ${msg}`); }
function warn(msg) { console.log(`  ⚠️  ${msg}`); }
function step(n, total, msg) { console.log(`\n  [${n}/${total}] ${msg}`); }

// ─── Prompt helpers ──────────────────────────────────────────────────────────

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`  ${question} `, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptSecret(question) {
  return new Promise(resolve => {
    process.stdout.write(`  ${question} `);
    const rl = readline.createInterface({ input: process.stdin, output: null });
    // Disable echo
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    let input = '';
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const handler = (char) => {
      if (char === '\r' || char === '\n') {
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.removeListener('data', handler);
        process.stdin.pause();
        rl.close();
        process.stdout.write('\n');
        resolve(input);
      } else if (char === '') { // Ctrl+C
        process.exit(0);
      } else if (char === '' || char === '\b') { // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        input += char;
        process.stdout.write('*');
      }
    };
    process.stdin.on('data', handler);
  });
}

async function choose(question, options) {
  console.log(`\n  ${question}`);
  options.forEach((opt, i) => {
    const label = opt.label || opt;
    const desc = opt.desc ? `  — ${opt.desc}` : '';
    console.log(`    ${i + 1}) ${label}${desc}`);
  });
  while (true) {
    const answer = await prompt(`Choice [1-${options.length}]:`);
    const n = parseInt(answer, 10);
    if (n >= 1 && n <= options.length) return options[n - 1];
    warn(`Please enter a number between 1 and ${options.length}.`);
  }
}

async function chooseMultiple(question, options) {
  console.log(`\n  ${question}`);
  console.log(`  (enter comma-separated numbers, or 'none')`);
  options.forEach((opt, i) => {
    console.log(`    ${i + 1}) ${opt.label || opt}`);
  });
  const answer = await prompt(`Choices:`);
  if (!answer || answer.toLowerCase() === 'none') return [];
  const nums = answer.split(',').map(s => parseInt(s.trim(), 10)).filter(n => n >= 1 && n <= options.length);
  return [...new Set(nums)].map(n => options[n - 1]);
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

function httpRequest(method, url, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (body) {
      const bodyStr = JSON.stringify(body);
      opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── SSH wait helper ─────────────────────────────────────────────────────────

async function waitForSSH(ip, user = 'root', maxWait = 120) {
  info(`Waiting for SSH to come up at ${ip}...`);
  const start = Date.now();
  while ((Date.now() - start) / 1000 < maxWait) {
    const result = spawnSync('ssh', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ConnectTimeout=5',
      '-o', 'BatchMode=yes',
      `${user}@${ip}`, 'echo ok'
    ], { stdio: 'pipe' });
    if (result.status === 0) { ok('SSH ready.'); return true; }
    await new Promise(r => setTimeout(r, 5000));
    process.stdout.write('.');
  }
  throw new Error(`SSH did not come up within ${maxWait}s`);
}

// ─── Provider: Hetzner ───────────────────────────────────────────────────────

async function provisionHetzner(apiKey, opts = {}) {
  const { serverType = 'cx42', location = 'nbg1', model = 'gemma4:26b' } = opts;

  // Get SSH key IDs
  let sshKeys = [];
  const keysRes = await httpRequest('GET', 'https://api.hetzner.cloud/v1/ssh_keys', {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (keysRes.status === 200 && keysRes.body.ssh_keys?.length > 0) {
    sshKeys = keysRes.body.ssh_keys.map(k => k.id);
    info(`Found ${sshKeys.length} SSH key(s) in your Hetzner account.`);
  } else {
    warn('No SSH keys found in your Hetzner account.');
    warn('Upload your public key at: https://console.hetzner.cloud → Security → SSH Keys');
    const cont = await prompt('Press Enter to continue anyway, or Ctrl+C to abort:');
  }

  info(`Creating Hetzner ${serverType} in ${location}...`);
  const res = await httpRequest('POST', 'https://api.hetzner.cloud/v1/servers', {
    headers: { Authorization: `Bearer ${apiKey}` },
    body: {
      name: 'total-recall-brain',
      server_type: serverType,
      image: 'ubuntu-24.04',
      location,
      ssh_keys: sshKeys,
      labels: { project: 'total-recall' },
    }
  });

  if (res.status !== 201) {
    throw new Error(`Hetzner API error (${res.status}): ${JSON.stringify(res.body)}`);
  }

  const server = res.body.server;
  const ip = server.public_net.ipv4.ip;
  ok(`Server created! IP: ${ip} (ID: ${server.id})`);
  info('It takes ~30 seconds for the server to boot.');

  await waitForSSH(ip);
  return { ip, user: 'root' };
}

// ─── Provider: DigitalOcean ──────────────────────────────────────────────────

async function provisionDO(apiKey, opts = {}) {
  const { size = 's-8vcpu-16gb', region = 'nyc3' } = opts;

  // Get SSH key IDs
  let sshKeyIds = [];
  const keysRes = await httpRequest('GET', 'https://api.digitalocean.com/v2/account/keys', {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (keysRes.status === 200 && keysRes.body.ssh_keys?.length > 0) {
    sshKeyIds = keysRes.body.ssh_keys.map(k => k.id);
    info(`Found ${sshKeyIds.length} SSH key(s) in your DigitalOcean account.`);
  } else {
    warn('No SSH keys found. Add one at: https://cloud.digitalocean.com/account/security');
  }

  info(`Creating DigitalOcean ${size} droplet in ${region}...`);
  const res = await httpRequest('POST', 'https://api.digitalocean.com/v2/droplets', {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: {
      name: 'total-recall-brain',
      region,
      size,
      image: 'ubuntu-24-04-x64',
      ssh_keys: sshKeyIds,
      monitoring: true,
      tags: ['total-recall'],
    }
  });

  if (res.status !== 202) {
    throw new Error(`DigitalOcean API error (${res.status}): ${JSON.stringify(res.body)}`);
  }

  const dropletId = res.body.droplet.id;
  info(`Droplet created (ID: ${dropletId}). Waiting for IP...`);

  // Poll for IP
  let ip = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const poll = await httpRequest('GET', `https://api.digitalocean.com/v2/droplets/${dropletId}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const v4 = poll.body.droplet?.networks?.v4 || [];
    const pub = v4.find(n => n.type === 'public');
    if (pub) { ip = pub.ip_address; break; }
    process.stdout.write('.');
  }

  if (!ip) throw new Error('Could not get droplet IP after 150s');
  ok(`Droplet ready! IP: ${ip}`);

  await waitForSSH(ip);
  return { ip, user: 'root' };
}

// ─── Remote deploy ────────────────────────────────────────────────────────────

function sshRun(ip, user, cmd, { silent = false } = {}) {
  const result = spawnSync('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    `${user}@${ip}`,
    cmd
  ], { stdio: silent ? 'pipe' : 'inherit' });
  if (result.status !== 0 && !silent) {
    throw new Error(`SSH command failed: ${cmd}`);
  }
  return result.stdout?.toString().trim() || '';
}

async function remoteSetup(ip, user, opts = {}) {
  const { domain, model = 'gemma4:26b' } = opts;

  info(`Setting up Total Recall on ${ip}...`);

  // Install Node.js 20 via nvm
  step(1, 3, 'Installing Node.js...');
  sshRun(ip, user,
    'curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh -o /tmp/install_nvm.sh && bash /tmp/install_nvm.sh && rm /tmp/install_nvm.sh && ' +
    'source ~/.bashrc && nvm install 20 2>/dev/null || ' +
    '(curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/setup_node.sh && bash /tmp/setup_node.sh && rm /tmp/setup_node.sh && apt-get install -y nodejs)'
  );

  // Run total-recall deploy
  step(2, 3, 'Running total-recall deploy...');
  const deployCmd = domain
    ? `npx --yes total-recall deploy --domain ${domain}`
    : 'npx --yes total-recall deploy';
  sshRun(ip, user, `export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && ${deployCmd}`);

  // Generate PAT
  step(3, 3, 'Generating access token...');
  const pat = sshRun(ip, user,
    'export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && npx total-recall generate-pat --quiet',
    { silent: true }
  );

  ok('Remote setup complete!');
  return { pat: pat || null };
}

// ─── GitHub fork ─────────────────────────────────────────────────────────────

const UPSTREAM_OWNER = 'gregiteen';
const UPSTREAM_REPO  = 'total-recall';

async function forkRepo(githubToken) {
  info('Forking gregiteen/total-recall to your GitHub account...');
  const res = await httpRequest(
    'POST',
    `https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/forks`,
    {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        'User-Agent': 'total-recall-setup',
        Accept: 'application/vnd.github+json',
      },
    }
  );
  if (res.status !== 202 && res.status !== 200) {
    throw new Error(`GitHub fork failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  const fork = res.body;
  ok(`Forked → ${fork.html_url}`);
  // GitHub forks are async — wait a moment for it to be clonable
  await new Promise(r => setTimeout(r, 4000));
  return { cloneUrl: fork.clone_url, htmlUrl: fork.html_url, fullName: fork.full_name };
}

async function getGitHubUser(githubToken) {
  const res = await httpRequest('GET', 'https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      'User-Agent': 'total-recall-setup',
      Accept: 'application/vnd.github+json',
    },
  });
  if (res.status !== 200) return null;
  return res.body;
}

// ─── Store brain config ───────────────────────────────────────────────────────

function storeBrainConfig(brDir, brainUrl, token, provider, apiKey, extra = {}) {
  const configDir = path.join(brDir, 'config');
  fs.mkdirSync(configDir, { recursive: true });

  // brain.json
  fs.writeFileSync(
    path.join(configDir, 'brain.json'),
    JSON.stringify({ url: brainUrl, token, provider, ...extra }, null, 2),
    'utf8'
  );

  // secrets.enc (plaintext for now — encrypt in future)
  const secretsPath = path.join(configDir, 'secrets.enc');
  let secrets = {};
  if (fs.existsSync(secretsPath)) {
    try { secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8')); } catch {}
  }
  if (apiKey) secrets[`${provider}_api_key`] = apiKey;
  fs.writeFileSync(secretsPath, JSON.stringify(secrets, null, 2), { encoding: 'utf8', mode: 0o600 });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default async function setup(args) {
  const dryRun = args.includes('--dry-run');
  const yes = args.includes('--yes');

  box('Total Recall Setup', 'Interactive first-time configuration wizard');

  if (dryRun) {
    warn('Dry-run mode: no changes will be made.');
  }

  const agentDir = resolveAgentDir();
  const brDir = resolveBrainDir();

  // ── Step 1: Where are you running? ──────────────────────────────────────────
  console.log('\n  Where do you want to run Total Recall?\n');
  console.log('  The full brain (OpenAI-compatible API, dashboard, Dream Cycle) needs a');
  console.log('  server running 24/7 with at least 16 GB RAM for the default model.\n');

  const deployment = await choose('Choose your deployment:', [
    { label: 'Hetzner Cloud',     desc: '⭐ CX42 €18/mo, 16GB RAM — cheapest always-on', value: 'hetzner' },
    { label: 'DigitalOcean',      desc: 'Droplet from $96/mo, easiest setup', value: 'do' },
    { label: 'I have a server',   desc: 'SSH into your own VM or bare metal', value: 'ssh' },
    { label: 'Local only',        desc: 'Run everything on this machine (no cloud)', value: 'local' },
    { label: 'IDE memory only',   desc: 'Just memory nodes in your IDE, no server', value: 'ide-only' },
  ]);

  const deployTarget = deployment.value || deployment;
  let ip = null, user = 'root', apiKey = null, brainUrl = null, pat = null;
  let domain = null;
  let forkUrl = null, forkFullName = null;

  // ── Step 1.5: GitHub fork (free backup + multi-machine sync) ─────────────────

  hr();
  console.log('\n  📦 GitHub Backup (recommended)');
  console.log('  Fork total-recall to your GitHub account to get:');
  console.log('    • Free encrypted backup of your brain vault');
  console.log('    • Multi-machine sync via git pull');
  console.log('    • Full version history of every memory change\n');

  const wantGitHub = yes ? 'y' : (await prompt('Set up GitHub backup? [Y/n]:')).toLowerCase();
  if (wantGitHub !== 'n' && wantGitHub !== 'no') {
    console.log('\n  Create a GitHub token at: https://github.com/settings/tokens/new');
    console.log('  Required scopes: repo (for private forks) or public_repo (for public)\n');
    const githubToken = await promptSecret('GitHub Personal Access Token:');
    if (githubToken) {
      const ghUser = await getGitHubUser(githubToken).catch(() => null);
      if (ghUser) {
        info(`Authenticated as @${ghUser.login}`);
        if (!dryRun) {
          try {
            const fork = await forkRepo(githubToken);
            forkUrl = fork.cloneUrl;
            forkFullName = fork.fullName;
            ok(`Your fork: ${fork.htmlUrl}`);
            ok('Run `npx total-recall sync --push` anytime to back up your vault to GitHub.');
          } catch (e) {
            warn(`Could not fork: ${e.message}`);
            warn('You can fork manually at https://github.com/gregiteen/total-recall');
          }
        } else {
          info('[dry-run] would fork gregiteen/total-recall to your account');
        }
        // Store GitHub token for sync --push
        const secretsPath = path.join(resolveBrainDir(), 'config', 'secrets.enc');
        fs.mkdirSync(path.dirname(secretsPath), { recursive: true });
        let secrets = {};
        if (fs.existsSync(secretsPath)) { try { secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8')); } catch {} }
        secrets.github_token = githubToken;
        if (!dryRun) fs.writeFileSync(secretsPath, JSON.stringify(secrets, null, 2), { encoding: 'utf8', mode: 0o600 });
      } else {
        warn('Could not authenticate with that token — skipping GitHub backup.');
      }
    } else {
      info('Skipping GitHub backup. You can set it up later with: npx total-recall connect github');
    }
  }

  // ── Step 2: Provider-specific provisioning ──────────────────────────────────

  if (deployTarget === 'hetzner') {
    hr();
    console.log('\n  Hetzner Cloud — Create a project at https://console.hetzner.cloud');
    console.log('  Then: Project → Security → API Tokens → Generate API Token (Read & Write)\n');
    apiKey = await promptSecret('Hetzner API Token:');
    if (!apiKey) { warn('No token provided. Exiting.'); process.exit(1); }

    const sizeChoice = await choose('Server type:', [
      { label: 'CX42  (16 GB, 8 vCPU, ~€18/mo) ⭐',  value: 'cx42',  desc: 'runs gemma4:26b' },
      { label: 'CX52  (32 GB, 16 vCPU, ~€32/mo)',     value: 'cx52',  desc: 'runs gemma4:31b' },
      { label: 'AX42  (64 GB, 12 ded. CPU, ~€46/mo)', value: 'ax42',  desc: 'best value overall' },
    ]);

    const regionChoice = await choose('Region:', [
      { label: 'Nuremberg, Germany (nbg1)', value: 'nbg1' },
      { label: 'Helsinki, Finland  (hel1)', value: 'hel1' },
      { label: 'Ashburn, US        (ash)',  value: 'ash'  },
    ]);

    if (!dryRun) {
      const result = await provisionHetzner(apiKey, {
        serverType: sizeChoice.value,
        location: regionChoice.value,
      });
      ip = result.ip; user = result.user;
    }

  } else if (deployTarget === 'do') {
    hr();
    console.log('\n  DigitalOcean — Create a token at https://cloud.digitalocean.com/account/api/tokens\n');
    apiKey = await promptSecret('DigitalOcean API Token:');
    if (!apiKey) { warn('No token provided. Exiting.'); process.exit(1); }

    const sizeChoice = await choose('Droplet size:', [
      { label: 's-8vcpu-16gb     ($96/mo, 16 GB)',  value: 's-8vcpu-16gb',     desc: 'runs gemma4:26b' },
      { label: 's-8vcpu-32gb-amd ($160/mo, 32 GB)', value: 's-8vcpu-32gb-amd', desc: 'runs gemma4:31b' },
    ]);

    if (!dryRun) {
      const result = await provisionDO(apiKey, { size: sizeChoice.value });
      ip = result.ip; user = result.user;
    }

  } else if (deployTarget === 'ssh') {
    hr();
    ip = await prompt('Server IP or hostname:');
    user = await prompt('SSH user [root]:') || 'root';
    if (!ip) { warn('No IP provided. Exiting.'); process.exit(1); }
    if (!dryRun) await waitForSSH(ip, user, 30);

  } else if (deployTarget === 'local') {
    info('Running deploy locally on this machine...');
    if (!dryRun) {
      const result = spawnSync('node', [
        path.join(__dirname, '..', '..', 'bin', 'total-recall.mjs'),
        'deploy'
      ], { stdio: 'inherit' });
      if (result.status !== 0) throw new Error('Local deploy failed');
      ok('Local deploy complete!');
    }
    brainUrl = 'http://127.0.0.1:3000';
  }

  // ── Step 3: Domain (optional) ────────────────────────────────────────────────

  if (ip && deployTarget !== 'local' && deployTarget !== 'ide-only') {
    hr();
    console.log('\n  Optional: a domain name enables HTTPS via Caddy auto-TLS.');
    console.log(`  Without a domain, your brain will be at http://${ip}:3000\n`);
    domain = await prompt('Domain (leave blank for none):');
    brainUrl = domain ? `https://${domain}` : `http://${ip}:3000`;
  }

  // ── Step 4: Remote deploy ────────────────────────────────────────────────────

  if (ip && !dryRun) {
    hr();
    const result = await remoteSetup(ip, user, { domain });
    pat = result.pat;
    ok(`Brain deployed at: ${brainUrl}`);
    if (pat) ok(`Access token: ${pat}`);
  }

  // ── Step 5: Store config locally ─────────────────────────────────────────────

  if (brainUrl && !dryRun) {
    storeBrainConfig(brDir, brainUrl, pat, deployTarget, apiKey);
    ok(`Brain config saved to ${path.join(brDir, 'config', 'brain.json')}`);
  }

  // ── Step 6: Connect IDEs ─────────────────────────────────────────────────────

  if (deployTarget !== 'ide-only') {
    hr();
  }

  const ideOptions = [
    { label: 'Claude Code',   value: 'claude-code' },
    { label: 'Codex',         value: 'codex' },
    { label: 'Antigravity',   value: 'antigravity' },
    { label: 'Gemini CLI',    value: 'gemini' },
    { label: 'Cursor',        value: 'cursor' },
    { label: 'Aider',         value: 'aider' },
    { label: 'Obsidian',      value: 'obsidian' },
    { label: 'UltraChat',     value: 'ultrachat' },
  ];

  const selectedIDEs = await chooseMultiple(
    'Which IDEs / apps do you use? (connect them to your brain)',
    ideOptions
  );

  if (selectedIDEs.length > 0) {
    hr();
    info('Connecting IDEs...');
    const connectArgs = brainUrl ? ['--brain', brainUrl] : [];
    if (pat) connectArgs.push('--token', pat);

    for (const ide of selectedIDEs) {
      const client = ide.value || ide;
      const extraArgs = [...connectArgs];
      if (dryRun) {
        info(`[dry-run] would run: total-recall connect ${client} ${extraArgs.join(' ')}`);
      } else {
        const connectHandler = await import(path.join(__dirname, 'connect.mjs'));
        try {
          await connectHandler.default([client, ...extraArgs]);
        } catch (e) {
          warn(`Could not connect ${client}: ${e.message}`);
        }
      }
    }
  }

  // ── Done ─────────────────────────────────────────────────────────────────────

  hr();
  console.log('\n  ✅ Total Recall setup complete!\n');

  if (brainUrl) {
    console.log(`  Brain URL:   ${brainUrl}`);
    if (pat) console.log(`  Access token: ${pat}`);
    console.log('');
    console.log('  OpenAI-compatible config for any app:');
    console.log(`    baseURL:  ${brainUrl}/v1`);
    console.log(`    model:    total-recall/gemma4`);
    if (pat) console.log(`    apiKey:   ${pat}`);
  }

  console.log('\n  Next steps:');
  console.log('    • Add memory: edit files in ~/.agent/skills/total-recall/memory-vault/ then run: npx total-recall compile');
  console.log('    • Check status: npx total-recall status');
  console.log('    • Start Dream Cycle: npx total-recall daemon start');
  console.log('    • Full CLI: npx total-recall --help');
  console.log('');
}
