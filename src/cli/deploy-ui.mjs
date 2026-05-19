/**
 * deploy-ui.mjs
 *
 * A lightweight HTTP server that serves a real-time install progress UI
 * during `npx total-recall deploy`. Streams step progress via Server-Sent Events.
 *
 * Usage (from deploy.mjs):
 *   import { startDeployUI, emitProgress, finishDeployUI } from './deploy-ui.mjs';
 *   const uiUrl = await startDeployUI(3001);
 *   emitProgress('step', 'Installing Ollama...');
 *   emitProgress('ok',   'Ollama installed');
 *   finishDeployUI({ apiUrl, dashUrl, healthUrl });
 */

import http from 'node:http';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

let _server   = null;
let _clients  = [];    // active SSE response objects
let _log      = [];    // buffered events (replayed to late-joining browsers)
let _done     = false;

// ─── HTML Shell ───────────────────────────────────────────────────────────────

/* eslint-disable */
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Total Recall - Install</title>
<style>
  :root {
    --bg:     #0d1117;
    --panel:  #161b22;
    --border: #30363d;
    --green:  #3fb950;
    --yellow: #d29922;
    --red:    #f85149;
    --blue:   #58a6ff;
    --muted:  #8b949e;
    --text:   #e6edf3;
    --accent: #7ee787;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 13px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 16px 64px;
  }
  header { text-align: center; margin-bottom: 32px; }
  header h1 { font-size: 28px; font-weight: 700; color: var(--accent); letter-spacing: -0.5px; }
  header p { color: var(--muted); margin-top: 6px; font-size: 12px; }

  .card {
    width: 100%;
    max-width: 700px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 20px;
  }
  .card-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--muted);
  }
  #progress-wrap { padding: 20px; }
  #progress-track { height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; }
  #progress-bar {
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, #238636, var(--accent));
    border-radius: 4px;
    transition: width 0.4s ease;
  }
  #progress-label { margin-top: 10px; color: var(--muted); font-size: 12px; }

  #log {
    padding: 16px 20px;
    max-height: 420px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .log-entry {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 6px 8px;
    border-radius: 6px;
    line-height: 1.5;
  }
  .log-entry.step  { color: var(--blue); }
  .log-entry.ok    { color: var(--green); }
  .log-entry.warn  { color: var(--yellow); background: rgba(210,153,34,.08); }
  .log-entry.error { color: var(--red);    background: rgba(248,81,73,.08); }
  .log-entry .icon { flex-shrink: 0; width: 18px; text-align: center; }
  .log-entry .msg  { flex: 1; }

  #url-card { display: none; }
  #url-card.visible { display: block; }
  #url-box { padding: 24px 20px; display: flex; flex-direction: column; gap: 16px; }
  .url-row { display: flex; flex-direction: column; gap: 4px; }
  .url-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }
  .url-value { font-size: 15px; color: var(--blue); word-break: break-all; }
  .open-btn {
    display: inline-block;
    margin-top: 20px;
    padding: 12px 28px;
    background: #238636;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: background .2s;
  }
  .open-btn:hover { background: #2ea043; }

  #status-dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--yellow);
    margin-right: 6px;
    vertical-align: middle;
  }
  #status-dot.done  { background: var(--green); }
  #status-dot.error { background: var(--red); }
</style>
</head>
<body>

<header>
  <h1>Total Recall Install</h1>
  <p>Provisioning your Sovereign AI brain - hang tight.</p>
</header>

<div class="card">
  <div class="card-header">
    <span id="status-dot"></span>
    <span id="status-text">Installing...</span>
  </div>
  <div id="progress-wrap">
    <div id="progress-track"><div id="progress-bar"></div></div>
    <div id="progress-label">Starting...</div>
  </div>
</div>

<div class="card">
  <div class="card-header">Install log</div>
  <div id="log"></div>
</div>

<div class="card" id="url-card">
  <div class="card-header">Install complete - your brain is live</div>
  <div id="url-box">
    <div class="url-row">
      <span class="url-label">API endpoint</span>
      <span class="url-value" id="api-url">-</span>
    </div>
    <div class="url-row">
      <span class="url-label">Dashboard</span>
      <span class="url-value" id="dash-url">-</span>
    </div>
    <div class="url-row">
      <span class="url-label">Health check</span>
      <span class="url-value" id="health-url">-</span>
    </div>
    <a id="open-btn" class="open-btn" href="#" target="_blank" rel="noopener noreferrer">Open Dashboard</a>
  </div>
</div>

<script>
  (function () {
    var TOTAL_STEPS = 12;
    var stepCount   = 0;

    var icons = { step: '>>', ok: 'OK', warn: '!!', error: 'XX', info: '--' };

    var log     = document.getElementById('log');
    var bar     = document.getElementById('progress-bar');
    var label   = document.getElementById('progress-label');
    var dot     = document.getElementById('status-dot');
    var statusT = document.getElementById('status-text');

    function addEntry(type, msg) {
      var div   = document.createElement('div');
      div.className = 'log-entry ' + (type || 'info');
      var icon  = document.createElement('span');
      icon.className   = 'icon';
      icon.textContent = icons[type] || '--';
      var msgEl = document.createElement('span');
      msgEl.className   = 'msg';
      msgEl.textContent = msg;
      div.appendChild(icon);
      div.appendChild(msgEl);
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    }

    function setProgress(pct, labelText) {
      bar.style.width       = pct + '%';
      label.textContent     = labelText || '';
    }

    var es = new EventSource('/events');

    es.onmessage = function (e) {
      var data = JSON.parse(e.data);
      if (data.type === 'step') {
        stepCount++;
        var pct = Math.min(Math.round((stepCount / TOTAL_STEPS) * 100), 95);
        setProgress(pct, data.msg);
        addEntry('step', data.msg);
      } else if (data.type === 'ok') {
        addEntry('ok', data.msg);
      } else if (data.type === 'warn') {
        addEntry('warn', data.msg);
      } else if (data.type === 'error') {
        addEntry('error', data.msg);
        dot.className     = 'error';
        statusT.textContent = 'Error during install';
      } else if (data.type === 'done') {
        setProgress(100, 'Install complete!');
        dot.className       = 'done';
        statusT.textContent = 'Install complete';
        var card = document.getElementById('url-card');
        card.classList.add('visible');
        document.getElementById('api-url').textContent    = data.apiUrl    || 'See terminal output';
        document.getElementById('dash-url').textContent   = data.dashUrl   || 'See terminal output';
        document.getElementById('health-url').textContent = data.healthUrl || 'See terminal output';
        var btn = document.getElementById('open-btn');
        if (data.dashUrl) btn.href = data.dashUrl;
        es.close();
      } else {
        addEntry('info', data.msg);
      }
    };

    es.onerror = function () {
      addEntry('warn', 'Connection to install server closed (install may be done).');
      es.close();
    };
  }());
</script>
</body>
</html>`;
/* eslint-enable */

// ─── Server ───────────────────────────────────────────────────────────────────

export function startDeployUI(port = 3001) {
  return new Promise((resolve) => {
    _server = http.createServer((req, res) => {
      if (req.url === '/events') {
        res.writeHead(200, {
          'Content-Type':  'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection':    'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        // Replay all buffered events so late-joiners catch up
        for (const entry of _log) {
          res.write(`data: ${JSON.stringify(entry)}\n\n`);
        }
        if (_done) { res.end(); return; }
        _clients.push(res);
        req.on('close', () => {
          _clients = _clients.filter(c => c !== res);
        });
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(HTML);
      }
    });

    _server.listen(port, '127.0.0.1', () => {
      resolve(`http://localhost:${port}`);
    });
  });
}

function broadcast(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  _log.push(payload);
  for (const client of _clients) {
    try { client.write(data); } catch {}
  }
}

export function emitProgress(type, msg) {
  broadcast({ type, msg, ts: Date.now() });
}

export function finishDeployUI({ apiUrl, dashUrl, healthUrl } = {}) {
  _done = true;
  broadcast({ type: 'done', apiUrl, dashUrl, healthUrl, ts: Date.now() });
  setTimeout(() => {
    for (const client of _clients) { try { client.end(); } catch {} }
    _clients = [];
    if (_server) _server.close();
  }, 4000);
}

// ─── Auto-open browser ────────────────────────────────────────────────────────

export function openBrowser(url) {
  try {
    const platform = os.platform();
    if (platform === 'darwin') {
      spawnSync('open', [url], { stdio: 'ignore', timeout: 3000 });
    } else if (platform === 'linux') {
      for (const cmd of ['xdg-open', 'sensible-browser', 'google-chrome', 'firefox']) {
        const r = spawnSync(cmd, [url], { stdio: 'ignore', timeout: 2000 });
        if (r.status === 0) break;
      }
    } else if (platform === 'win32') {
      spawnSync('cmd', ['/c', 'start', url], { stdio: 'ignore', timeout: 3000 });
    }
  } catch { /* UI is optional — never crash deploy */ }
}
