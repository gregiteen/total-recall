import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const INJECTION_BEGIN = '<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->';
const INJECTION_END = '<!-- END INJECTED MEMORY -->';
const SHIMS = ['.cursorrules', 'CLAUDE.md', '.clauderules', 'AGENTS.md', 'GEMINI.md'];

function parseArgs(args) {
  const opts = {
    brain: null,
    token: null,
    watch: false,
    push: false,
    intervalSeconds: 60,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--brain': opts.brain = args[++i]; break;
      case '--token': opts.token = args[++i]; break;
      case '--watch': opts.watch = true; break;
      case '--push': opts.push = true; break;
      case '--interval': opts.intervalSeconds = Number(args[++i]) || 60; break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
  total-recall sync — Sync brain instructions and back up vault to GitHub

  Usage: total-recall sync [options]

  Options:
    --brain <url>       Brain base URL. Defaults to .agent/config/brain.json
    --token <token>     Bearer PAT. Defaults to brain.json or TOTAL_RECALL_TOKEN
    --watch             Keep syncing on an interval
    --interval <sec>    Watch interval in seconds (default: 60)
    --push              Back up vault to your GitHub fork (git add -f + push)
    --help, -h          Show this help

  Backup workflow (--push):
    Commits .agent/memory-vault/, .agent/INSTRUCTIONS.md, and
    .agent/config/brain.json to your fork via force-add (bypasses .gitignore).
    Secrets (.agent/config/secrets.enc, .env) are NEVER committed.
    Run 'npx total-recall setup' to configure your GitHub fork first.
`);
}

function workspaceAgentDir(cwd = process.cwd()) {
  return path.join(cwd, '.agent');
}

function loadBrainConfig(agentDir) {
  const local = path.join(agentDir, 'config', 'brain.json');
  const global = path.join(os.homedir(), '.agent', 'config', 'brain.json');
  for (const file of [local, global]) {
    if (!fs.existsSync(file)) continue;
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return null; }
  }
  return null;
}

function extractManagedBlock(content) {
  const start = content.indexOf(INJECTION_BEGIN);
  const end = content.indexOf(INJECTION_END);
  if (start === -1 || end === -1 || end < start) return content.trim();
  return content.slice(start, end + INJECTION_END.length).trim();
}

function replaceManagedBlock(existing, block) {
  const start = existing.indexOf(INJECTION_BEGIN);
  const end = existing.indexOf(INJECTION_END);
  if (start === -1 || end === -1 || end < start) {
    return `${existing.trimEnd()}\n\n${block}\n`;
  }
  return `${existing.slice(0, start)}${block}${existing.slice(end + INJECTION_END.length)}`;
}

function writeProjection(cwd, instructions) {
  const instructionsFile = path.join(cwd, 'INSTRUCTIONS.md');
  fs.writeFileSync(instructionsFile, instructions.endsWith('\n') ? instructions : `${instructions}\n`, 'utf8');

  const block = extractManagedBlock(instructions);
  const targets = {};
  for (const shim of SHIMS) {
    const target = path.join(cwd, shim);
    try {
      if (fs.existsSync(target)) {
        const stat = fs.lstatSync(target);
        if (!stat.isSymbolicLink()) {
          const existing = fs.readFileSync(target, 'utf8');
          fs.writeFileSync(target, replaceManagedBlock(existing, block), 'utf8');
          targets[shim] = 'updated';
        } else {
          targets[shim] = 'symlink';
        }
      } else {
        fs.symlinkSync('INSTRUCTIONS.md', target);
        targets[shim] = 'symlinked';
      }
    } catch (err) {
      targets[shim] = `skipped: ${err.message}`;
    }
  }

  return { instructionsFile, targets };
}

function writeSyncState(agentDir, state) {
  const configDir = path.join(agentDir, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  const stateFile = path.join(configDir, 'sync-state.json');
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
  return stateFile;
}

async function pullInstructions(brainUrl, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${brainUrl.replace(/\/$/, '')}/api/instructions`, { headers });
  if (!res.ok) {
    throw new Error(`Failed to pull instructions: HTTP ${res.status}`);
  }
  return res.json();
}

async function runOnce(opts) {
  const cwd = process.cwd();
  const agentDir = workspaceAgentDir(cwd);
  const brainConfig = loadBrainConfig(agentDir);
  const brainUrl = opts.brain || brainConfig?.url;
  const token = opts.token || brainConfig?.token || process.env.TOTAL_RECALL_TOKEN;

  if (!brainUrl) {
    throw new Error('No brain URL configured. Pass --brain <url> or create .agent/config/brain.json.');
  }

  const remote = await pullInstructions(brainUrl, token);
  if (!remote.content) {
    throw new Error('Remote /api/instructions response did not include content.');
  }

  const projection = writeProjection(cwd, remote.content);
  const stateFile = writeSyncState(agentDir, {
    last_sync: new Date().toISOString(),
    brain_url: brainUrl,
    remote: {
      sha256: remote.sha256 || null,
      bytes: remote.bytes || null,
      modified: remote.modified || null
    },
    targets: projection.targets
  });

  return {
    brain_url: brainUrl,
    instructions_file: projection.instructionsFile,
    sync_state_file: stateFile,
    remote_sha256: remote.sha256 || null,
    targets: projection.targets
  };
}

// ─── GitHub fork backup ──────────────────────────────────────────────────────

// Paths to force-add to the fork (bypasses .gitignore).
// secrets.enc and .env are intentionally excluded — never committed.
const VAULT_FORCE_ADD = [
  '.agent/memory-vault',
  '.agent/INSTRUCTIONS.md',
  '.agent/config/brain.json',
];

function gitRun(args, opts = {}) {
  const result = spawnSync('git', args, {
    stdio: opts.silent ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });
  if (result.status !== 0 && !opts.ignoreErrors) {
    throw new Error(`git ${args[0]} failed: ${(result.stderr || '').trim()}`);
  }
  return (result.stdout || '').trim();
}

function pushToFork() {
  // Verify we're in a git repo
  const root = gitRun(['rev-parse', '--show-toplevel'], { silent: true, ignoreErrors: true });
  if (!root) throw new Error('Not inside a git repository.');

  // Warn if origin appears to be the upstream (not a personal fork)
  const originUrl = gitRun(['remote', 'get-url', 'origin'], { silent: true, ignoreErrors: true });
  if (originUrl.includes('gregiteen/total-recall')) {
    console.error('  ⚠️  origin is the upstream repo, not your personal fork.');
    console.error('  Set up your fork first:');
    console.error('    git remote rename origin upstream');
    console.error('    git remote add origin https://github.com/YOUR_USERNAME/total-recall.git');
    throw new Error('Configure your fork as origin before using sync --push.');
  }

  // Force-add vault files (bypasses .gitignore)
  for (const target of VAULT_FORCE_ADD) {
    if (fs.existsSync(path.join(root, target))) {
      gitRun(['add', '-f', target], { ignoreErrors: true });
    }
  }

  // Nothing staged? Already up to date.
  const status = gitRun(['status', '--porcelain'], { silent: true });
  if (!status) {
    console.error('  ℹ  Vault is already up to date with origin — nothing to push.');
    return { committed: false };
  }

  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  gitRun(['commit', '-m', `vault: backup ${timestamp}`]);
  gitRun(['push', 'origin', 'main']);
  console.error(`  ✅ Vault backed up to origin at ${timestamp}`);

  return { committed: true, timestamp };
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default async function sync(args) {
  const opts = parseArgs(args);
  if (opts.help) {
    printHelp();
    return;
  }

  // --push mode: back up vault to GitHub fork
  if (opts.push) {
    pushToFork();
    return;
  }

  async function tick() {
    const result = await runOnce(opts);
    console.error(`  Synced ${result.instructions_file}`);
    console.error(`  Remote sha: ${result.remote_sha256 || 'unknown'}`);
    return result;
  }

  await tick();
  if (!opts.watch) return;

  const intervalMs = Math.max(5, opts.intervalSeconds) * 1000;
  console.error(`  Watching every ${Math.round(intervalMs / 1000)}s. Press Ctrl+C to stop.`);
  await new Promise((resolve) => {
    const timer = setInterval(() => {
      tick().catch(err => console.error(`  Sync failed: ${err.message}`));
    }, intervalMs);
    process.on('SIGINT', () => {
      clearInterval(timer);
      resolve();
    });
  });
}
