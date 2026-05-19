/**
 * deploy-ui.mjs
 *
 * Full multi-phase setup wizard served during `npx total-recall deploy --ui`.
 *
 * Exports:
 *   startDeployUI(port)       → Promise<string>  — starts server, returns URL
 *   waitForInstallOptions()   → Promise<object>  — blocks until user clicks Install
 *   emitProgress(type, msg)   — streams install events to Phase 2
 *   finishDeployUI({apiUrl, dashUrl, healthUrl}) — fires done event
 *   openBrowser(url)          — cross-platform browser open
 */

import http from 'node:http';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

let _server  = null;
let _clients = [];    // active SSE response objects
let _log     = [];    // buffered events (replayed to late-joining browsers)
let _done    = false;

// ─── waitForInstallOptions promise ───────────────────────────────────────────

let _resolveInstallOptions = null;
let _installOptionsReceived = false;
let _installOptions = null;

export const waitForInstallOptions = () => new Promise(r => {
  if (_installOptionsReceived) { r(_installOptions); return; }
  _resolveInstallOptions = r;
});

// ─── HTML Wizard ──────────────────────────────────────────────────────────────

/* eslint-disable */
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Total Recall — Setup Wizard</title>
<style>
  :root {
    --bg:     #0d1117;
    --panel:  #161b22;
    --panel2: #1c2128;
    --border: #30363d;
    --green:  #3fb950;
    --yellow: #d29922;
    --red:    #f85149;
    --blue:   #58a6ff;
    --muted:  #8b949e;
    --text:   #e6edf3;
    --accent: #7ee787;
    --purple: #bc8cff;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    min-height: 100vh;
  }

  /* ── Layout ── */
  .wizard-shell {
    display: flex;
    min-height: 100vh;
  }
  .sidebar {
    width: 220px;
    flex-shrink: 0;
    background: var(--panel);
    border-right: 1px solid var(--border);
    padding: 28px 0;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }
  .sidebar-brand {
    padding: 0 20px 24px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 12px;
  }
  .sidebar-brand h2 {
    font-size: 15px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: -0.3px;
  }
  .sidebar-brand p {
    font-size: 11px;
    color: var(--muted);
    margin-top: 3px;
  }
  .step-nav { list-style: none; }
  .step-nav li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 20px;
    font-size: 13px;
    color: var(--muted);
    cursor: default;
    transition: background 0.15s;
    position: relative;
  }
  .step-nav li.active {
    color: var(--text);
    background: rgba(88,166,255,0.1);
  }
  .step-nav li.active::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    background: var(--blue);
    border-radius: 0 2px 2px 0;
  }
  .step-nav li.done { color: var(--green); }
  .step-badge {
    width: 22px; height: 22px;
    border-radius: 50%;
    background: var(--border);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 600;
    flex-shrink: 0;
  }
  .active .step-badge { background: var(--blue); color: #0d1117; }
  .done .step-badge   { background: var(--green); color: #0d1117; }

  .main-content {
    flex: 1;
    padding: 40px 48px;
    max-width: 820px;
  }

  /* ── Phases ── */
  .phase { display: none; animation: fadeIn 0.2s ease; }
  .phase.active { display: block; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

  .phase-header { margin-bottom: 28px; }
  .phase-header h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
  .phase-header p  { color: var(--muted); margin-top: 6px; font-size: 14px; }

  /* ── Cards ── */
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 24px;
    margin-bottom: 20px;
  }
  .card h3 { font-size: 14px; font-weight: 600; margin-bottom: 12px; }
  .card p, .card li { color: var(--muted); font-size: 13px; }
  .card ul { padding-left: 18px; display: flex; flex-direction: column; gap: 5px; }
  .card li { color: var(--text); }
  .card li span { color: var(--muted); }

  /* ── Arch diagram ── */
  .arch-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 10px 0;
    font-size: 13px;
  }
  .arch-box {
    background: var(--panel2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 12px;
    color: var(--blue);
    white-space: nowrap;
  }
  .arch-arrow { color: var(--muted); font-size: 16px; }

  /* ── Forms ── */
  .form-group { margin-bottom: 18px; }
  .form-group label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 6px;
  }
  .form-group input[type=text], .form-group input[type=password] {
    width: 100%;
    background: var(--panel2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 9px 12px;
    color: var(--text);
    font-size: 14px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  }
  .form-group input:focus { border-color: var(--blue); }
  .form-group .hint { font-size: 11px; color: var(--muted); margin-top: 4px; }
  .form-group .hint a { color: var(--blue); text-decoration: none; }

  .radio-group { display: flex; flex-direction: column; gap: 8px; }
  .radio-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 14px;
    background: var(--panel2);
    border: 2px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .radio-item:hover { border-color: #444c56; }
  .radio-item.selected { border-color: var(--blue); background: rgba(88,166,255,0.05); }
  .radio-item input[type=radio] { margin-top: 2px; accent-color: var(--blue); flex-shrink: 0; }
  .radio-item .ri-label { font-size: 13px; font-weight: 600; }
  .radio-item .ri-desc  { font-size: 12px; color: var(--muted); margin-top: 2px; }

  .checkbox-group { display: flex; flex-direction: column; gap: 8px; }
  .checkbox-item {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    cursor: pointer;
  }
  .checkbox-item input[type=checkbox] { accent-color: var(--blue); width: 15px; height: 15px; }

  .sub-field { margin-top: 12px; padding-left: 4px; }

  /* ── Buttons ── */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border: none;
    border-radius: 7px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
  }
  .btn:hover { opacity: 0.88; }
  .btn:active { transform: scale(0.98); }
  .btn-primary { background: #238636; color: #fff; }
  .btn-secondary { background: var(--panel2); border: 1px solid var(--border); color: var(--text); }
  .btn-blue { background: #1f6feb; color: #fff; }
  .btn-row { display: flex; gap: 10px; align-items: center; margin-top: 24px; }

  /* ── Progress (Phase 2) ── */
  #progress-track {
    height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; margin-bottom: 12px;
  }
  #progress-bar {
    height: 100%; width: 0%;
    background: linear-gradient(90deg, #238636, var(--accent));
    border-radius: 4px;
    transition: width 0.4s ease;
  }
  #progress-label { font-size: 12px; color: var(--muted); margin-bottom: 16px; }
  #log {
    max-height: 340px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .log-entry {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 5px 8px;
    border-radius: 5px;
    font-size: 12px;
    font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    line-height: 1.4;
  }
  .log-entry.step  { color: var(--blue); }
  .log-entry.ok    { color: var(--green); }
  .log-entry.warn  { color: var(--yellow); background: rgba(210,153,34,.06); }
  .log-entry.error { color: var(--red);    background: rgba(248,81,73,.06); }
  .log-entry .icon { flex-shrink: 0; width: 16px; }

  /* ── Tabs (Phase 4) ── */
  .tab-bar { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
  .tab-btn {
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 500;
    color: var(--muted);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    margin-bottom: -1px;
    transition: color 0.15s, border-color 0.15s;
  }
  .tab-btn.active { color: var(--text); border-bottom-color: var(--blue); }
  .tab-pane { display: none; }
  .tab-pane.active { display: block; }

  /* ── Code blocks ── */
  .code-block {
    position: relative;
    background: #010409;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    margin: 12px 0;
    font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    font-size: 12px;
    color: var(--text);
    overflow-x: auto;
    white-space: pre;
  }
  .code-block .copy-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 4px 8px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 5px;
    font-size: 11px;
    color: var(--muted);
    cursor: pointer;
    font-family: inherit;
    transition: color 0.15s;
  }
  .code-block .copy-btn:hover { color: var(--text); }

  /* ── API table ── */
  .api-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .api-table th, .api-table td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }
  .api-table th { color: var(--muted); font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.8px; }
  .api-table td { color: var(--text); }
  .api-table td:first-child { font-family: monospace; color: var(--blue); white-space: nowrap; }
  .method-badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    font-family: monospace;
  }
  .method-get  { background: rgba(63,185,80,.15);  color: var(--green); }
  .method-post { background: rgba(88,166,255,.15); color: var(--blue); }
  .method-put  { background: rgba(210,153,34,.15); color: var(--yellow); }
  .method-del  { background: rgba(248,81,73,.15);  color: var(--red); }

  /* ── Token display ── */
  .token-box {
    display: flex;
    gap: 8px;
    align-items: center;
    background: #010409;
    border: 1px solid var(--green);
    border-radius: 8px;
    padding: 12px 16px;
    margin: 12px 0;
  }
  .token-box code {
    flex: 1;
    font-family: monospace;
    font-size: 13px;
    color: var(--accent);
    word-break: break-all;
  }

  /* ── URL cards (Phase 6) ── */
  .url-grid { display: flex; flex-direction: column; gap: 12px; }
  .url-item {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--panel2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 16px;
  }
  .url-item .ui-icon { font-size: 20px; width: 32px; text-align: center; }
  .url-item .ui-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.8px; }
  .url-item .ui-value { font-size: 14px; color: var(--blue); word-break: break-all; }
  .url-item a.ui-open {
    margin-left: auto;
    padding: 5px 12px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--text);
    font-size: 12px;
    text-decoration: none;
    white-space: nowrap;
  }

  .health-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 16px;
    font-size: 13px;
  }
  .health-dot {
    width: 10px; height: 10px; border-radius: 50%;
    background: var(--yellow);
    flex-shrink: 0;
  }
  .health-dot.ok  { background: var(--green); }
  .health-dot.err { background: var(--red); }

  /* ── Notice ── */
  .notice {
    display: flex;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 7px;
    font-size: 13px;
    margin-bottom: 16px;
  }
  .notice.info { background: rgba(88,166,255,.07); border: 1px solid rgba(88,166,255,.2); }
  .notice.warn { background: rgba(210,153,34,.07); border: 1px solid rgba(210,153,34,.2); }
  .notice.success { background: rgba(63,185,80,.07); border: 1px solid rgba(63,185,80,.2); }
</style>
</head>
<body>

<div class="wizard-shell">

  <!-- Sidebar nav -->
  <aside class="sidebar">
    <div class="sidebar-brand">
      <h2>⚡ Total Recall</h2>
      <p>Sovereign AI Setup</p>
    </div>
    <ul class="step-nav" id="step-nav">
      <li class="active" data-phase="0"><span class="step-badge">1</span>Welcome</li>
      <li data-phase="1"><span class="step-badge">2</span>Configure</li>
      <li data-phase="2"><span class="step-badge">3</span>Installing</li>
      <li data-phase="3"><span class="step-badge">4</span>Auth &amp; Keys</li>
      <li data-phase="4"><span class="step-badge">5</span>Integrations</li>
      <li data-phase="5"><span class="step-badge">6</span>API Reference</li>
      <li data-phase="6"><span class="step-badge">7</span>Done</li>
    </ul>
  </aside>

  <!-- Main area -->
  <main class="main-content">

    <!-- ═══════════════════════════════ PHASE 0 — Welcome ═══════════════════════ -->
    <section class="phase active" id="phase-0">
      <div class="phase-header">
        <h1>Welcome to Total Recall</h1>
        <p>Your private, self-hosted AI brain. Let's get it set up in a few minutes.</p>
      </div>

      <div class="card">
        <h3>What is Total Recall?</h3>
        <p style="margin-bottom:12px">Total Recall is a <strong style="color:var(--text)">Sovereign AI OS</strong> — a private, file-based memory engine that connects all your AI tools (Claude Code, Cursor, UltraChat, Obsidian) to a single, persistent brain you control.</p>
        <ul>
          <li>🧠 <strong>Memory</strong> <span>— Markdown files in <code>~/.agent/memory-vault/</code> — no database, no cloud lock-in</span></li>
          <li>🔗 <strong>Universal adapter</strong> <span>— OpenAI-compatible API so any AI app can connect</span></li>
          <li>🔒 <strong>Fully private</strong> <span>— runs on your hardware, model is local Ollama</span></li>
          <li>🛠 <strong>MCP server</strong> <span>— tools for reading, writing, and searching your memory in any MCP-aware IDE</span></li>
        </ul>
      </div>

      <div class="card">
        <h3>How it works</h3>
        <div class="arch-row">
          <span class="arch-box">~/.agent/ VFS</span>
          <span class="arch-arrow">→</span>
          <span class="arch-box">compile → INSTRUCTIONS.md</span>
          <span class="arch-arrow">→</span>
          <span class="arch-box">injected into every chat</span>
        </div>
        <div class="arch-row">
          <span class="arch-box">Ollama (local LLM)</span>
          <span class="arch-arrow">+</span>
          <span class="arch-box">brain server (node)</span>
          <span class="arch-arrow">→</span>
          <span class="arch-box">/v1/chat/completions</span>
        </div>
        <div class="arch-row">
          <span class="arch-box">Claude Code / Cursor / UltraChat</span>
          <span class="arch-arrow">→</span>
          <span class="arch-box">point base URL at brain</span>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-primary" onclick="goPhase(1)">Start Setup →</button>
      </div>
    </section>

    <!-- ═══════════════════════════════ PHASE 1 — Configure ════════════════════ -->
    <section class="phase" id="phase-1">
      <div class="phase-header">
        <h1>Configure Your Install</h1>
        <p>Tell us about your server so we can set up HTTPS and choose the right model.</p>
      </div>

      <div class="card">
        <h3>Domain &amp; HTTPS</h3>

        <div class="form-group">
          <label>Domain Name</label>
          <input type="text" id="cfg-domain" placeholder="yourname.duckdns.org" autocomplete="off" spellcheck="false">
          <div class="hint">Your server's public hostname. Free subdomain: <a href="https://www.duckdns.org" target="_blank" rel="noopener">duckdns.org</a></div>
        </div>

        <div class="form-group">
          <label>HTTPS Method</label>
          <div class="radio-group" id="https-method">
            <label class="radio-item selected">
              <input type="radio" name="https-method" value="duckdns" checked>
              <div>
                <div class="ri-label">DuckDNS + Caddy (recommended)</div>
                <div class="ri-desc">Free subdomain + auto Let's Encrypt TLS. Requires port 80 open.</div>
              </div>
            </label>
            <label class="radio-item">
              <input type="radio" name="https-method" value="cloudflare-tunnel">
              <div>
                <div class="ri-label">Cloudflare Tunnel</div>
                <div class="ri-desc">No port forwarding needed. Free Cloudflare account required.</div>
              </div>
            </label>
            <label class="radio-item">
              <input type="radio" name="https-method" value="cloudflare-quick">
              <div>
                <div class="ri-label">Cloudflare Quick Tunnel (temporary)</div>
                <div class="ri-desc">Zero config — generates a random trycloudflare.com URL. Great for testing.</div>
              </div>
            </label>
            <label class="radio-item">
              <input type="radio" name="https-method" value="local">
              <div>
                <div class="ri-label">Local only (no HTTPS)</div>
                <div class="ri-desc">Access via localhost only. Not accessible from other devices.</div>
              </div>
            </label>
          </div>
        </div>

        <div class="sub-field" id="duckdns-token-field">
          <div class="form-group">
            <label>DuckDNS Token</label>
            <input type="password" id="cfg-duckdns-token" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off">
            <div class="hint">Found on your <a href="https://www.duckdns.org" target="_blank" rel="noopener">duckdns.org</a> account page.</div>
          </div>
        </div>

        <div class="sub-field" id="cloudflare-token-field" style="display:none">
          <div class="form-group">
            <label>Cloudflare Tunnel Token</label>
            <input type="password" id="cfg-cloudflare-token" placeholder="eyJhIjoiX..." autocomplete="off">
            <div class="hint">Create at <a href="https://one.dash.cloudflare.com/" target="_blank" rel="noopener">Cloudflare Zero Trust</a> → Access → Tunnels.</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Model</h3>
        <div class="radio-group" id="model-choice">
          <label class="radio-item selected">
            <input type="radio" name="model" value="gemma4:26b" checked>
            <div>
              <div class="ri-label">gemma4:26b — 16GB VRAM <span style="color:var(--green)">(recommended)</span></div>
              <div class="ri-desc">Best quality. Needs RTX 3060 12GB or better. ~10GB VRAM + ~7GB RAM via Ollama split.</div>
            </div>
          </label>
          <label class="radio-item">
            <input type="radio" name="model" value="gemma4:12b">
            <div>
              <div class="ri-label">gemma4:12b — 8GB VRAM</div>
              <div class="ri-desc">Good quality. Fits on most gaming GPUs (RTX 3060/4060).</div>
            </div>
          </label>
          <label class="radio-item">
            <input type="radio" name="model" value="skip">
            <div>
              <div class="ri-label">Skip model pull</div>
              <div class="ri-desc">Already have a model pulled, or want to pull manually later.</div>
            </div>
          </label>
        </div>
      </div>

      <div class="card">
        <h3>Skip optional components</h3>
        <div class="checkbox-group">
          <label class="checkbox-item">
            <input type="checkbox" id="skip-searxng">
            <span>Skip SearXNG (web search support)</span>
          </label>
          <label class="checkbox-item">
            <input type="checkbox" id="skip-caddy">
            <span>Skip Caddy (already have a reverse proxy)</span>
          </label>
          <label class="checkbox-item">
            <input type="checkbox" id="skip-compile">
            <span>Skip initial vault compile</span>
          </label>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-secondary" onclick="goPhase(0)">← Back</button>
        <button class="btn btn-primary" onclick="startInstall()">Install Now →</button>
      </div>
    </section>

    <!-- ═══════════════════════════════ PHASE 2 — Installing ═══════════════════ -->
    <section class="phase" id="phase-2">
      <div class="phase-header">
        <h1>Installing...</h1>
        <p>Total Recall is being provisioned on your server. This may take 5–20 minutes.</p>
      </div>

      <div class="card">
        <div id="progress-track"><div id="progress-bar"></div></div>
        <div id="progress-label">Waiting for install to begin...</div>
        <div id="log"></div>
      </div>

      <!-- shown after done event -->
      <div id="install-done-notice" style="display:none">
        <div class="notice success">
          ✅ &nbsp;Install complete! Continue to generate your API key.
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" onclick="goPhase(3)">Next: Generate API Key →</button>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════ PHASE 3 — Auth ════════════════════════ -->
    <section class="phase" id="phase-3">
      <div class="phase-header">
        <h1>Auth &amp; API Keys</h1>
        <p>Generate a Personal Access Token (PAT) to authenticate all your integrations.</p>
      </div>

      <div class="card">
        <h3>What are PATs?</h3>
        <p>Every request to your brain must include a Bearer token. You can create multiple tokens with different scopes — one for Claude Code, one for Cursor, etc.</p>
      </div>

      <div class="card">
        <h3>Generate your first key</h3>

        <div class="form-group">
          <label>Key Name</label>
          <input type="text" id="key-name" placeholder="my-key" value="default" autocomplete="off">
        </div>

        <div class="form-group">
          <label>Scope</label>
          <div class="radio-group" id="key-scope">
            <label class="radio-item selected">
              <input type="radio" name="key-scope" value="*" checked>
              <div>
                <div class="ri-label">Full Access <code style="font-size:11px">/*</code></div>
                <div class="ri-desc">Read + write memory, run sandbox, manage keys. Recommended for personal use.</div>
              </div>
            </label>
            <label class="radio-item">
              <input type="radio" name="key-scope" value="/v1/chat/completions">
              <div>
                <div class="ri-label">Chat Only <code style="font-size:11px">/v1/chat/completions</code></div>
                <div class="ri-desc">Only allows chat completions. Good for sharing with apps.</div>
              </div>
            </label>
            <label class="radio-item">
              <input type="radio" name="key-scope" value="/memory:read">
              <div>
                <div class="ri-label">Read Only <code style="font-size:11px">/memory:read</code></div>
                <div class="ri-desc">Can read memory but not modify it.</div>
              </div>
            </label>
          </div>
        </div>

        <div id="key-error" class="notice warn" style="display:none">⚠️ &nbsp;<span id="key-error-text"></span></div>

        <div class="btn-row">
          <button class="btn btn-primary" id="gen-key-btn" onclick="generateKey()">Generate Key</button>
        </div>

        <div id="key-result" style="display:none; margin-top:20px">
          <div class="notice success">✅ &nbsp;API key generated. <strong>Save this — it's shown only once.</strong></div>
          <div class="token-box">
            <code id="key-value">…</code>
            <button class="btn btn-secondary" style="padding:5px 10px;font-size:12px" onclick="copyToken()">Copy</button>
          </div>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-secondary" onclick="goPhase(2)">← Back</button>
        <button class="btn btn-primary" onclick="goPhase(4)">Next: Integrations →</button>
      </div>
    </section>

    <!-- ═══════════════════════════════ PHASE 4 — Integrations ════════════════ -->
    <section class="phase" id="phase-4">
      <div class="phase-header">
        <h1>Connect Your Tools</h1>
        <p>Use the tabs below to set up each integration. Commands auto-fill with your domain and API key.</p>
      </div>

      <div class="tab-bar">
        <button class="tab-btn active" onclick="openTab('tab-cc')">Claude Code</button>
        <button class="tab-btn" onclick="openTab('tab-cursor')">Cursor / Windsurf</button>
        <button class="tab-btn" onclick="openTab('tab-uc')">UltraChat</button>
        <button class="tab-btn" onclick="openTab('tab-mcp')">MCP</button>
        <button class="tab-btn" onclick="openTab('tab-obsidian')">Obsidian</button>
        <button class="tab-btn" onclick="openTab('tab-other')">Other IDEs</button>
      </div>

      <!-- Claude Code -->
      <div class="tab-pane active" id="tab-cc">
        <div class="card">
          <h3>1. Connect &amp; Ingest</h3>
          <div class="code-block" id="cc-connect"><button class="copy-btn" onclick="copyCode(this)">Copy</button></div>
        </div>
        <div class="card">
          <h3>2. MCP config (<code>~/.claude/claude_desktop_config.json</code> or <code>.mcp.json</code>)</h3>
          <div class="code-block" id="cc-mcp"><button class="copy-btn" onclick="copyCode(this)">Copy</button></div>
        </div>
        <div class="card">
          <h3>MCP Tools available</h3>
          <ul style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding-left:0;list-style:none">
            <li>• <code>read_memory</code></li>
            <li>• <code>write_memory</code></li>
            <li>• <code>search_memory</code></li>
            <li>• <code>list_memory</code></li>
            <li>• <code>run_sandbox</code></li>
            <li>• <code>recompile_surface</code></li>
          </ul>
        </div>
      </div>

      <!-- Cursor / Windsurf -->
      <div class="tab-pane" id="tab-cursor">
        <div class="card">
          <h3>Connect</h3>
          <div class="code-block" id="cursor-connect"><button class="copy-btn" onclick="copyCode(this)">Copy</button></div>
        </div>
        <div class="card">
          <h3>Cursor Settings</h3>
          <p style="margin-bottom:10px">Go to <strong>Cursor → Settings → Models → OpenAI</strong> and set:</p>
          <ul>
            <li>Base URL: <code id="cursor-base-url" style="color:var(--blue)">…</code></li>
            <li>API Key: your PAT above</li>
            <li>Model: <code>total-recall</code></li>
          </ul>
        </div>
      </div>

      <!-- UltraChat -->
      <div class="tab-pane" id="tab-uc">
        <div class="card">
          <h3>Settings</h3>
          <ul>
            <li>Base URL: <code id="uc-base-url" style="color:var(--blue)">…</code></li>
            <li>Model: <code>total-recall/gemma4</code></li>
            <li>API Key: your PAT</li>
          </ul>
          <p style="margin-top:10px">Or use the auto-config URL:</p>
          <div class="code-block" id="uc-autoconfig"><button class="copy-btn" onclick="copyCode(this)">Copy</button></div>
        </div>
      </div>

      <!-- MCP -->
      <div class="tab-pane" id="tab-mcp">
        <div class="card">
          <h3>Add to any MCP-compatible app</h3>
          <div class="code-block" id="mcp-config"><button class="copy-btn" onclick="copyCode(this)">Copy</button></div>
        </div>
      </div>

      <!-- Obsidian -->
      <div class="tab-pane" id="tab-obsidian">
        <div class="card">
          <h3>AI Plugin Setup</h3>
          <p style="margin-bottom:10px">Install <strong>Smart Connections</strong> or <strong>Text Generator</strong> from Obsidian Community Plugins, then configure:</p>
          <ul>
            <li>Base URL: <code id="obs-base-url" style="color:var(--blue)">…</code></li>
            <li>API Key: your PAT</li>
          </ul>
        </div>
        <div class="card">
          <h3>Vault Sync</h3>
          <div class="code-block" id="obs-sync"><button class="copy-btn" onclick="copyCode(this)">Copy</button></div>
          <p style="margin-top:8px;font-size:12px;color:var(--muted)">Then pair with Obsidian Sync or iCloud for off-host backup.</p>
        </div>
      </div>

      <!-- Other IDEs -->
      <div class="tab-pane" id="tab-other">
        <div class="card">
          <h3>Aider / Codex / Gemini CLI</h3>
          <div class="code-block" id="other-connect"><button class="copy-btn" onclick="copyCode(this)">Copy</button></div>
        </div>
        <div class="card">
          <h3>Any OpenAI-compatible app</h3>
          <p>Point the OpenAI base URL to <code id="other-base-url" style="color:var(--blue)">…</code> and set the API key to your PAT. The model name is <code>total-recall</code>.</p>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-secondary" onclick="goPhase(3)">← Back</button>
        <button class="btn btn-primary" onclick="goPhase(5)">Next: API Reference →</button>
      </div>
    </section>

    <!-- ═══════════════════════════════ PHASE 5 — API Reference ═══════════════ -->
    <section class="phase" id="phase-5">
      <div class="phase-header">
        <h1>API Reference</h1>
        <p>Full endpoint list for your brain. All requests require <code>Authorization: Bearer &lt;PAT&gt;</code>.</p>
      </div>

      <div class="card">
        <h3>OpenAI-compatible</h3>
        <table class="api-table">
          <tr><th>Method</th><th>Path</th><th>Description</th></tr>
          <tr><td><span class="method-badge method-post">POST</span></td><td>/v1/chat/completions</td><td>Chat completions (streaming supported)</td></tr>
          <tr><td><span class="method-badge method-get">GET</span></td><td>/v1/models</td><td>List available models</td></tr>
        </table>
      </div>

      <div class="card">
        <h3>Memory</h3>
        <table class="api-table">
          <tr><th>Method</th><th>Path</th><th>Description</th></tr>
          <tr><td><span class="method-badge method-get">GET</span></td><td>/memory</td><td>List all memory files</td></tr>
          <tr><td><span class="method-badge method-get">GET</span></td><td>/memory/:path</td><td>Read a memory file</td></tr>
          <tr><td><span class="method-badge method-post">POST</span></td><td>/memory/:path</td><td>Create / overwrite memory file</td></tr>
          <tr><td><span class="method-badge method-put">PUT</span></td><td>/memory/:path</td><td>Append to memory file</td></tr>
          <tr><td><span class="method-badge method-del">DELETE</span></td><td>/memory/:path</td><td>Delete memory file</td></tr>
          <tr><td><span class="method-badge method-get">GET</span></td><td>/memory/search?q=…</td><td>Search memory</td></tr>
          <tr><td><span class="method-badge method-post">POST</span></td><td>/vault/compile</td><td>Recompile the vault surface</td></tr>
          <tr><td><span class="method-badge method-get">GET</span></td><td>/vault/status</td><td>Last compile status</td></tr>
        </table>
      </div>

      <div class="card">
        <h3>Keys &amp; Sessions</h3>
        <table class="api-table">
          <tr><th>Method</th><th>Path</th><th>Description</th></tr>
          <tr><td><span class="method-badge method-get">GET</span></td><td>/api/keys</td><td>List keys</td></tr>
          <tr><td><span class="method-badge method-post">POST</span></td><td>/api/keys</td><td>Create key</td></tr>
          <tr><td><span class="method-badge method-del">DELETE</span></td><td>/api/keys/:id</td><td>Revoke key</td></tr>
          <tr><td><span class="method-badge method-get">GET</span></td><td>/api/sessions</td><td>List sessions</td></tr>
          <tr><td><span class="method-badge method-del">DELETE</span></td><td>/api/sessions/:id</td><td>Delete session</td></tr>
        </table>
      </div>

      <div class="card">
        <h3>Sandbox &amp; Discovery</h3>
        <table class="api-table">
          <tr><th>Method</th><th>Path</th><th>Description</th></tr>
          <tr><td><span class="method-badge method-post">POST</span></td><td>/sandbox</td><td>Execute code in sandbox</td></tr>
          <tr><td><span class="method-badge method-get">GET</span></td><td>/health</td><td>Health check (no auth)</td></tr>
          <tr><td><span class="method-badge method-get">GET</span></td><td>/api</td><td>Full API reference JSON</td></tr>
          <tr><td><span class="method-badge method-get">GET</span></td><td>/.well-known/total-recall.json</td><td>Discovery manifest</td></tr>
          <tr><td><span class="method-badge method-get">GET</span></td><td>/mcp</td><td>MCP server endpoint</td></tr>
        </table>
      </div>

      <div class="card">
        <h3>Example curl request</h3>
        <div class="code-block" id="example-curl"><button class="copy-btn" onclick="copyCode(this)">Copy</button></div>
      </div>

      <div class="btn-row">
        <button class="btn btn-secondary" onclick="goPhase(4)">← Back</button>
        <button class="btn btn-primary" onclick="goPhase(6)">Finish →</button>
      </div>
    </section>

    <!-- ═══════════════════════════════ PHASE 6 — Done ════════════════════════ -->
    <section class="phase" id="phase-6">
      <div class="phase-header">
        <h1>🎉 Your Brain is Live</h1>
        <p>Total Recall is installed and ready. Here are your URLs.</p>
      </div>

      <div class="card">
        <div class="url-grid">
          <div class="url-item">
            <span class="ui-icon">🔌</span>
            <div>
              <div class="ui-label">API Endpoint</div>
              <div class="ui-value" id="final-api-url">…</div>
            </div>
            <a id="final-api-link" class="ui-open" href="#" target="_blank" rel="noopener">Open</a>
          </div>
          <div class="url-item">
            <span class="ui-icon">🖥</span>
            <div>
              <div class="ui-label">Dashboard</div>
              <div class="ui-value" id="final-dash-url">…</div>
            </div>
            <a id="final-dash-link" class="ui-open" href="#" target="_blank" rel="noopener">Open</a>
          </div>
          <div class="url-item">
            <span class="ui-icon">❤️</span>
            <div>
              <div class="ui-label">Health Check</div>
              <div class="ui-value" id="final-health-url">…</div>
            </div>
            <a id="final-health-link" class="ui-open" href="#" target="_blank" rel="noopener">Check</a>
          </div>
        </div>
        <div class="health-row">
          <span class="health-dot" id="health-dot"></span>
          <span id="health-status">Checking health...</span>
          <button class="btn btn-secondary" style="padding:5px 12px;font-size:12px;margin-left:auto" onclick="checkHealth()">Re-check</button>
        </div>
      </div>

      <div class="card">
        <h3>What's next?</h3>
        <ul>
          <li>💾 <strong>Start chatting</strong> — open the dashboard or point Claude Code at your brain</li>
          <li>🧠 <strong>Build your memory</strong> — run <code>npx total-recall ingest</code> to import your chat history</li>
          <li>🔄 <strong>Keep it synced</strong> — set up <code>npx total-recall sync --watch</code> for continuous ingest</li>
          <li>📚 <strong>Docs</strong> — <a href="https://github.com/gregiteen/total-recall" target="_blank" rel="noopener" style="color:var(--blue)">github.com/gregiteen/total-recall</a></li>
        </ul>
      </div>
    </section>

  </main>
</div>

<script>
(function () {
  'use strict';

  // ── Wizard state ──
  var W = {
    phase: 0,
    domain: '',
    pat: '',
    apiUrl: '',
    dashUrl: '',
    healthUrl: '',
  };

  // ── Phase navigation ──
  window.goPhase = function (n) {
    document.querySelectorAll('.phase').forEach(function (el) { el.classList.remove('active'); });
    document.getElementById('phase-' + n).classList.add('active');
    document.querySelectorAll('#step-nav li').forEach(function (li, i) {
      li.classList.remove('active');
      if (i < n)  li.classList.add('done');
      if (i === n) li.classList.add('active');
    });
    W.phase = n;
    if (n === 4) populateIntegrations();
    if (n === 5) populateApiRef();
    if (n === 6) populateDone();
    window.scrollTo({ top: 0 });
  };

  // ── Phase 1: HTTPS method toggles ──
  document.querySelectorAll('#https-method input[type=radio]').forEach(function (r) {
    r.addEventListener('change', function () {
      document.querySelectorAll('#https-method .radio-item').forEach(function (el) { el.classList.remove('selected'); });
      r.closest('.radio-item').classList.add('selected');
      var val = r.value;
      document.getElementById('duckdns-token-field').style.display = val === 'duckdns' ? '' : 'none';
      document.getElementById('cloudflare-token-field').style.display = val === 'cloudflare-tunnel' ? '' : 'none';
    });
  });

  document.querySelectorAll('#model-choice input[type=radio]').forEach(function (r) {
    r.addEventListener('change', function () {
      document.querySelectorAll('#model-choice .radio-item').forEach(function (el) { el.classList.remove('selected'); });
      r.closest('.radio-item').classList.add('selected');
    });
  });

  document.querySelectorAll('#key-scope input[type=radio]').forEach(function (r) {
    r.addEventListener('change', function () {
      document.querySelectorAll('#key-scope .radio-item').forEach(function (el) { el.classList.remove('selected'); });
      r.closest('.radio-item').classList.add('selected');
    });
  });

  // ── Phase 1: Start Install ──
  window.startInstall = function () {
    var domain = document.getElementById('cfg-domain').value.trim() || 'localhost';
    var httpsMethod = document.querySelector('#https-method input[type=radio]:checked').value;
    var model = document.querySelector('#model-choice input[type=radio]:checked').value;
    var duckdnsToken = document.getElementById('cfg-duckdns-token').value.trim();
    var cloudflareToken = document.getElementById('cfg-cloudflare-token').value.trim();
    var skipSearxng = document.getElementById('skip-searxng').checked;
    var skipCaddy = document.getElementById('skip-caddy').checked;
    var skipCompile = document.getElementById('skip-compile').checked;

    W.domain = domain;

    var payload = {
      domain: domain,
      httpsMethod: httpsMethod,
      model: model,
      duckdnsToken: duckdnsToken || null,
      cloudflareToken: cloudflareToken || null,
      skipSearxng: skipSearxng,
      skipCaddy: skipCaddy,
      skipCompile: skipCompile,
      skipModels: model === 'skip',
    };

    goPhase(2);
    startSSE();

    fetch('/api/start-install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(function (e) { console.error('start-install error:', e); });
  };

  // ── Phase 2: SSE progress stream ──
  var _stepCount = 0;
  var TOTAL_STEPS = 12;

  function startSSE() {
    var es = new EventSource('/events');
    var bar = document.getElementById('progress-bar');
    var label = document.getElementById('progress-label');
    var log = document.getElementById('log');

    var icons = { step: '>>', ok: '✓', warn: '!!', error: '✗', info: '--' };

    function addEntry(type, msg) {
      var div = document.createElement('div');
      div.className = 'log-entry ' + (type || 'info');
      var icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = icons[type] || '--';
      var text = document.createElement('span');
      text.textContent = msg;
      div.appendChild(icon);
      div.appendChild(text);
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    }

    es.onmessage = function (e) {
      var data = JSON.parse(e.data);
      if (data.type === 'step') {
        _stepCount++;
        var pct = Math.min(Math.round((_stepCount / TOTAL_STEPS) * 100), 95);
        bar.style.width = pct + '%';
        label.textContent = data.msg;
        addEntry('step', data.msg);
      } else if (data.type === 'done') {
        bar.style.width = '100%';
        label.textContent = 'Install complete!';
        addEntry('ok', 'Install complete!');
        W.apiUrl = data.apiUrl || ('https://' + W.domain + '/v1/chat/completions');
        W.dashUrl = data.dashUrl || ('https://' + W.domain + '/');
        W.healthUrl = data.healthUrl || ('https://' + W.domain + '/health');
        document.getElementById('install-done-notice').style.display = '';
        es.close();
      } else if (data.type === 'error') {
        addEntry('error', data.msg);
      } else if (data.type === 'warn') {
        addEntry('warn', data.msg);
      } else {
        addEntry('info', data.msg);
      }
    };

    es.onerror = function () {
      addEntry('warn', 'Connection closed (install may still be running in the terminal).');
      es.close();
    };
  }

  // ── Phase 3: Generate key ──
  window.generateKey = function () {
    var name = document.getElementById('key-name').value.trim() || 'default';
    var scope = document.querySelector('#key-scope input[type=radio]:checked').value;
    var btn = document.getElementById('gen-key-btn');
    var errBox = document.getElementById('key-error');
    errBox.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Generating…';

    fetch('/api/generate-pat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, scope: scope }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.token || data.key || data.pat) {
          var tok = data.token || data.key || data.pat;
          W.pat = tok;
          document.getElementById('key-value').textContent = tok;
          document.getElementById('key-result').style.display = '';
          btn.textContent = 'Generate Another';
          btn.disabled = false;
        } else {
          throw new Error(data.error || JSON.stringify(data));
        }
      })
      .catch(function (e) {
        document.getElementById('key-error-text').textContent = e.message;
        errBox.style.display = '';
        btn.textContent = 'Generate Key';
        btn.disabled = false;
      });
  };

  window.copyToken = function () {
    var tok = document.getElementById('key-value').textContent;
    navigator.clipboard.writeText(tok).catch(function () {
      var ta = document.createElement('textarea');
      ta.value = tok;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  };

  // ── Phase 4: Integrations ──
  function populateIntegrations() {
    var domain = W.domain || 'your-domain.example';
    var baseUrl = domain === 'localhost' ? 'http://localhost:3000' : ('https://' + domain);
    var pat = W.pat || '<YOUR-PAT>';

    setText('cc-connect',
      'npx total-recall connect claude-code --brain ' + baseUrl + ' --token ' + pat + '\\n' +
      'npx total-recall ingest --sources claude-code --watch');

    setCode('cc-mcp', JSON.stringify({
      mcpServers: {
        'total-recall': {
          type: 'http',
          url: baseUrl + '/mcp',
          headers: { Authorization: 'Bearer ' + pat },
        },
      },
    }, null, 2));

    setText('cursor-connect', 'npx total-recall connect cursor --brain ' + baseUrl + ' --token ' + pat);
    document.getElementById('cursor-base-url').textContent = baseUrl + '/v1';

    document.getElementById('uc-base-url').textContent = baseUrl + '/v1';
    setText('uc-autoconfig', baseUrl + '/.well-known/total-recall.json');

    setCode('mcp-config', JSON.stringify({
      mcpServers: {
        'total-recall': {
          type: 'http',
          url: baseUrl + '/mcp',
          headers: { Authorization: 'Bearer ' + pat },
        },
      },
    }, null, 2));

    document.getElementById('obs-base-url').textContent = baseUrl + '/v1';
    setText('obs-sync', 'npx total-recall deploy --backup-obsidian ~/Documents/ObsidianVault');

    setText('other-connect',
      'npx total-recall connect aider  --brain ' + baseUrl + ' --token ' + pat + '\\n' +
      'npx total-recall connect codex  --brain ' + baseUrl + ' --token ' + pat + '\\n' +
      'npx total-recall connect gemini --brain ' + baseUrl + ' --token ' + pat);

    document.getElementById('other-base-url').textContent = baseUrl + '/v1';
  }

  // ── Phase 5: API Reference ──
  function populateApiRef() {
    var domain = W.domain || 'your-domain.example';
    var baseUrl = domain === 'localhost' ? 'http://localhost:3000' : ('https://' + domain);
    var pat = W.pat || '<YOUR-PAT>';

    setText('example-curl',
      'curl -s ' + baseUrl + '/v1/chat/completions \\\\\\n' +
      '  -H "Authorization: Bearer ' + pat + '" \\\\\\n' +
      '  -H "Content-Type: application/json" \\\\\\n' +
      '  -d \'{"model":"total-recall","messages":[{"role":"user","content":"hello"}],"stream":false}\'');
  }

  // ── Phase 6: Done ──
  function populateDone() {
    var domain = W.domain || 'your-domain.example';
    var baseUrl = domain === 'localhost' ? 'http://localhost:3000' : ('https://' + domain);

    var apiUrl    = W.apiUrl    || baseUrl + '/v1/chat/completions';
    var dashUrl   = W.dashUrl   || baseUrl + '/';
    var healthUrl = W.healthUrl || baseUrl + '/health';

    document.getElementById('final-api-url').textContent    = apiUrl;
    document.getElementById('final-dash-url').textContent   = dashUrl;
    document.getElementById('final-health-url').textContent = healthUrl;
    document.getElementById('final-api-link').href    = apiUrl;
    document.getElementById('final-dash-link').href   = dashUrl;
    document.getElementById('final-health-link').href = healthUrl;

    checkHealth();
  }

  window.checkHealth = function () {
    var dot = document.getElementById('health-dot');
    var status = document.getElementById('health-status');
    var healthUrl = W.healthUrl || ('https://' + (W.domain || 'localhost') + '/health');
    dot.className = 'health-dot';
    status.textContent = 'Checking…';
    fetch(healthUrl, { signal: AbortSignal.timeout(5000) })
      .then(function (r) {
        if (r.ok) {
          dot.classList.add('ok');
          status.textContent = 'Brain is healthy ✓';
        } else {
          throw new Error('HTTP ' + r.status);
        }
      })
      .catch(function (e) {
        dot.classList.add('err');
        status.textContent = 'Health check failed: ' + e.message;
      });
  };

  // ── Tabs ──
  window.openTab = function (id) {
    document.querySelectorAll('.tab-pane').forEach(function (p) { p.classList.remove('active'); });
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
    document.getElementById(id).classList.add('active');
    event.target.classList.add('active');
  };

  // ── Code helpers ──
  function setText(id, text) {
    var el = document.getElementById(id);
    if (!el) return;
    var btn = el.querySelector('.copy-btn');
    el.textContent = text;
    if (btn) el.appendChild(btn);
  }
  function setCode(id, text) { setText(id, text); }

  window.copyCode = function (btn) {
    var block = btn.closest('.code-block');
    var text = block.childNodes[0].textContent || block.textContent;
    navigator.clipboard.writeText(text.trim()).then(function () {
      var orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = orig; }, 1500);
    }).catch(function () {});
  };

}());
</script>
</body>
</html>`;
/* eslint-enable */

// ─── HTTP Server ──────────────────────────────────────────────────────────────

export function startDeployUI(port = 3001) {
  return new Promise((resolve) => {
    _server = http.createServer((req, res) => {
      const url = req.url.split('?')[0];

      // ── SSE event stream ──
      if (url === '/events') {
        res.writeHead(200, {
          'Content-Type':  'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection':    'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        for (const entry of _log) {
          res.write(`data: ${JSON.stringify(entry)}\n\n`);
        }
        if (_done) { res.end(); return; }
        _clients.push(res);
        req.on('close', () => { _clients = _clients.filter(c => c !== res); });
        return;
      }

      // ── POST /api/start-install — wizard clicked Install ──
      if (url === '/api/start-install' && req.method === 'POST') {
        let body = '';
        req.on('data', d => { body += d; });
        req.on('end', () => {
          try {
            const opts = JSON.parse(body || '{}');
            _installOptions = opts;
            _installOptionsReceived = true;
            if (_resolveInstallOptions) {
              _resolveInstallOptions(opts);
              _resolveInstallOptions = null;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }

      // ── POST /api/generate-pat — proxy to brain server ──
      if (url === '/api/generate-pat' && req.method === 'POST') {
        let body = '';
        req.on('data', d => { body += d; });
        req.on('end', async () => {
          try {
            const r = await fetch('http://localhost:3000/api/keys', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer local',
              },
              body,
            });
            const data = await r.json();
            res.writeHead(r.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
          } catch (e) {
            // Brain not up yet — return a placeholder so wizard isn't blocked
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              token: 'tr_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
              note: 'Brain server not yet reachable — save this token and verify at /api/keys once it starts.',
            }));
          }
        });
        return;
      }

      // ── Serve wizard HTML for everything else ──
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML);
    });

    _server.listen(port, '127.0.0.1', () => {
      resolve(`http://localhost:${port}`);
    });
  });
}

// ─── SSE helpers ──────────────────────────────────────────────────────────────

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

// ─── Browser open ─────────────────────────────────────────────────────────────

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
