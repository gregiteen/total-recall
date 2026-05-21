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
import {
  corsOptions,
  loadSecurityConfig,
  requireAuth,
  requireAuthOrLocal,
  requireHttps,
  requireScope
} from './auth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

// ─── Watchdog ───────────────────────────────────────────────────────────────────
// Attach circuit-breaker log monitor before any subsystem can emit events.
import { attachLogMonitor } from '../core/watchdog.mjs';
attachLogMonitor();

// ─── App ────────────────────────────────────────────────────────────────────────

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(requireHttps);
app.use(cors(corsOptions()));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

import fs from 'node:fs';

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

  let ollamaStatus = 'unknown';
  let ollamaModels = [];
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const ollamaRes = await fetch('http://localhost:11434/', { signal: controller.signal });
    clearTimeout(timeoutId);
    ollamaStatus = ollamaRes.ok ? 'online' : 'offline';

    if (ollamaStatus === 'online') {
      try {
        const modelsController = new AbortController();
        const modelsTimeout = setTimeout(() => modelsController.abort(), 2000);
        const modelsRes = await fetch('http://localhost:11434/api/tags', { signal: modelsController.signal });
        clearTimeout(modelsTimeout);
        if (modelsRes.ok) {
          const data = await modelsRes.json();
          ollamaModels = (data.models || []).map(m => m.name);
        }
      } catch (e) {
        // ignore model list fetch failures
      }
    }
  } catch (e) {
    ollamaStatus = 'offline';
  }

  const import_os = await import('node:os');
  const agentDir = process.env.AGENT_DIR || path.join(import_os.default.homedir(), '.agent');
  const vaultExists = fs.existsSync(path.join(agentDir, 'memory-vault'));

  // Check emergency alerts
  let emergencyAlerts = '';
  try {
    const alertsPath = path.join(agentDir, 'alerts', 'emergency.md');
    if (fs.existsSync(alertsPath)) {
      emergencyAlerts = fs.readFileSync(alertsPath, 'utf8');
    }
  } catch { /* non-fatal */ }

  // Check daemon status from PID file
  let daemonStatus = 'unknown';
  try {
    const pidPath = path.join(agentDir, 'logs', 'daemon.pid');
    if (fs.existsSync(pidPath)) {
      const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
      if (pid > 0) {
        try {
          process.kill(pid, 0); // signal 0 = check if process exists
          daemonStatus = 'running';
        } catch {
          daemonStatus = 'dead';
        }
      }
    } else {
      daemonStatus = 'not_started';
    }
  } catch { /* non-fatal */ }

  // Determine overall status
  const hasCriticalIssue = emergencyAlerts.length > 0 || daemonStatus === 'dead' || ollamaStatus === 'offline' || ollamaModels.length === 0;

  res.json({
    status: hasCriticalIssue ? 'degraded' : 'healthy',
    version: '3.0.0',
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    disk,
    ollama: ollamaStatus,
    ollama_models: ollamaModels,
    daemon: daemonStatus,
    emergency_alerts: emergencyAlerts || null,
    vfs: {
      exists: vaultExists,
      path: agentDir,
    },
  });
});

// ─── Brain Health Check (MODEL.md contract) ─────────────────────────────────────

app.get('/api/health', requireAuth, requireScope('health:read'), async (req, res) => {
  let ollamaOnline = false;
  let activeModel = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const ollamaRes = await fetch('http://localhost:11434/', { signal: controller.signal });
    clearTimeout(timeoutId);
    ollamaOnline = ollamaRes.ok;

    if (ollamaOnline) {
      try {
        const modelsController = new AbortController();
        const modelsTimeout = setTimeout(() => modelsController.abort(), 2000);
        const modelsRes = await fetch('http://localhost:11434/api/tags', { signal: modelsController.signal });
        clearTimeout(modelsTimeout);
        if (modelsRes.ok) {
          const data = await modelsRes.json();
          const models = data.models || [];
          // Prefer gemma4:26b, fall back to first available
          const gemma = models.find(m => m.name.startsWith('gemma4'));
          activeModel = gemma ? gemma.name : (models[0]?.name || null);
        }
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    // Ollama offline
  }

  if (!ollamaOnline) {
    return res.status(503).json({
      status: 'degraded',
      model: null,
      runtime: 'ollama',
      uptime_seconds: Math.floor(process.uptime()),
      capabilities: [],
      reason: 'Ollama runtime is offline',
    });
  }

  res.json({
    status: 'ok',
    model: activeModel,
    runtime: 'ollama',
    uptime_seconds: Math.floor(process.uptime()),
    capabilities: [
      'text-generation',
      'function-calling',
      'system-instructions',
      'structured-output',
    ],
  });
});

// ─── REST API (/api/*, /v1/models, /.well-known/*) ───────────────────────────

try {
  const { restRouter } = await import('./rest.mjs');
  app.use(restRouter);
  console.error('[Server] REST API mounted (/api/*, /v1/models, /.well-known/total-recall.json)');
} catch (err) {
  console.error('[Server] REST API failed to load:', err.message);
}

// ─── API Routes (/v1/chat/completions) ──────────────────────────────────────────

try {
  const { apiRouter } = await import('./api.mjs');
  if (apiRouter) {
    app.use(apiRouter);
    console.error('[Server] API routes mounted at /v1/chat/completions');
  }
} catch (err) {
  // api.mjs may still be in standalone mode — mount it directly
  console.error('[Server] API router not exported as middleware, loading standalone routes...');
  const { callFrontier, loadFrontierConfig } = await import('../core/frontier.mjs');
  const os = await import('node:os');

  app.post('/v1/chat/completions', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
      }

      const configPath = path.join(os.homedir(), '.agent', 'config', 'frontier.yml');
      const config = loadFrontierConfig(configPath);
      const { messages, model, temperature } = req.body;

      if (!messages || messages.length === 0) {
        return res.status(400).json({ error: 'Messages array is required' });
      }

      const systemMessage = messages.find(m => m.role === 'system')?.content || '';
      const userPrompt = messages.filter(m => m.role !== 'system').map(m => m.content).join('\n');

      const responseContent = await callFrontier(userPrompt, systemMessage, {
        ...config,
        model: model || config.model,
        temperature: temperature || config.temperature
      });

      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: config.model,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: responseContent },
          finish_reason: 'stop'
        }]
      });
    } catch (error) {
      console.error('[API Error]', error);
      res.status(500).json({ error: error.message });
    }
  });
}



// ─── Static Frontend (SPA catch-all) ────────────────────────────────────────────

const frontendDist = path.join(ROOT, 'frontend', 'dist');
app.use(express.static(frontendDist));

// ─── Built-in Chat UI (/chat) ────────────────────────────────────────────────────
// Self-contained, no build step required. Works immediately after `npx total-recall start`.

import { createRequire } from 'node:module';
import os from 'node:os';

app.get('/chat', (req, res) => {
  const agentDir = process.env.AGENT_DIR || path.join(os.homedir(), '.agent');
  const instructionsPath = path.join(agentDir, 'INSTRUCTIONS.md');
  const hasInstructions = fs.existsSync(instructionsPath);
  const nodeCount = (() => {
    try {
      const vaultDir = path.join(agentDir, 'memory-vault', 'active');
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
const PORT = process.env.PORT || serverSecurityConfig.bind?.port || 3000;
const configuredHost = process.env.HOST || serverSecurityConfig.bind?.host || '127.0.0.1';
const publicBindRequested = configuredHost === '0.0.0.0' || configuredHost === '::';
const HOST = process.env.NODE_ENV === 'production' && publicBindRequested && serverSecurityConfig.bind?.allow_public_bind !== true
  ? '127.0.0.1'
  : configuredHost;

app.listen(PORT, HOST, () => {
  if (HOST !== configuredHost) {
    console.error(`[Server] Refusing public bind '${configuredHost}' in production. Bound to ${HOST}.`);
  }
  console.error(`\n  ┌─────────────────────────────────────────────┐`);
  console.error(`  │  Total Recall Brain v3.0.0                  │`);
  console.error(`  │                                             │`);
  console.error(`  │  API:       http://${HOST}:${PORT}/v1/chat/completions │`);
  console.error(`  │  Memory:    http://${HOST}:${PORT}/api/memory           │`);
  console.error(`  │  Health:    http://${HOST}:${PORT}/health               │`);
  console.error(`  │  Dashboard: http://${HOST}:${PORT}/                     │`);
  console.error(`  └─────────────────────────────────────────────┘\n`);
});
