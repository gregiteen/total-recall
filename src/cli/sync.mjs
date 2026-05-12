/**
 * total-recall sync
 *
 * Pull the latest compiled INSTRUCTIONS.md from the configured brain and
 * inject it into local IDE instruction files (CLAUDE.md, AGENTS.md, GEMINI.md,
 * .cursorrules, .clauderules) using non-destructive block injection.
 *
 * Usage:
 *   npx total-recall sync                 Pull once and inject.
 *   npx total-recall sync --watch         Re-pull every 60s.
 *   npx total-recall sync --brain <url>   Override configured brain URL.
 *   npx total-recall sync --token <tok>   Bearer PAT for brain auth.
 *   npx total-recall sync --interval <s>  Watch interval (default 60s).
 *   npx total-recall sync --help          Show this help.
 *
 * Sync state is recorded in ~/.agent/config/sync-state.json. The pulled
 * instructions are written to ~/.agent/INSTRUCTIONS.md and the local IDE
 * shims are refreshed via the surface compiler's injection helper.
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
  const opts = { watch: false, interval: 60, brain: null, token: null, help: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--watch': opts.watch = true; break;
      case '--interval': opts.interval = parseInt(args[++i], 10) || 60; break;
      case '--brain': opts.brain = args[++i]; break;
      case '--token': opts.token = args[++i]; break;
      case '--help': case '-h': opts.help = true; break;
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
  total-recall sync — Pull compiled instructions from the brain

  Usage: total-recall sync [options]

  Options:
    --watch              Continuously re-pull (default interval 60s)
    --interval <s>       Watch interval in seconds (default 60)
    --brain <url>        Override configured brain URL
    --token <token>      Bearer PAT for brain auth
    --help, -h           Show this help
`);
}

function loadJSON(file) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function saveJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function pullOnce({ brainUrl, token, cwd }) {
  if (!brainUrl) {
    throw new Error('No brain URL configured. Run `total-recall init --brain <url>` or pass --brain.');
  }
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = `${brainUrl.replace(/\/$/, '')}/api/instructions`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Brain returned HTTP ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  const content = body.content;
  if (typeof content !== 'string') {
    throw new Error('Brain response missing `content` field.');
  }

  // Write the pulled instructions to disk.
  fs.mkdirSync(path.dirname(INSTRUCTIONS_FILE), { recursive: true });
  fs.writeFileSync(INSTRUCTIONS_FILE, content, 'utf8');
  const localSha = sha256(content);

  // Re-inject into local IDE files using surface.mjs's block-injection helper.
  let injectedFiles = [];
  try {
    const surfaceMod = await import('../core/surface.mjs');
    const injectInto = surfaceMod.injectIntoExisting || surfaceMod.compileTier1;
    if (typeof injectInto === 'function') {
      // compileTier1 normally rebuilds from vault; here we just rewrite each
      // shim with the pulled content. Fall back to manual injection if the
      // surface module doesn't expose a helper.
    }
    injectedFiles = writeIdeShims(cwd, content);
  } catch (err) {
    console.error(`[sync] IDE shim injection skipped: ${err.message}`);
  }

  // Update sync state.
  const state = loadJSON(SYNC_STATE) || {};
  state.last_sync = new Date().toISOString();
  state.last_brain_url = brainUrl;
  state.last_sha256 = localSha;
  state.last_remote_sha256 = body.sha256 || null;
  saveJSON(SYNC_STATE, state);

  return {
    sha256: localSha,
    bytes: Buffer.byteLength(content, 'utf8'),
    matches_remote: body.sha256 ? body.sha256 === localSha : null,
    injected_files: injectedFiles
  };
}

const SHIM_TARGETS = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.cursorrules', '.clauderules'];
const BEGIN_MARK = '<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall sync -->';
const END_MARK = '<!-- END INJECTED MEMORY -->';

function writeIdeShims(cwd, content) {
  const block = `${BEGIN_MARK}\n${content.trim()}\n${END_MARK}\n`;
  const out = [];
  for (const name of SHIM_TARGETS) {
    const file = path.join(cwd, name);
    let next;
    if (fs.existsSync(file)) {
      const existing = fs.readFileSync(file, 'utf8');
      const beginIdx = existing.indexOf(BEGIN_MARK);
      const endIdx = existing.indexOf(END_MARK);
      if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
        next = existing.slice(0, beginIdx) + block + existing.slice(endIdx + END_MARK.length).replace(/^\n/, '');
      } else {
        next = `${block}\n${existing}`;
      }
    } else {
      next = block;
    }
    fs.writeFileSync(file, next, 'utf8');
    out.push(name);
  }
  return out;
}

export default async function syncCmd(args) {
  const opts = parseArgs(args);
  if (opts.help) { printHelp(); return; }

  const cfg = loadJSON(BRAIN_CONFIG) || {};
  const brainUrl = opts.brain || cfg.url || null;
  const token = opts.token || cfg.token || process.env.TOTAL_RECALL_TOKEN || null;
  const cwd = process.cwd();

  const runOnce = async () => {
    try {
      const result = await pullOnce({ brainUrl, token, cwd });
      const tag = result.matches_remote === false ? ' (hash mismatch!)' : '';
      console.error(`[sync] pulled ${result.bytes} bytes from ${brainUrl} → ${result.injected_files.length} shims${tag}`);
    } catch (err) {
      console.error(`[sync] failed: ${err.message}`);
      if (!opts.watch) process.exit(1);
    }
  };

  await runOnce();

  if (opts.watch) {
    const ms = Math.max(5, opts.interval) * 1000;
    console.error(`[sync] watching every ${opts.interval}s. Ctrl+C to stop.`);
    setInterval(runOnce, ms);
    // Hold the event loop open
    process.stdin.resume();
  }
}
