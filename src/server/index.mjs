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
  for (const bin of ['antigravity', 'gemini', 'claude', 'codex']) {
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

  res.json({
    status: hasCriticalIssue ? 'degraded' : 'healthy',
    version: PACKAGE_VERSION,
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    disk,
    cli_agents: cliAgents,
    daemon: daemonStatus,
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
  const agents = [];
  for (const bin of ['antigravity', 'gemini', 'claude', 'codex']) {
    if (findBinaryInPath(bin)) agents.push(bin);
  }

  if (agents.length === 0) {
    return res.status(503).json({
      status: 'degraded',
      runtime: 'cli-agents',
      uptime_seconds: Math.floor(process.uptime()),
      capabilities: [],
      reason: 'No CLI agents found. Install antigravity, claude, or codex.',
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
} catch (err) {
  logger.error('server', `REST API failed to load: ${err.message}`);
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
  :root{--bg:#0d1117;--surface:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--blue:#58a6ff;--green:#3fb950;--purple:#bc8cff;--orange:#f0883e;--red:#f85149;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);height:100vh;display:flex;flex-direction:column;}
  header{background:var(--surface);border-bottom:1px solid var(--border);padding:12px 20px;display:flex;align-items:center;gap:12px;flex-shrink:0;}
  header h1{font-size:16px;font-weight:700;letter-spacing:-0.3px;}
  .badge{font-size:11px;padding:2px 8px;border-radius:10px;background:rgba(88,166,255,0.15);color:var(--blue);border:1px solid rgba(88,166,255,0.3);}
  .mode-bar{display:flex;gap:4px;margin-left:auto;align-items:center;}
  .mode-btn{background:none;border:1px solid var(--border);color:var(--muted);padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;transition:all 0.15s;}
  .mode-btn.active{background:var(--blue);border-color:var(--blue);color:#0d1117;font-weight:600;}
  .search-toggle{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);cursor:pointer;margin-left:12px;border-left:1px solid var(--border);padding-left:12px;}
  .search-toggle input{width:14px;height:14px;cursor:pointer;accent-color:var(--blue);}
  .search-toggle.on{color:var(--green);}
  .messages{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:16px;}
  .msg{display:flex;gap:12px;max-width:780px;width:100%;margin:0 auto;}
  .msg.user{flex-direction:row-reverse;}
  .avatar{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;}
  .msg.user .avatar{background:var(--blue);color:#0d1117;}
  .msg.assistant .avatar{background:var(--purple);color:#0d1117;}
  .bubble{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 16px;font-size:14px;line-height:1.6;max-width:calc(100% - 44px);}
  .msg.user .bubble{background:rgba(88,166,255,0.1);border-color:rgba(88,166,255,0.2);}
  .bubble pre{background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:6px;padding:10px;overflow-x:auto;margin:8px 0;}
  .bubble code{font-family:'SF Mono',Menlo,monospace;font-size:12px;}
  .bubble p{margin-bottom:8px;}
  .bubble p:last-child{margin-bottom:0;}
  .typing{display:flex;gap:4px;align-items:center;padding:4px 0;}
  .typing span{width:6px;height:6px;border-radius:50%;background:var(--muted);animation:bounce 1.2s infinite;}
  .typing span:nth-child(2){animation-delay:0.2s;}
  .typing span:nth-child(3){animation-delay:0.4s;}
  @keyframes bounce{0%,60%,100%{transform:translateY(0);}30%{transform:translateY(-6px);}}
  .input-area{border-top:1px solid var(--border);padding:16px 20px;background:var(--surface);flex-shrink:0;}
  .input-row{max-width:780px;margin:0 auto;display:flex;gap:10px;align-items:flex-end;}
  textarea{flex:1;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px 14px;color:var(--text);font-size:14px;resize:none;min-height:44px;max-height:180px;line-height:1.5;font-family:inherit;outline:none;transition:border-color 0.15s;}
  textarea:focus{border-color:var(--blue);}
  .send-btn{background:var(--blue);color:#0d1117;border:none;border-radius:10px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;flex-shrink:0;transition:opacity 0.15s;}
  .send-btn:disabled{opacity:0.4;cursor:not-allowed;}
  .status-bar{text-align:center;font-size:11px;color:var(--muted);margin-top:8px;}
  .token-prompt{position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:100;}
  .token-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px;max-width:400px;width:90%;}
  .token-card h2{margin-bottom:8px;}
  .token-card p{color:var(--muted);font-size:13px;margin-bottom:16px;}
  .token-card input{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text);font-family:monospace;font-size:13px;margin-bottom:12px;outline:none;}
  .token-card input:focus{border-color:var(--blue);}
  .token-card button{background:var(--blue);color:#0d1117;border:none;border-radius:8px;padding:10px 20px;font-weight:600;cursor:pointer;width:100%;}
  .system-notice{background:rgba(188,140,255,0.08);border:1px solid rgba(188,140,255,0.2);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--muted);max-width:780px;margin:0 auto 4px;display:flex;gap:8px;align-items:flex-start;}
  .system-notice strong{color:var(--purple);}
  #no-token{display:${hasInstructions ? 'none' : 'none'};} /* always hidden initially */
</style>
</head>
<body>

<header>
  <span>⚡</span>
  <h1>Total Recall</h1>
  <span class="badge">${nodeCount} memories</span>
  <div class="mode-bar">
    <button class="mode-btn active" id="mode-knowledge" onclick="setMode('knowledge')">🧠 Knowledge</button>
    <button class="mode-btn" id="mode-journal" onclick="setMode('journal')">📓 Journal</button>
    <button class="mode-btn" id="mode-reflect" onclick="setMode('reflect')">🔮 Reflect</button>
    <label class="search-toggle" id="search-toggle-label" title="Let the AI search the web during this conversation">
      <input type="checkbox" id="search-toggle" onchange="updateSearchToggle()">
      🌐 Web search
    </label>
  </div>
</header>

<div class="messages" id="messages">
  <div class="system-notice" id="mode-notice">
    <strong>Knowledge mode</strong>&nbsp;— Ask anything. I'll answer from your memory first, then reason from what I know.
  </div>
</div>

<div class="input-area">
  <div class="input-row">
    <textarea id="input" placeholder="Ask anything…" rows="1" onkeydown="handleKey(event)" oninput="autoResize(this)"></textarea>
    <button class="send-btn" id="send-btn" onclick="sendMessage()" title="Send (Enter)">↑</button>
  </div>
  <div class="status-bar" id="status-bar">Connected to brain at ${req.headers.host || 'localhost:3000'}</div>
</div>

<div class="token-prompt" id="token-prompt" style="display:none">
  <div class="token-card">
    <h2>🔑 Access Token</h2>
    <p>Enter your Personal Access Token to start chatting.</p>
    <p style="font-size:12px;color:#8b949e;margin-top:6px">
      Don't have one? Run this in your terminal:<br>
      <code style="display:block;margin-top:6px;padding:6px 10px;background:#010409;border-radius:4px;font-size:11px;color:#58a6ff">npx total-recall generate-pat</code>
      Then paste the token starting with <code>tr-</code> below.
    </p>
    <input type="password" id="token-input" placeholder="tr-…" autocomplete="off">
    <button onclick="saveToken()">Connect →</button>
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
const configuredHost = configHost || serverSecurityConfig.bind?.host || '127.0.0.1';
const publicBindRequested = configuredHost === '0.0.0.0' || configuredHost === '::';
const HOST = nodeEnv === 'production' && publicBindRequested && serverSecurityConfig.bind?.allow_public_bind !== true
  ? '127.0.0.1'
  : configuredHost;

const server = app.listen(PORT, HOST, () => {
  if (HOST !== configuredHost) {
    logger.error("server", `Refusing public bind '${configuredHost}' in production. Bound to ${HOST}.`);
  }
  logger.info("server", `Total Recall Brain v3.0.0 is listening on http://${HOST}:${PORT}`);

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
});

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
