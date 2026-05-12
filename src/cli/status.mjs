/**
 * total-recall status
 *
 * Show brain connection status, last sync time, local vs. remote vault hash
 * comparison, and stale rule count.
 *
 * Usage:
 *   npx total-recall status [options]
 *
 * Options:
 *   --json             Emit machine-readable JSON
 *   --brain <url>      Override the configured brain URL
 *   --token <token>    Bearer PAT for the brain (overrides config / env)
 *   --help, -h         Show this help
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const AGENT_DIR = path.join(os.homedir(), '.agent');
const BRAIN_CONFIG = path.join(AGENT_DIR, 'config', 'brain.json');
const SYNC_STATE = path.join(AGENT_DIR, 'config', 'sync-state.json');
const INSTRUCTIONS_FILE = path.join(AGENT_DIR, 'INSTRUCTIONS.md');

function parseArgs(args) {
  const opts = { json: false, brain: null, token: null, help: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--json': opts.json = true; break;
      case '--brain': opts.brain = args[++i]; break;
      case '--token': opts.token = args[++i]; break;
      case '--help': case '-h': opts.help = true; break;
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
  total-recall status — Show brain connection and sync state

  Usage: total-recall status [options]

  Options:
    --json             Emit machine-readable JSON
    --brain <url>      Override the configured brain URL
    --token <token>    Bearer PAT for the brain (overrides config / env)
    --help, -h         Show this help
`);
}

function loadBrainConfig() {
  if (!fs.existsSync(BRAIN_CONFIG)) return null;
  try { return JSON.parse(fs.readFileSync(BRAIN_CONFIG, 'utf8')); }
  catch { return null; }
}

function loadSyncState() {
  if (!fs.existsSync(SYNC_STATE)) return {};
  try { return JSON.parse(fs.readFileSync(SYNC_STATE, 'utf8')); }
  catch { return {}; }
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function probeBrain(brainUrl, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const out = { reachable: false, instructions_sha256: null, instructions_bytes: null, error: null };
  try {
    const res = await fetch(`${brainUrl.replace(/\/$/, '')}/api/instructions`, { headers });
    if (!res.ok) {
      out.error = `HTTP ${res.status}`;
      return out;
    }
    const body = await res.json();
    out.reachable = true;
    out.instructions_sha256 = body.sha256 || null;
    out.instructions_bytes = body.bytes || null;
    out.modified = body.modified || null;
  } catch (err) {
    out.error = err.message;
  }
  return out;
}

export default async function statusCmd(args) {
  const opts = parseArgs(args);
  if (opts.help) { printHelp(); return; }

  const brainConfig = loadBrainConfig();
  const syncState = loadSyncState();
  const brainUrl = opts.brain || brainConfig?.url || null;
  const token = opts.token || brainConfig?.token || process.env.TOTAL_RECALL_TOKEN || null;

  let localInstructions = null;
  if (fs.existsSync(INSTRUCTIONS_FILE)) {
    const buf = fs.readFileSync(INSTRUCTIONS_FILE);
    const stat = fs.statSync(INSTRUCTIONS_FILE);
    localInstructions = {
      path: INSTRUCTIONS_FILE,
      sha256: sha256(buf),
      bytes: stat.size,
      modified: stat.mtime.toISOString()
    };
  }

  let remote = null;
  if (brainUrl) {
    remote = await probeBrain(brainUrl, token);
  }

  const inSync = !!(localInstructions && remote?.instructions_sha256 &&
    remote.instructions_sha256 === localInstructions.sha256);

  const report = {
    brain: {
      url: brainUrl,
      configured: !!brainConfig,
      reachable: remote?.reachable || false,
      error: remote?.error || null
    },
    instructions: {
      local: localInstructions,
      remote: remote ? {
        sha256: remote.instructions_sha256,
        bytes: remote.instructions_bytes,
        modified: remote.modified
      } : null,
      in_sync: inSync
    },
    last_sync: syncState.last_sync || null,
    targets: syncState.targets ? Object.keys(syncState.targets) : []
  };

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('\n  Total Recall — Status\n');
  console.log(`  Brain URL:        ${report.brain.url || '(not configured)'}`);
  console.log(`  Reachable:        ${report.brain.reachable ? 'yes' : 'no'}${report.brain.error ? `  (${report.brain.error})` : ''}`);
  console.log(`  Local INSTR.:     ${localInstructions ? `${localInstructions.bytes} bytes, sha=${localInstructions.sha256.slice(0, 12)}…` : '(not compiled)'}`);
  if (remote?.instructions_sha256) {
    console.log(`  Remote INSTR.:    ${remote.instructions_bytes} bytes, sha=${remote.instructions_sha256.slice(0, 12)}…`);
  }
  console.log(`  In sync:          ${inSync ? 'yes' : 'no'}`);
  console.log(`  Last sync:        ${report.last_sync || 'never'}`);
  console.log(`  Sync targets:     ${report.targets.length ? report.targets.join(', ') : '(none)'}`);
  console.log();
}
