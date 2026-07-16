/**
 * Total Recall — Unified Server Entry
 *
 * Mounts all HTTP routes on a single Express app:
 *   - /v1/chat/completions  → API proxy (api.mjs)
 *   - /health               → System diagnostics
 *   - /*                    → React SPA (frontend/dist/)
 *
 * Usage:
 *   node src/server/index.mjs
 *   PORT=3000 node src/server/index.mjs
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import fs from 'node:fs';
import {
  apiRateLimiter,
  corsOptions,
  loadSecurityConfig,
  requireAuth,
  requireAuthOrLocal,
  requireHttps,
  requireScope
} from './auth.mjs';
import { logger, logEvents } from "../core/logger.mjs";
import { drainActiveEmbeddings } from './routes/sessions.mjs';
import { agentDir as configAgentDir, brainDir as configBrainDir, port as configPort, host as configHost, nodeEnv } from '../core/config.mjs';
import { getDaemonStatus, ensureDaemonRunning } from '../core/daemon-control.mjs';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const PACKAGE_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || 'unknown';
  } catch {
    return 'unknown';
  }
})();

// ─── Watchdog ───────────────────────────────────────────────────────────────────
// Attach circuit-breaker log monitor before any subsystem can emit events.
import { attachLogMonitor } from '../core/watchdog.mjs';
attachLogMonitor();

let tunnelProcess = null;

// ─── App ────────────────────────────────────────────────────────────────────────

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(requireHttps);

// Zero-dependency dynamic Gzip compression middleware for large API payloads
app.use((req, res, next) => {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  if (!acceptEncoding.includes('gzip')) {
    return next();
  }

  const oldSend = res.send;
  res.send = function (body) {
    if (!body || res.getHeader('Content-Encoding')) {
      return oldSend.call(this, body);
    }

    let chunk = body;
    if (typeof chunk === 'object' && !(chunk instanceof Buffer)) {
      chunk = JSON.stringify(chunk);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }

    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    if (buffer.length < 1024) {
      return oldSend.call(this, buffer);
    }

    zlib.gzip(buffer, (err, compressed) => {
      if (err) {
        return oldSend.call(this, buffer);
      }
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Length', compressed.length);
      oldSend.call(this, compressed);
    });
  };

  next();
});

app.use(cors(corsOptions()));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// ─── Health Check ───────────────────────────────────────────────────────────────

app.get('/health', requireAuthOrLocal, async (req, res) => {
  let disk = { free: 0, total: 0 };
  try {
    const stat = fs.statfsSync('/');
    disk.free = stat.bavail * stat.bsize;
    disk.total = stat.blocks * stat.bsize;
  } catch (e) {
    // ignore
  }

  // CLI agent availability
  const { findBinaryInPath } = await import('../core/runtime.mjs');
  const cliAgents = [];
  for (const bin of ['antigravity', 'grok', 'gemini', 'claude', 'codex']) {
    if (findBinaryInPath(bin)) cliAgents.push(bin);
  }

  const agentDir = configAgentDir;
  const brainDir = configBrainDir;
  const vaultExists = fs.existsSync(path.join(brainDir, 'memory-vault'));
  const skillExists = fs.existsSync(path.join(agentDir, 'skills', 'total-recall', 'SKILL.md'));

  // Check emergency alerts
  let emergencyAlerts = '';
  try {
    const alertsPath = path.join(brainDir, 'alerts', 'emergency.md');
    if (fs.existsSync(alertsPath)) {
      emergencyAlerts = fs.readFileSync(alertsPath, 'utf8');
    }
  } catch { /* non-fatal */ }

  // Check daemon status
  const daemonStatus = getDaemonStatus();

  // Determine overall status
  const hasCriticalIssue = emergencyAlerts.length > 0 || daemonStatus === 'dead' || cliAgents.length === 0;

  // Check Caddy and Cloudflare status
  let caddyStatus = 'inactive';
  let cloudflareStatus = 'inactive';
  try {
    const { exec } = await import('node:child_process');
    const util = await import('node:util');
    const execAsync = util.promisify(exec);
    try {
      await execAsync('pgrep caddy');
      caddyStatus = 'active';
    } catch { }
    try {
      await execAsync('pgrep cloudflared');
      cloudflareStatus = 'active';
    } catch { }
  } catch { }

  res.json({
    status: hasCriticalIssue ? 'degraded' : 'healthy',
    version: PACKAGE_VERSION,
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    disk,
    cli_agents: cliAgents,
    daemon: daemonStatus,
    caddy: caddyStatus,
    cloudflare: cloudflareStatus,
    emergency_alerts: emergencyAlerts || null,
    vfs: {
      exists: vaultExists,
      skill_exists: skillExists,
      path: agentDir,
    },
  });
});

// ─── Brain Health Check (MODEL.md contract) ─────────────────────────────────────

app.get('/api/health', requireAuth, requireScope('health:read'), async (req, res) => {
  const { findBinaryInPath } = await import('../core/runtime.mjs');
  const { getGateStats } = await import('../core/throttled-fetch.mjs');
  const agents = [];
  for (const bin of ['antigravity', 'grok', 'gemini', 'claude', 'codex']) {
    if (findBinaryInPath(bin)) agents.push(bin);
  }

  if (agents.length === 0) {
    return res.status(503).json({
      status: 'degraded',
      runtime: 'cli-agents',
      uptime_seconds: Math.floor(process.uptime()),
      capabilities: [],
      fetch_gate: getGateStats(),
      reason: 'No CLI agents found. Install antigravity, grok, claude, or codex.',
    });
  }

  res.json({
    status: 'ok',
    runtime: 'cli-agents',
    agents,
    uptime_seconds: Math.floor(process.uptime()),
    capabilities: [
      'text-generation',
      'code-generation',
      'research-synthesis',
      'structured-output',
    ],
    fetch_gate: getGateStats(),
  });
});

// ─── REST API (/api/*, /v1/models, /.well-known/*) ───────────────────────────

try {
  const { restRouter } = await import('./rest.mjs');
  // Throttle every authenticated /api/* route with the same limiter that
  // already guards /v1/*. Resource-specific limiters (sandbox, ingest) sit
  // inline on those handlers and stack on top of this one.
  app.use('/api', apiRateLimiter());
  app.use(restRouter);
  logger.info('server', 'REST API mounted (/api/*, /v1/models, /.well-known/total-recall.json)');

  const { collabRouter } = await import('./routes/collab.mjs');
  app.use(collabRouter);
  logger.info('server', 'Collaboration API routes mounted (/api/collab/*)');
} catch (err) {
  logger.error('server', `REST API or Collab routes failed to load: ${err.message}`);
}

// ─── API Routes (/v1/chat/completions) ──────────────────────────────────────────

try {
  const { apiRouter } = await import('./api.mjs');
  if (apiRouter) {
    app.use(apiRouter);
    logger.info('server', 'API routes mounted at /v1/chat/completions');
  }
} catch (err) {
  logger.error('server', `API router failed to load; /v1/chat/completions left unmounted: ${err.message}`);
}



// ─── Static Frontend (SPA catch-all) ────────────────────────────────────────────

const frontendDist = path.join(ROOT, 'frontend', 'dist');

// Auto-build frontend if dist/ doesn't exist
if (!fs.existsSync(path.join(frontendDist, 'index.html'))) {
  const frontendDir = path.join(ROOT, 'frontend');
  if (fs.existsSync(path.join(frontendDir, 'package.json'))) {
    logger.info('server', 'Frontend not built. Building automatically...');
    try {
      const { execSync } = await import('node:child_process');
      execSync('npm install --no-audit --no-fund 2>/dev/null && npm run build', {
        cwd: frontendDir,
        stdio: 'pipe',
        timeout: 120_000,
      });
      logger.info('server', 'Frontend build complete.');
    } catch (err) {
      logger.warn('server', `Frontend auto-build failed: ${err.message?.split('\\n')[0] || 'unknown error'}. Dashboard will show API info instead.`);
    }
  }
}

app.use(express.static(frontendDist));

// ─── Built-in Chat UI (/chat) ────────────────────────────────────────────────────
// Self-contained, no build step required. Works immediately after `npx total-recall start`.

import { createRequire } from 'node:module';
import os from 'node:os';

app.get('/chat', (req, res) => {
  const agentDir = configAgentDir;
  const instructionsPath = path.join(configBrainDir, 'INSTRUCTIONS.md');
  const hasInstructions = fs.existsSync(instructionsPath);
  const nodeCount = (() => {
    try {
      const vaultDir = path.join(configBrainDir, 'memory-vault', 'active');
      if (!fs.existsSync(vaultDir)) return 0;
      return fs.readdirSync(vaultDir).filter(f => f.endsWith('.md')).length;
    } catch { return 0; }
  })();

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Total Recall — Chat</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
  :root {
    --bg: #09090b;
    --surface: rgba(24, 24, 27, 0.6);
    --border: rgba(255, 255, 255, 0.08);
    --text: #fafafa;
    --muted: #a1a1aa;
    --accent: #3b82f6;
    --accent-glow: rgba(59, 130, 246, 0.2);
    --user-msg: rgba(59, 130, 246, 0.1);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: var(--bg);
    background-image: radial-gradient(circle at 50% 0%, rgba(59,130,246,0.1), transparent 50%);
    color: var(--text);
    height: 100vh; display: flex; flex-direction: column;
    overflow: hidden;
  }
  header {
    background: rgba(9, 9, 11, 0.7);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    padding: 16px 24px; display: flex; align-items: center; gap: 16px;
    z-index: 10;
  }
  header h1 { font-size: 18px; font-weight: 600; letter-spacing: -0.5px; background: linear-gradient(to right, #fff, #93c5fd); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .badge { font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 20px; background: rgba(59,130,246,0.15); color: #93c5fd; border: 1px solid rgba(147,197,253,0.2); }
  .mode-bar { display: flex; gap: 8px; margin-left: auto; align-items: center; background: rgba(255,255,255,0.03); padding: 4px; border-radius: 12px; border: 1px solid var(--border); }
  .mode-btn { background: transparent; border: none; color: var(--muted); padding: 6px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
  .mode-btn:hover { color: var(--text); background: rgba(255,255,255,0.05); }
  .mode-btn.active { background: var(--text); color: var(--bg); box-shadow: 0 4px 12px rgba(255,255,255,0.1); }
  .search-toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: var(--muted); cursor: pointer; margin-left: 16px; transition: color 0.2s; }
  .search-toggle input { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
  .search-toggle.on { color: #34d399; }
  .messages { flex: 1; overflow-y: auto; padding: 32px 24px; display: flex; flex-direction: column; gap: 24px; scroll-behavior: smooth; }
  .msg { display: flex; gap: 16px; max-width: 840px; width: 100%; margin: 0 auto; animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
  @keyframes slide-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .msg.user { flex-direction: row-reverse; }
  .avatar { width: 36px; height: 36px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
  .msg.user .avatar { background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; }
  .msg.assistant .avatar { background: linear-gradient(135deg, #a855f7, #7e22ce); color: white; }
  .bubble { background: var(--surface); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid var(--border); border-radius: 16px; padding: 16px 20px; font-size: 15px; line-height: 1.6; max-width: calc(100% - 52px); box-shadow: 0 8px 24px rgba(0,0,0,0.1); }
  .msg.user .bubble { background: var(--user-msg); border-color: rgba(59,130,246,0.3); border-top-right-radius: 4px; }
  .msg.assistant .bubble { border-top-left-radius: 4px; }
  .bubble pre { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 12px; overflow-x: auto; margin: 12px 0; }
  .bubble code { font-family: 'SF Mono', Menlo, monospace; font-size: 13px; }
  .bubble p { margin-bottom: 12px; }
  .bubble p:last-child { margin-bottom: 0; }
  .typing { display: flex; gap: 6px; align-items: center; padding: 8px 4px; }
  .typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--text); animation: bounce 1.4s infinite ease-in-out both; opacity: 0.5; }
  .typing span:nth-child(1) { animation-delay: -0.32s; }
  .typing span:nth-child(2) { animation-delay: -0.16s; }
  @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); opacity: 1; } }
  .input-area { background: rgba(9, 9, 11, 0.8); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-top: 1px solid var(--border); padding: 24px; flex-shrink: 0; }
  .input-row { max-width: 840px; margin: 0 auto; display: flex; gap: 12px; align-items: flex-end; position: relative; }
  textarea { flex: 1; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 16px 60px 16px 20px; color: var(--text); font-size: 15px; resize: none; min-height: 56px; max-height: 200px; line-height: 1.5; font-family: inherit; outline: none; transition: all 0.2s; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); }
  textarea:focus { border-color: var(--accent); background: rgba(255,255,255,0.05); box-shadow: 0 0 0 4px var(--accent-glow); }
  .send-btn { position: absolute; right: 8px; bottom: 8px; background: var(--text); color: var(--bg); border: none; border-radius: 12px; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; transition: all 0.2s; font-weight: 600; }
  .send-btn:hover:not(:disabled) { transform: scale(1.05); box-shadow: 0 4px 12px rgba(255,255,255,0.2); }
  .send-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .status-bar { text-align: center; font-size: 12px; color: var(--muted); margin-top: 12px; font-weight: 500; }
  .token-prompt { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 100; animation: fade-in 0.3s; }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  .token-card { background: var(--bg); border: 1px solid var(--border); border-radius: 24px; padding: 40px; max-width: 440px; width: 90%; box-shadow: 0 24px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1); text-align: center; }
  .token-card h2 { margin-bottom: 12px; font-size: 24px; font-weight: 600; letter-spacing: -0.5px; }
  .token-card p { color: var(--muted); font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
  .token-card input { width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px 16px; color: var(--text); font-family: 'SF Mono', Menlo, monospace; font-size: 14px; margin-bottom: 16px; outline: none; transition: border-color 0.2s; text-align: center; }
  .token-card input:focus { border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-glow); }
  .token-card button { background: var(--text); color: var(--bg); border: none; border-radius: 12px; padding: 14px 24px; font-weight: 600; font-size: 15px; cursor: pointer; width: 100%; transition: all 0.2s; }
  .token-card button:hover { transform: translateY(-2px); box-shadow: 0 8px 16px rgba(255,255,255,0.1); }
  .system-notice { background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.2); border-radius: 12px; padding: 12px 16px; font-size: 13px; color: #e9d5ff; max-width: 840px; margin: 0 auto 12px; display: flex; gap: 12px; align-items: flex-start; line-height: 1.5; backdrop-filter: blur(4px); }
  .system-notice strong { color: #c084fc; font-weight: 600; }
  #no-token{display:${hasInstructions ? 'none' : 'none'};} /* always hidden initially */
</style>
</head>
<body>

<header>
  <span style="font-size: 20px;">⚡</span>
  <h1>Total Recall</h1>
  <span class="badge">${nodeCount} memories</span>
  <div class="mode-bar">
    <button class="mode-btn active" id="mode-knowledge" onclick="setMode('knowledge')">Knowledge</button>
    <button class="mode-btn" id="mode-journal" onclick="setMode('journal')">Journal</button>
    <button class="mode-btn" id="mode-reflect" onclick="setMode('reflect')">Reflect</button>
  </div>
  <label class="search-toggle" id="search-toggle-label" title="Let the AI search the web during this conversation">
    <input type="checkbox" id="search-toggle" onchange="updateSearchToggle()">
    Web search
  </label>
</header>

<div class="messages" id="messages">
  <div class="system-notice" id="mode-notice">
    <strong>Knowledge mode</strong>&nbsp;— Ask anything. I'll answer from your memory first, then reason from what I know.
  </div>
</div>

<div class="input-area">
  <div class="input-row">
    <textarea id="input" placeholder="Ask anything..." rows="1" onkeydown="handleKey(event)" oninput="autoResize(this)"></textarea>
    <button class="send-btn" id="send-btn" onclick="sendMessage()" title="Send (Enter)">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
    </button>
  </div>
  <div class="status-bar" id="status-bar">Connected to brain at ${req.headers.host || 'localhost:3000'}</div>
</div>

<div class="token-prompt" id="token-prompt" style="display:none">
  <div class="token-card">
    <div style="font-size: 48px; margin-bottom: 16px;">🔐</div>
    <h2>Access Token Required</h2>
    <p>Please enter your Personal Access Token to authenticate with your autonomous memory system.</p>
    <input type="password" id="token-input" placeholder="tr-..." autocomplete="off">
    <button onclick="saveToken()">Authenticate</button>
    <p style="font-size:12px;color:var(--muted);margin-top:24px;margin-bottom:0">
      Run <code style="padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:6px;color:var(--accent)">npx total-recall generate-pat</code> in your terminal.
    </p>
  </div>
</div>

<script>
(function() {
  var MODE = 'knowledge';
  var history = [];
  var streaming = false;

  var MODE_PROMPTS = {
    knowledge: 'You are the user\\'s personal knowledge assistant. You have access to everything they have chosen to remember. Answer questions by drawing on their memory vault first. Be specific, cite what you know, and clearly distinguish between things in their memory versus your general knowledge. Today is ' + new Date().toLocaleDateString('en-US', {weekday:'long',year:'numeric',month:'long',day:'numeric'}) + '.',
    journal: 'You are a private, non-judgmental journal companion. The user is writing privately — these entries are personal and will not be shared with other AI tools or surfaces. Be warm, reflective, and supportive. Ask thoughtful follow-up questions. Today is ' + new Date().toLocaleDateString('en-US', {weekday:'long',year:'numeric',month:'long',day:'numeric'}) + '.',
    reflect: 'You are a reflective intelligence reviewing what the user\\'s memory system has accumulated over time. Surface patterns, connections, and insights across their stored knowledge. Identify gaps, contradictions, and opportunities to build richer understanding. Today is ' + new Date().toLocaleDateString('en-US', {weekday:'long',year:'numeric',month:'long',day:'numeric'}) + '.',
  };

  var MODE_NOTICES = {
    knowledge: '<strong>Knowledge mode</strong>&nbsp;— Ask anything. I\\'ll answer from your memory first, then reason from what I know.',
    journal: '<strong>Journal mode</strong>&nbsp;— Private space. These entries stay here and won\\'t be surfaced to your IDE tools.',
    reflect: '<strong>Reflect mode</strong>&nbsp;— I\\'ll surface patterns and insights across everything you\\'ve remembered.',
  };

  window.setMode = function(m) {
    MODE = m;
    document.querySelectorAll('.mode-btn').forEach(function(b) { b.classList.remove('active'); });
    document.getElementById('mode-' + m).classList.add('active');
    document.getElementById('mode-notice').innerHTML = MODE_NOTICES[m];
    history = []; // fresh context per mode
    document.getElementById('messages').querySelectorAll('.msg').forEach(function(el) { el.remove(); });
  };

  window.updateSearchToggle = function() {
    var on = document.getElementById('search-toggle').checked;
    document.getElementById('search-toggle-label').className = 'search-toggle' + (on ? ' on' : '');
  };

  function getToken() {
    return localStorage.getItem('tr_pat') || '';
  }

  window.saveToken = function() {
    var t = document.getElementById('token-input').value.trim();
    if (!t) return;
    localStorage.setItem('tr_pat', t);
    document.getElementById('token-prompt').style.display = 'none';
    appendSystemMsg('Connected. Ready to chat.');
  };

  function checkToken() {
    if (!getToken()) {
      document.getElementById('token-prompt').style.display = '';
    }
  }

  function appendMsg(role, content) {
    var msgs = document.getElementById('messages');
    var div = document.createElement('div');
    div.className = 'msg ' + role;
    div.innerHTML = '<div class="avatar">' + (role === 'user' ? '👤' : '⚡') + '</div>' +
      '<div class="bubble" id="msg-' + Date.now() + '">' + renderMarkdown(content) + '</div>';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div.querySelector('.bubble');
  }

  function appendSystemMsg(text) {
    var msgs = document.getElementById('messages');
    var div = document.createElement('div');
    div.style.cssText = 'text-align:center;font-size:11px;color:var(--muted);padding:4px;';
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function appendTyping() {
    var msgs = document.getElementById('messages');
    var div = document.createElement('div');
    div.className = 'msg assistant';
    div.id = 'typing-indicator';
    div.innerHTML = '<div class="avatar">⚡</div><div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  function renderMarkdown(text) {
    return text
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre><code>$1</code></pre>')
      .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
      .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
      .replace(/\\*([^*]+)\\*/g, '<em>$1</em>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\\n/g, '<br>');
  }

  window.handleKey = function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  window.autoResize = function(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  };

  window.sendMessage = async function() {
    if (streaming) return;
    var input = document.getElementById('input');
    var text = input.value.trim();
    if (!text) return;

    var token = getToken();
    if (!token) { document.getElementById('token-prompt').style.display = ''; return; }

    input.value = '';
    input.style.height = 'auto';
    appendMsg('user', text);

    history.push({ role: 'user', content: text });

    var useSearch = document.getElementById('search-toggle').checked;
    var systemPrompt = MODE_PROMPTS[MODE];
    if (useSearch) {
      systemPrompt += '\\n\\nYou have access to web search in this conversation. When the user asks about current events, recent information, or anything you\\'re uncertain about, search the web before answering. Use the search_web tool.';
    }

    var typing = appendTyping();
    streaming = true;
    document.getElementById('send-btn').disabled = true;
    document.getElementById('status-bar').textContent = 'Thinking…';

    try {
      var resp = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({
          model: 'default',
          messages: [{ role: 'system', content: systemPrompt }].concat(history),
          stream: false,
        }),
      });

      if (resp.status === 401) {
        localStorage.removeItem('tr_pat');
        document.getElementById('token-prompt').style.display = '';
        typing.remove();
        return;
      }

      if (!resp.ok) {
        var errBody = await resp.text();
        typing.remove();
        appendSystemMsg('Error ' + resp.status + ': ' + errBody.slice(0,200));
        return;
      }

      var data = await resp.json();
      var content = data.choices?.[0]?.message?.content || '(no response)';
      history.push({ role: 'assistant', content: content });

      typing.remove();
      appendMsg('assistant', content);
      document.getElementById('status-bar').textContent = 'Ready — ' + history.length / 2 + ' exchange' + (history.length > 2 ? 's' : '') + ' this session';
    } catch(e) {
      typing.remove();
      appendSystemMsg('Failed to reach brain: ' + e.message);
      document.getElementById('status-bar').textContent = 'Error — check brain is running';
    } finally {
      streaming = false;
      document.getElementById('send-btn').disabled = false;
      document.getElementById('input').focus();
    }
  };

  checkToken();
  document.getElementById('input').focus();
})();
</script>
</body>
</html>`);
});

// SPA fallback — serve index.html for all unmatched routes
app.get(/^(.*)$/, (req, res) => {
  const indexPath = path.join(frontendDist, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      // Frontend not built yet — return a helpful message
      res.status(200).json({
        message: 'Total Recall Brain is running.',
        endpoints: {
          api: 'POST /v1/chat/completions',
          memory: 'GET /api/memory',
          sandbox: 'POST /api/sandbox',
          health: 'GET /health',
          dashboard: 'Build frontend first: cd frontend && npm run build'
        }
      });
    }
  });
});

// ─── Start ──────────────────────────────────────────────────────────────────────

const serverSecurityConfig = loadSecurityConfig();
const PORT = configPort || serverSecurityConfig.bind?.port || 3000;
import { getMeshIp } from '../core/mesh.mjs';

let configuredHost = configHost || serverSecurityConfig.bind?.host;
const meshIp = getMeshIp();

if (!configuredHost) {
  if (meshIp) {
    configuredHost = meshIp;
  } else {
    configuredHost = '0.0.0.0';
    logger.warn("server", "No mesh IP found. Binding to 0.0.0.0 as fallback.");
  }
}

const publicBindRequested = configuredHost === '0.0.0.0' || configuredHost === '::';
const HOST = nodeEnv === 'production' && publicBindRequested && serverSecurityConfig.bind?.allow_public_bind !== true
  ? '127.0.0.1'
  : configuredHost;

import { WebSocketServer } from 'ws';
const collabWss = new WebSocketServer({ noServer: true });

function setupUpgradeHandler(srv) {
  srv.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/collab-ws') {
      try {
        const { handleCollabUpgrade } = await import('./routes/collab.mjs');
        handleCollabUpgrade(request, socket, head, collabWss);
      } catch (err) {
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      }
    }
  });
}

const server = app.listen(PORT, HOST, () => {
  setupUpgradeHandler(server);
  if (HOST !== configuredHost) {
    logger.error("server", `Refusing public bind '${configuredHost}' in production. Bound to ${HOST}.`);
  }
  logger.info("server", `Total Recall Brain v3.0.0 is listening on http://${HOST}:${PORT}`);
});

// If bound to a mesh IP, also bind to 127.0.0.1 so local CLI/Dashboard works
if (HOST !== '127.0.0.1' && HOST !== '0.0.0.0') {
  const localServer = app.listen(PORT, '127.0.0.1', () => {
    setupUpgradeHandler(localServer);
    logger.info("server", `Total Recall Brain v3.0.0 is ALSO listening on http://127.0.0.1:${PORT}`);
  });
}

  logger.info("server", "┌─────────────────────────────────────────────┐");
  logger.info("server", "│  Total Recall Brain v3.0.0                  │");
  logger.info("server", "│                                             │");
  logger.info("server", `│  API:       http://${HOST}:${PORT}/v1/chat/completions │`);
  logger.info("server", `│  Memory:    http://${HOST}:${PORT}/api/memory           │`);
  logger.info("server", `│  Health:    http://${HOST}:${PORT}/health               │`);
  logger.info("server", `│  Dashboard: http://${HOST}:${PORT}/                     │`);
  logger.info("server", "└─────────────────────────────────────────────┘");

  // ─── Live Agent Monitor Server (Port 9111) ───
  const monitorApp = express();
  monitorApp.use(cors(corsOptions()));

  let sseClients = [];

  logEvents.on("log", (entry) => {
    const sseMessage = `data: ${JSON.stringify(entry)}\n\n`;
    sseClients.forEach(res => {
      try {
        res.write(sseMessage);
      } catch (err) {
        // failed write
      }
    });
  });

  monitorApp.get("/stream", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });
    res.write("\n"); // keep-alive initial chunk

    sseClients.push(res);

    req.on("close", () => {
      sseClients = sseClients.filter(c => c !== res);
    });
  });

  const monitorServer = monitorApp.listen(9111, HOST, () => {
    logger.info("server", `Live Agent Monitor listening on http://${HOST}:9111/stream`);
  });

  // Track monitorServer for graceful shutdown
  server.on("close", () => {
    monitorServer.close();
  });

  // Unified Background Daemon Auto-Start & Watchdog
  if (process.env.DISABLE_DAEMON !== 'true' && nodeEnv !== 'test') {
    // 1. Auto-start on boot
    ensureDaemonRunning()
      .then((pid) => {
        logger.info('server', `Daemon auto-started successfully on PID ${pid}.`);
      })
      .catch((err) => {
        logger.error('server', `Failed to auto-start daemon on boot: ${err.message}`);
      });

    // 2. Periodic self-healing watchdog every 60 seconds
    const daemonWatchdogInterval = setInterval(async () => {
      try {
        const status = getDaemonStatus();
        if (status === 'dead' || status === 'not_started') {
          logger.warn('server', `Daemon status is '${status}'. Watchdog initiating self-healing auto-restart...`);
          await ensureDaemonRunning();
        }
      } catch (err) {
        logger.error('server', `Daemon self-healing watchdog failed: ${err.message}`);
      }
    }, 60000);
    
    // Unref the interval so it doesn't block process shutdown
    daemonWatchdogInterval.unref();
  }

  // ─── Cloudflare Tunnel Auto-Start ───
  (async () => {
    try {
      const configDir = path.join(configBrainDir, 'config');
      const configFile = path.join(configDir, 'wizard-config.json');
      if (!fs.existsSync(configFile)) return;

      const wizardCfg = JSON.parse(fs.readFileSync(configFile, 'utf8') || '{}');
      const deployMode = wizardCfg['deploy-mode'];
      const autoStart = wizardCfg['tunnel-auto-start'];

      if (!['quick-tunnel', 'named-tunnel'].includes(deployMode) || autoStart === false) {
        return;
      }

      const logsDir = path.join(configBrainDir, 'logs');
      fs.mkdirSync(logsDir, { recursive: true });
      const cfLogPath = path.join(logsDir, 'cloudflared.log');
      const cfPidPath = path.join(logsDir, 'cloudflared.pid');

      // Check if another process is already alive on that PID
      if (fs.existsSync(cfPidPath)) {
        try {
          const oldPid = parseInt(fs.readFileSync(cfPidPath, 'utf8').trim(), 10);
          if (oldPid) {
            process.kill(oldPid, 0);
            logger.info('server', `Tunnel process is already running on PID ${oldPid}. Skipping spawn.`);
            return;
          }
        } catch {
          // PID is stale, proceed with spawn
        }
      }

      try {
        if (fs.existsSync(cfLogPath)) {
          fs.unlinkSync(cfLogPath);
        }
      } catch {}

      const logStream = fs.openSync(cfLogPath, 'w');
      let args = [];
      if (deployMode === 'quick-tunnel') {
        args = ['tunnel', '--url', `http://localhost:${PORT}`];
      } else {
        const tunnelName = wizardCfg['cfg-cloudflare-tunnel-name'];
        const credPath = wizardCfg['cfg-cloudflare-tunnel-credentials'];
        if (!tunnelName || !credPath) {
          logger.warn('server', 'Named tunnel config is incomplete. Missing name or credentials.');
          return;
        }
        args = ['tunnel', '--credentials-file', credPath, 'run', tunnelName];
      }

      logger.info('server', `Spawning Cloudflare Tunnel (${deployMode}) with arguments: ${args.join(' ')}`);
      
      const { spawn } = await import('node:child_process');
      tunnelProcess = spawn('cloudflared', args, {
        detached: true,
        stdio: ['ignore', logStream, logStream]
      });

      fs.writeFileSync(cfPidPath, String(tunnelProcess.pid), 'utf8');
      tunnelProcess.unref();

      tunnelProcess.on('exit', (code) => {
        logger.warn('server', `Cloudflare Tunnel process (PID ${tunnelProcess?.pid}) exited with code ${code}`);
        tunnelProcess = null;
        try {
          fs.unlinkSync(cfPidPath);
        } catch {}
      });

      if (deployMode === 'quick-tunnel') {
        logger.info('server', 'Waiting for Cloudflare Quick Tunnel URL allocation...');
        let tunnelUrl = '';
        for (let attempt = 0; attempt < 20; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          if (fs.existsSync(cfLogPath)) {
            const logs = fs.readFileSync(cfLogPath, 'utf8');
            const match = logs.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
            if (match) {
              tunnelUrl = match[0];
              break;
            }
          }
        }

        if (tunnelUrl) {
          logger.info('server', `Cloudflare Quick Tunnel allocated successfully: ${tunnelUrl}`);
          
          // Update wizard-config.json
          wizardCfg['cfg-domain'] = tunnelUrl.replace('https://', '');
          wizardCfg['cfg-api-url'] = tunnelUrl;
          wizardCfg['cfg-dash-url'] = `${tunnelUrl}/dashboard`;
          wizardCfg['cfg-health-url'] = `${tunnelUrl}/health`;

          fs.writeFileSync(configFile, JSON.stringify(wizardCfg, null, 2), { encoding: 'utf8', mode: 0o600 });
          logger.info('server', `Updated wizard-config.json with active Quick Tunnel URL: ${tunnelUrl}`);
        } else {
          logger.warn('server', 'Could not allocate Quick Tunnel URL. Please check logs in brainDir/logs/cloudflared.log');
        }
      } else {
        const hostname = wizardCfg['cfg-domain'] || 'configured domain';
        logger.info('server', `Cloudflare Named Tunnel is active. Dashboard is accessible via: https://${hostname}`);
      }
    } catch (err) {
      logger.error('server', `Failed to auto-start Cloudflare Tunnel: ${err.message}`);
    }
  })();


let shutdownInProgress = false;

async function handleShutdown(signal) {
  if (shutdownInProgress) return;
  shutdownInProgress = true;
  process.isShuttingDown = true;

  logger.info('server', `Received ${signal}. Starting graceful shutdown...`);

  if (tunnelProcess) {
    logger.info('server', `Terminating active Cloudflare Tunnel process (PID ${tunnelProcess.pid})...`);
    try {
      tunnelProcess.kill('SIGTERM');
    } catch (e) {
      logger.error('server', `Error terminating Cloudflare Tunnel: ${e.message}`);
    }
  }

  // 10s fallback hard-exit
  const forceExitTimeout = setTimeout(() => {
    logger.error('server', 'Graceful shutdown timed out. Forcefully exiting.');
    process.exit(1);
  }, 10000);
  forceExitTimeout.unref();

  // Close HTTP server to stop accepting new connections
  server.close(async (err) => {
    if (err) {
      logger.error('server', 'Error closing HTTP server', { error: err.message });
    } else {
      logger.info('server', 'HTTP server closed.');
    }

    try {
      logger.info('server', 'Draining active background operations...');
      await drainActiveEmbeddings();
      logger.info('server', 'All active background operations drained.');
    } catch (e) {
      logger.error('server', 'Error draining active background operations', { error: e.message });
    }

    clearTimeout(forceExitTimeout);
    logger.info('server', 'Graceful shutdown complete. Exiting.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
