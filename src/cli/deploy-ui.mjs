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

  /* ── IDE picker ── */
  .ide-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color .15s, background .15s;
    position: relative;
  }
  .ide-card:hover { border-color: var(--blue); background: rgba(88,166,255,.04); }
  .ide-card input[type=checkbox] { display: none; }
  .ide-card .ide-icon { font-size: 22px; flex-shrink: 0; }
  .ide-card .ide-name { font-weight: 600; font-size: 13px; }
  .ide-card .ide-desc { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .ide-card .ide-check { position: absolute; top: 10px; right: 10px; color: var(--green); font-size: 16px; display: none; }
  .ide-card.selected { border-color: var(--green); background: rgba(63,185,80,.06); }
  .ide-card.selected .ide-check { display: block; }
  .connect-result-line { padding: 2px 0; }
  .connect-result-line.ok  { color: var(--green); }
  .connect-result-line.err { color: var(--red); }
  .connect-result-line.info { color: var(--muted); }
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
      <li data-phase="1"><span class="step-badge">2</span>Where to Run</li>
      <li data-phase="2"><span class="step-badge">3</span>Installing</li>
      <li data-phase="3"><span class="step-badge">4</span>Auth &amp; Keys</li>
      <li data-phase="4"><span class="step-badge">5</span>Integrations</li>
      <li data-phase="5"><span class="step-badge">6</span>API Reference</li>
      <li data-phase="6"><span class="step-badge">7</span>Done</li>
      <li data-phase="7" style="margin-top:auto;border-top:1px solid var(--border);padding-top:12px"><span class="step-badge">⚙</span>Settings</li>
    </ul>
  </aside>

  <!-- Main area -->
  <main class="main-content">

    <!-- ═══════════════════════════════ PHASE 0 — Welcome ═══════════════════════ -->
    <section class="phase active" id="phase-0">
      <div class="phase-header">
        <h1>Welcome to Total Recall</h1>
        <p>Your own private AI that remembers everything — across every tool you use. Takes about 10 minutes to set up.</p>
      </div>

      <div class="card">
        <h3>What does it do?</h3>
        <p style="margin-bottom:14px">Total Recall gives your AI tools a <strong style="color:var(--text)">persistent memory</strong> — so Claude, Cursor, and any other AI always know who you are, what you're working on, and how you like things done. No cloud. No subscription. Yours.</p>
        <ul>
          <li>🧠 <strong>Remembers across sessions</strong> <span>— your preferences, projects, and decisions survive every new chat</span></li>
          <li>🔗 <strong>Works with every AI tool</strong> <span>— Claude Code, Cursor, Windsurf, Obsidian, any OpenAI-compatible app</span></li>
          <li>🔒 <strong>100% private</strong> <span>— runs on your hardware, never sent to any server you don't control</span></li>
          <li>⚡ <strong>Powered by gemma4</strong> <span>— Google's latest open-source model, free to run</span></li>
        </ul>
      </div>

      <div class="card">
        <h3>How it works</h3>
        <p style="color:var(--muted);font-size:13px;margin-bottom:14px">Your memory lives in plain text files on your machine. The AI reads them automatically at the start of every conversation.</p>
        <div class="arch-row">
          <span class="arch-box">📁 Your memory files</span>
          <span class="arch-arrow">→</span>
          <span class="arch-box">🧠 AI reads them</span>
          <span class="arch-arrow">→</span>
          <span class="arch-box">💬 Every chat is personalized</span>
        </div>
        <div class="arch-row" style="margin-top:10px">
          <span class="arch-box">Claude / Cursor / Obsidian</span>
          <span class="arch-arrow">→</span>
          <span class="arch-box">All connect to the same brain</span>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-primary" onclick="goPhase(1)">Let's Set It Up →</button>
      </div>
    </section>

    <!-- ═══════════════════════════════ PHASE 1 — Where to Run ══════════════════ -->
    <section class="phase" id="phase-1">
      <div class="phase-header">
        <h1>Where do you want to run your brain?</h1>
        <p>Pick the option that fits you. All three use the same model (gemma4) and have the same features.</p>
      </div>

      <div class="radio-group" id="deploy-target" style="margin-bottom:20px">

        <label class="radio-item" id="target-local-label">
          <input type="radio" name="deploy-target" value="local" id="target-local">
          <div style="flex:1">
            <div class="ri-label">🖥&nbsp; On this computer <span style="color:var(--green);font-size:11px;font-weight:400">(simplest — if this machine has 16 GB+ RAM)</span></div>
            <div class="ri-desc">Install right here. Works on Mac or PC, with or without a GPU. Ollama doesn't need to be pre-installed.</div>
            <div id="local-details" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
              <div class="notice info" style="margin-bottom:0">ℹ️ &nbsp;The installer will check your RAM, install Ollama if needed, download the gemma4 model (~10 GB), and start your brain — all automatically.</div>
              <div class="form-group" style="margin-top:14px;margin-bottom:0">
                <label>Public access (optional)</label>
                <div class="radio-group" id="local-access">
                  <label class="radio-item selected">
                    <input type="radio" name="local-access" value="local" checked>
                    <div><div class="ri-label">Local only</div><div class="ri-desc">Access from this computer only. Easiest.</div></div>
                  </label>
                  <label class="radio-item">
                    <input type="radio" name="local-access" value="cloudflare-quick">
                    <div><div class="ri-label">Share over internet (free Cloudflare URL)</div><div class="ri-desc">Reach your brain from your phone or other devices. Zero config, no account needed.</div></div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </label>

        <label class="radio-item" id="target-localnet-label">
          <input type="radio" name="deploy-target" value="localnet" id="target-localnet">
          <div style="flex:1">
            <div class="ri-label">🏠&nbsp; Another computer on my network <span style="color:var(--blue);font-size:11px;font-weight:400">(recommended for most users)</span></div>
            <div class="ri-desc">Mac Mini, iMac, gaming PC, or any always-on desktop on your home or office network. The brain runs there — you connect from anywhere.</div>
            <div id="localnet-details" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
              <div class="notice info" style="margin-bottom:12px">ℹ️ &nbsp;The wizard will connect to that computer and install everything automatically. You just need its IP address and username.</div>
              <div class="form-group" style="margin-bottom:10px">
                <label>IP address or hostname of that computer</label>
                <input type="text" id="cfg-localnet-host" placeholder="192.168.1.100  or  mac-mini.local" autocomplete="off" spellcheck="false">
                <div class="hint">On a Mac: Apple menu → System Settings → General → Sharing → look for the local hostname. On Windows: open Command Prompt, type <code>ipconfig</code>.</div>
              </div>
              <div class="form-group" style="margin-bottom:0">
                <label>Username on that computer</label>
                <input type="text" id="cfg-localnet-user" placeholder="greg" autocomplete="off" spellcheck="false">
                <div class="hint">The username you log in with. <strong>SSH must be enabled</strong> — on Mac: System Settings → General → Sharing → Remote Login → On.</div>
              </div>
            </div>
          </div>
        </label>

        <label class="radio-item" id="target-vastai-label">
          <input type="radio" name="deploy-target" value="vastai" id="target-vastai">
          <div style="flex:1">
            <div class="ri-label">☁️&nbsp; Rent a GPU in the cloud <span style="color:var(--muted);font-size:11px;font-weight:400">~$5/mo — no hardware needed</span></div>
            <div class="ri-desc">We rent a GPU server for you automatically. Good if you don't have a suitable computer at home. About $0.07/hour — pause it when not in use.</div>
            <div id="vastai-details" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
              <div class="notice info" style="margin-bottom:12px">ℹ️ &nbsp;<strong>What is Vast.ai?</strong> A marketplace where you rent GPU computers by the hour. We handle everything — you just paste your API key below.</div>
              <div class="form-group" style="margin-bottom:10px">
                <label>Step 1 — Create a free Vast.ai account</label>
                <p style="color:var(--muted);font-size:12px;margin-bottom:8px">Go to <a href="https://vast.ai" target="_blank" rel="noopener" style="color:var(--blue)">vast.ai</a>, sign up free, then add $10 credit (enough for ~6 weeks).</p>
              </div>
              <div class="form-group" style="margin-bottom:10px">
                <label>Step 2 — Get your API key</label>
                <p style="color:var(--muted);font-size:12px;margin-bottom:6px">Go to <a href="https://vast.ai/console/account" target="_blank" rel="noopener" style="color:var(--blue)">vast.ai/console/account</a> → scroll to <strong>API Key</strong> → copy it.</p>
                <input type="password" id="cfg-vastai-key" placeholder="Paste your Vast.ai API key here" autocomplete="off">
              </div>
              <div class="form-group" style="margin-bottom:0">
                <label>Step 3 — We do the rest</label>
                <p style="color:var(--muted);font-size:12px">Click "Provision &amp; Install" — we'll rent a GPU, run the installer, and pull the AI model. Takes about 10 minutes total.</p>
              </div>
            </div>
          </div>
        </label>

        <label class="radio-item" id="target-vps-label">
          <input type="radio" name="deploy-target" value="vps" id="target-vps">
          <div style="flex:1">
            <div class="ri-label">🌐&nbsp; Your own VPS or cloud server <span style="color:var(--muted);font-size:11px;font-weight:400">(advanced)</span></div>
            <div class="ri-desc">Hetzner, DigitalOcean, RunPod, or any Linux server you already have. Needs Ubuntu 22.04+ and ~16 GB RAM.</div>
            <div id="vps-details" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
              <div class="form-group" style="margin-bottom:10px">
                <label>SSH into your server and run this one command</label>
                <div class="code-block" style="margin:0"><button class="copy-btn" onclick="copyCode(this)">Copy</button>curl -fsSL https://raw.githubusercontent.com/gregiteen/total-recall/main/install.sh | bash</div>
              </div>
              <div class="notice info" style="margin-bottom:0">ℹ️ &nbsp;The installer handles Node.js, Ollama, the gemma4 model, HTTPS, and the brain server — everything from scratch.</div>
            </div>
          </div>
        </label>

      </div>

      <!-- Domain field — shown for VPS path only -->
      <div id="domain-section" style="display:none">
        <div class="card">
          <h3>Domain &amp; HTTPS <span style="font-weight:400;font-size:12px;color:var(--muted)">(optional — skip to get a free temporary URL)</span></h3>
          <div class="form-group" style="margin-bottom:12px">
            <label>Your domain name</label>
            <input type="text" id="cfg-domain" placeholder="mybrain.duckdns.org" autocomplete="off" spellcheck="false">
            <div class="hint">Leave blank for a free temporary Cloudflare URL. <a href="https://www.duckdns.org" target="_blank" rel="noopener">Get a free domain at duckdns.org →</a></div>
          </div>
          <div id="duckdns-token-field" style="display:none">
            <div class="form-group" style="margin-bottom:0">
              <label>DuckDNS Token</label>
              <input type="password" id="cfg-duckdns-token" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off">
              <div class="hint">Found on your <a href="https://www.duckdns.org" target="_blank" rel="noopener">duckdns.org</a> account page.</div>
            </div>
          </div>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-secondary" onclick="goPhase(0)">← Back</button>
        <button class="btn btn-primary" id="phase1-next-btn" onclick="startInstall()" style="display:none">Install on this computer →</button>
        <button class="btn btn-primary" id="phase1-vastai-btn" onclick="provisionVastAI()" style="display:none">☁️ Provision &amp; Install →</button>
        <button class="btn btn-blue" id="phase1-continue-btn" onclick="goPhase(2)" style="display:none">My VPS is ready — Continue →</button>
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

      <div style="height:24px"></div>

      <div class="card">
        <h3>🔍 Web Search for Automatic Research <span style="font-weight:400;font-size:13px;color:var(--muted);margin-left:8px">optional</span></h3>
        <p style="color:var(--muted);font-size:13px;margin-bottom:8px">
          Total Recall runs in the background and automatically looks things up on the web — finding relevant articles, documentation, and facts related to what you're working on, and saving them to your memory.
        </p>
        <p style="color:var(--muted);font-size:13px;margin-bottom:20px">
          <strong style="color:var(--text)">You don't need a key to get started.</strong> Without one, it uses DuckDuckGo and Wikipedia (both free, no sign-up). Adding any one of the providers below gives it full web search results. Pick whichever you prefer — they're all roughly equivalent in quality.
        </p>

        <div style="display:grid;gap:14px">

          <div style="border:1px solid var(--border);border-radius:8px;padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <strong>Tavily</strong>
              <span style="font-size:11px;background:var(--green);color:#000;padding:2px 7px;border-radius:10px">Best for AI agents</span>
            </div>
            <p style="font-size:12px;color:var(--muted);margin-bottom:8px">Designed specifically for AI research — returns clean, readable text from each page instead of just a link and a short description. Saves time. 1,000 free searches/month.</p>
            <input type="password" id="tavily-key" placeholder="tvly-…" autocomplete="off" style="font-family:monospace;width:100%">
            <div style="margin-top:5px;font-size:11px;color:var(--muted)">Get a free key at <a href="https://tavily.com" target="_blank" style="color:var(--blue)">tavily.com</a></div>
          </div>

          <div style="border:1px solid var(--border);border-radius:8px;padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <strong>Brave Search</strong>
              <span style="font-size:11px;color:var(--muted)">~1,000 free queries/month</span>
            </div>
            <p style="font-size:12px;color:var(--muted);margin-bottom:8px">Independent web search (not Google). Returns a list of URLs and short descriptions for each result. Solid general-purpose choice.</p>
            <input type="password" id="brave-key" placeholder="BSA…" autocomplete="off" style="font-family:monospace;width:100%">
            <div style="margin-top:5px;font-size:11px;color:var(--muted)">Get a free key at <a href="https://brave.com/search/api/" target="_blank" style="color:var(--blue)">brave.com/search/api</a></div>
          </div>

          <div style="border:1px solid var(--border);border-radius:8px;padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <strong>Exa</strong>
              <span style="font-size:11px;color:var(--muted)">~1,000 free queries/month</span>
            </div>
            <p style="font-size:12px;color:var(--muted);margin-bottom:8px">Finds pages by meaning rather than exact keywords — good at surfacing recent articles and blog posts that are thematically relevant, not just keyword matches.</p>
            <input type="password" id="exa-key" placeholder="…" autocomplete="off" style="font-family:monospace;width:100%">
            <div style="margin-top:5px;font-size:11px;color:var(--muted)">Get a free key at <a href="https://exa.ai" target="_blank" style="color:var(--blue)">exa.ai</a></div>
          </div>

          <div style="border:1px solid var(--border);border-radius:8px;padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <strong>Serper</strong>
              <span style="font-size:11px;color:var(--muted)">2,500 free credits (one-time)</span>
            </div>
            <p style="font-size:12px;color:var(--muted);margin-bottom:8px">Returns Google Search results. The free credits are a one-time trial rather than a monthly allowance, so it's best used as a last fallback or for occasional use.</p>
            <input type="password" id="serper-key" placeholder="…" autocomplete="off" style="font-family:monospace;width:100%">
            <div style="margin-top:5px;font-size:11px;color:var(--muted)">Get a free key at <a href="https://serper.dev" target="_blank" style="color:var(--blue)">serper.dev</a></div>
          </div>

        </div>

        <div style="margin-top:14px;padding:10px 12px;background:rgba(255,255,255,0.04);border-radius:6px;font-size:12px;color:var(--muted)">
          ⏱ <strong style="color:var(--text)">Daily limit:</strong> To stay within free tiers, the engine makes at most <strong style="color:var(--text)">50 paid searches per day</strong> by default (~1,500/month). When that's used up it switches back to DuckDuckGo for the rest of the day. You can change this limit anytime in <code>~/.agent/config/research.yml</code>.
        </div>

        <div id="search-save-result" class="notice" style="display:none;margin-top:14px"></div>

        <div class="btn-row" style="margin-top:16px">
          <button class="btn btn-secondary" onclick="saveSearchKeys()">Save Search Keys</button>
          <span style="font-size:12px;color:var(--muted);align-self:center">Saved to ~/.agent/config/research.yml</span>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-secondary" onclick="goPhase(2)">← Back</button>
        <button class="btn btn-primary" onclick="goPhase(4)">Next: Integrations →</button>
      </div>
    </section>

    <!-- ═══════════════════════════════ PHASE 4 — Integrations ════════════════ -->
    <!-- ═══════════════════════════════ PHASE 4 — Connect Your Tools ═══════════ -->
    <section class="phase" id="phase-4">
      <div class="phase-header">
        <h1>Connect Your Tools</h1>
        <p>Select every IDE and agent you use. Total Recall will wire them up automatically — no manual config needed.</p>
      </div>

      <div class="card">
        <h3 style="margin-bottom:14px">Which IDEs and coding agents do you use?</h3>
        <p style="color:var(--muted);font-size:13px;margin-bottom:18px">Select all that apply. Total Recall's relay will watch their session logs and compile your memory automatically.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px" id="ide-grid">
          <label class="ide-card" id="ide-claude-code">
            <input type="checkbox" value="claude-code" onchange="toggleIde(this)">
            <span class="ide-icon">🤖</span>
            <div>
              <div class="ide-name">Claude Code</div>
              <div class="ide-desc">Anthropic's coding agent — CLAUDE.md + auto memory</div>
            </div>
            <span class="ide-check">✓</span>
          </label>
          <label class="ide-card" id="ide-codex">
            <input type="checkbox" value="codex" onchange="toggleIde(this)">
            <span class="ide-icon">🟢</span>
            <div>
              <div class="ide-name">Codex (OpenAI)</div>
              <div class="ide-desc">OpenAI's CLI agent — AGENTS.md + memories</div>
            </div>
            <span class="ide-check">✓</span>
          </label>
          <label class="ide-card" id="ide-cursor">
            <input type="checkbox" value="cursor" onchange="toggleIde(this)">
            <span class="ide-icon">🖱️</span>
            <div>
              <div class="ide-name">Cursor</div>
              <div class="ide-desc">.cursor/rules/ — modular scoped rules</div>
            </div>
            <span class="ide-check">✓</span>
          </label>
          <label class="ide-card" id="ide-antigravity">
            <input type="checkbox" value="antigravity" onchange="toggleIde(this)">
            <span class="ide-icon">⚡</span>
            <div>
              <div class="ide-name">Antigravity</div>
              <div class="ide-desc">Google DeepMind — AGENTS.md + Knowledge Items</div>
            </div>
            <span class="ide-check">✓</span>
          </label>
          <label class="ide-card" id="ide-vscode">
            <input type="checkbox" value="vscode" onchange="toggleIde(this)">
            <span class="ide-icon">💙</span>
            <div>
              <div class="ide-name">VS Code Copilot</div>
              <div class="ide-desc">.github/copilot-instructions.md + native memory</div>
            </div>
            <span class="ide-check">✓</span>
          </label>
          <label class="ide-card" id="ide-gemini">
            <input type="checkbox" value="gemini" onchange="toggleIde(this)">
            <span class="ide-icon">💎</span>
            <div>
              <div class="ide-name">Gemini CLI</div>
              <div class="ide-desc">GEMINI.md + session context</div>
            </div>
            <span class="ide-check">✓</span>
          </label>
          <label class="ide-card" id="ide-pi">
            <input type="checkbox" value="pi" onchange="toggleIde(this)">
            <span class="ide-icon">π</span>
            <div>
              <div class="ide-name">Pi Coding Agent</div>
              <div class="ide-desc">~/.pi/agent/AGENTS.md + JSONL session trees</div>
            </div>
            <span class="ide-check">✓</span>
          </label>
          <label class="ide-card" id="ide-hermes">
            <input type="checkbox" value="hermes" onchange="toggleIde(this)">
            <span class="ide-icon">🔱</span>
            <div>
              <div class="ide-name">Hermes Agent</div>
              <div class="ide-desc">Nous Research — MEMORY.md + USER.md injection</div>
            </div>
            <span class="ide-check">✓</span>
          </label>
          <label class="ide-card" id="ide-openclaw">
            <input type="checkbox" value="openclaw" onchange="toggleIde(this)">
            <span class="ide-icon">🦀</span>
            <div>
              <div class="ide-name">OpenClaw</div>
              <div class="ide-desc">MEMORY.md + SOUL.md + daily logs + SQLite index</div>
            </div>
            <span class="ide-check">✓</span>
          </label>
          <label class="ide-card" id="ide-obsidian">
            <input type="checkbox" value="obsidian" onchange="toggleIde(this)">
            <span class="ide-icon">🔮</span>
            <div>
              <div class="ide-name">Obsidian</div>
              <div class="ide-desc">Vault sync — browse memory in graph view</div>
            </div>
            <span class="ide-check">✓</span>
          </label>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-bottom:10px">🔄 Relay Daemon</h3>
        <p style="color:var(--muted);font-size:13px;margin-bottom:14px">The relay watches your IDE session files and ships them to your brain every 60 seconds automatically — no manual steps needed.</p>
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
          <input type="checkbox" id="install-relay" checked style="width:16px;height:16px;accent-color:var(--green)">
          <span>Install relay as system service (starts on boot, runs forever)</span>
        </label>
      </div>

      <div class="card" id="connect-results" style="display:none">
        <h3 style="margin-bottom:10px">Connection Results</h3>
        <div id="connect-log" style="font-family:monospace;font-size:12px;line-height:1.8"></div>
      </div>

      <div class="btn-row">
        <button class="btn btn-secondary" onclick="goPhase(3)">← Back</button>
        <button class="btn btn-primary" id="btn-connect-ides" onclick="connectSelectedIDEs()">Connect Selected Tools →</button>
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

    <!-- ═══════════════════════════ PHASE 7 — Settings ══════════════════════════ -->
    <section class="phase" id="phase-7">
      <div class="phase-header">
        <h1>⚙️ Settings</h1>
        <p>Manage your search providers, usage limits, and other preferences.</p>
      </div>

      <!-- Search Providers -->
      <div class="card">
        <h3>🔍 Web Search Providers</h3>
        <p style="color:var(--muted);font-size:13px;margin-bottom:6px">
          The background research engine tries these in order — Tavily → Brave → Exa → Serper — and falls back to DuckDuckGo (free) when none are set or the daily limit is reached.
        </p>

        <div id="settings-usage-bar" style="background:rgba(255,255,255,0.05);border-radius:6px;padding:10px 12px;font-size:12px;margin-bottom:18px">
          <span style="color:var(--muted)">Today's paid searches: </span>
          <strong id="settings-usage-count" style="color:var(--text)">—</strong>
          <span style="color:var(--muted)"> / </span>
          <strong id="settings-usage-limit" style="color:var(--text)">—</strong>
          <span style="color:var(--muted)"> &nbsp;(<span id="settings-usage-remaining">—</span> remaining today)</span>
        </div>

        <div style="display:grid;gap:14px;margin-bottom:20px">

          <div style="border:1px solid var(--border);border-radius:8px;padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <strong>Tavily</strong>
              <span style="font-size:11px;background:var(--green);color:#000;padding:2px 7px;border-radius:10px">Best for AI agents</span>
            </div>
            <p style="font-size:12px;color:var(--muted);margin-bottom:8px">Returns full page text, not just links. 1,000 free searches/month. <a href="https://tavily.com" target="_blank" style="color:var(--blue)">tavily.com</a></p>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="password" id="s-tavily-key" placeholder="tvly-… (leave blank to remove)" autocomplete="off" style="font-family:monospace;flex:1">
              <button class="btn btn-secondary" style="padding:5px 10px;font-size:12px" onclick="toggleShow('s-tavily-key')">Show</button>
            </div>
          </div>

          <div style="border:1px solid var(--border);border-radius:8px;padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <strong>Brave Search</strong>
              <span style="font-size:11px;color:var(--muted)">~1,000 free/month</span>
            </div>
            <p style="font-size:12px;color:var(--muted);margin-bottom:8px">Independent web index. <a href="https://brave.com/search/api/" target="_blank" style="color:var(--blue)">brave.com/search/api</a></p>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="password" id="s-brave-key" placeholder="BSA… (leave blank to remove)" autocomplete="off" style="font-family:monospace;flex:1">
              <button class="btn btn-secondary" style="padding:5px 10px;font-size:12px" onclick="toggleShow('s-brave-key')">Show</button>
            </div>
          </div>

          <div style="border:1px solid var(--border);border-radius:8px;padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <strong>Exa</strong>
              <span style="font-size:11px;color:var(--muted)">~1,000 free/month</span>
            </div>
            <p style="font-size:12px;color:var(--muted);margin-bottom:8px">Neural/semantic search — finds by meaning. <a href="https://exa.ai" target="_blank" style="color:var(--blue)">exa.ai</a></p>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="password" id="s-exa-key" placeholder="… (leave blank to remove)" autocomplete="off" style="font-family:monospace;flex:1">
              <button class="btn btn-secondary" style="padding:5px 10px;font-size:12px" onclick="toggleShow('s-exa-key')">Show</button>
            </div>
          </div>

          <div style="border:1px solid var(--border);border-radius:8px;padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <strong>Serper</strong>
              <span style="font-size:11px;color:var(--muted)">2,500 one-time free credits</span>
            </div>
            <p style="font-size:12px;color:var(--muted);margin-bottom:8px">Google Search results. <a href="https://serper.dev" target="_blank" style="color:var(--blue)">serper.dev</a></p>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="password" id="s-serper-key" placeholder="… (leave blank to remove)" autocomplete="off" style="font-family:monospace;flex:1">
              <button class="btn btn-secondary" style="padding:5px 10px;font-size:12px" onclick="toggleShow('s-serper-key')">Show</button>
            </div>
          </div>

        </div>

        <div style="margin-bottom:20px">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">
            Daily search limit
            <span style="font-weight:400;color:var(--muted);margin-left:6px">paid API calls per day — resets at midnight</span>
          </label>
          <div style="display:flex;gap:10px;align-items:center">
            <input type="number" id="s-daily-limit" min="0" max="5000" value="50"
              style="width:90px;font-size:14px;text-align:center">
            <span style="font-size:12px;color:var(--muted)">
              Set to <strong>0</strong> to disable the limit entirely (if you're on a paid plan).
              Default <strong>50/day ≈ 1,500/month</strong> stays within most free tiers.
            </span>
          </div>
        </div>

        <div id="settings-save-result" class="notice" style="display:none;margin-bottom:14px"></div>

        <div class="btn-row">
          <button class="btn btn-primary" onclick="saveSettings()">Save Settings</button>
        </div>
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
    deployTarget: '',
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

  // ── Phase 1: Deploy target selection ──
  document.querySelectorAll('#deploy-target input[type=radio]').forEach(function (r) {
    r.addEventListener('change', function () {
      document.querySelectorAll('#deploy-target .radio-item').forEach(function (el) { el.classList.remove('selected'); });
      r.closest('.radio-item').classList.add('selected');

      var val = r.value;
      // Show/hide path-specific detail panels
      document.getElementById('local-details').style.display    = val === 'local'    ? '' : 'none';
      document.getElementById('localnet-details').style.display  = val === 'localnet' ? '' : 'none';
      document.getElementById('vastai-details').style.display   = val === 'vastai'   ? '' : 'none';
      document.getElementById('vps-details').style.display      = val === 'vps'      ? '' : 'none';
      // Domain section only for VPS
      document.getElementById('domain-section').style.display   = val === 'vps'      ? '' : 'none';
      // Show the right action button
      document.getElementById('phase1-next-btn').style.display      = val === 'local'    ? '' : 'none';
      document.getElementById('phase1-localnet-btn').style.display  = val === 'localnet' ? '' : 'none';
      document.getElementById('phase1-vastai-btn').style.display    = val === 'vastai'   ? '' : 'none';
      document.getElementById('phase1-continue-btn').style.display  = val === 'vps'      ? '' : 'none';
      W.deployTarget = val;
    });
  });

  var cfgDomain = document.getElementById('cfg-domain');
  if (cfgDomain) {
    cfgDomain.addEventListener('input', function () {
      var v = cfgDomain.value.trim();
      document.getElementById('duckdns-token-field').style.display = v.endsWith('.duckdns.org') ? '' : 'none';
    });
  }

  // Local access sub-radios
  document.querySelectorAll('#local-access input[type=radio]').forEach(function (r) {
    r.addEventListener('change', function () {
      document.querySelectorAll('#local-access .radio-item').forEach(function (el) { el.classList.remove('selected'); });
      r.closest('.radio-item').classList.add('selected');
    });
  });

  // ── Phase 1: Install on another computer on the network ──
  window.installOnNetwork = function () {
    var host = (document.getElementById('cfg-localnet-host') || {}).value;
    var user = (document.getElementById('cfg-localnet-user') || {}).value;
    if (!host || !host.trim()) { alert('Please enter the IP address or hostname of that computer.'); return; }
    if (!user || !user.trim()) { alert('Please enter the username on that computer.'); return; }
    goPhase(2);
    startSSE();
    fetch('/api/start-install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployTarget: 'localnet',
        localnetHost: host.trim(),
        localnetUser: user.trim(),
        model: 'gemma4:26b',
        httpsMethod: 'local',
        skipSearxng: true,
        skipCaddy: true,
        skipCompile: false,
        skipModels: false,
      }),
    }).catch(function (e) { console.error(e); });
  };

  // ── Phase 1: Vast.ai provision (client-side) ──
  window.provisionVastAI = function () {
    var key = (document.getElementById('cfg-vastai-key') || {}).value;
    if (!key || !key.trim()) {
      alert('Please paste your Vast.ai API key first (Step 2 above).');
      return;
    }
    goPhase(2);
    startSSE();
    fetch('/api/provision-vastai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vastaiKey: key.trim() }),
    }).catch(function (err) { console.error('provision-vastai error', err); });
  };

  // ── Phase 1: Start Install ──
  window.startInstall = function () {
    var deployTarget = W.deployTarget || 'local';
    var domain = 'localhost';
    var httpsMethod = 'local';
    var duckdnsToken = null;
    var cloudflareToken = null;

    if (deployTarget === 'local') {
      var localAccess = document.querySelector('#local-access input[type=radio]:checked');
      if (localAccess && localAccess.value === 'cloudflare-quick') {
        httpsMethod = 'cloudflare-quick';
      }
    } else {
      // Remote path: read domain field
      var domainVal = (document.getElementById('cfg-domain') || {}).value;
      if (domainVal) domain = domainVal.trim() || 'localhost';
      duckdnsToken = ((document.getElementById('cfg-duckdns-token') || {}).value || '').trim() || null;
      cloudflareToken = ((document.getElementById('cfg-cloudflare-token') || {}).value || '').trim() || null;
      if (domain.endsWith('.duckdns.org') && duckdnsToken) { httpsMethod = 'duckdns'; }
      else if (cloudflareToken) { httpsMethod = 'cloudflare-tunnel'; }
      else { httpsMethod = 'cloudflare-quick'; } // fallback: temp URL
    }

    W.domain = domain;

    var payload = {
      domain: domain,
      httpsMethod: httpsMethod,
      model: 'gemma4:26b',           // always — one model
      duckdnsToken: duckdnsToken,
      cloudflareToken: cloudflareToken,
      skipSearxng: true,             // SearXNG optional, skip by default for speed
      skipCaddy: (httpsMethod === 'local' || httpsMethod === 'cloudflare-quick'),
      skipCompile: false,
      skipModels: false,
      deployTarget: deployTarget,
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
  // IDE picker toggle
  window.toggleIde = function(checkbox) {
    var label = checkbox.closest('.ide-card');
    if (checkbox.checked) {
      label.classList.add('selected');
    } else {
      label.classList.remove('selected');
    }
  };

  // Save search API keys (Brave / Tavily / Exa / Serper)
  window.saveSearchKeys = function() {
    var tavilyKey = (document.getElementById('tavily-key').value || '').trim();
    var braveKey  = (document.getElementById('brave-key').value  || '').trim();
    var exaKey    = (document.getElementById('exa-key').value    || '').trim();
    var serperKey = (document.getElementById('serper-key').value || '').trim();
    var resultEl  = document.getElementById('search-save-result');

    if (!braveKey && !tavilyKey && !exaKey && !serperKey) {
      resultEl.style.display = '';
      resultEl.className = 'notice warn';
      resultEl.textContent = 'No keys entered — that\'s fine. The engine will use DuckDuckGo and Wikipedia for free.';
      return;
    }

    resultEl.style.display = '';
    resultEl.className = 'notice';
    resultEl.textContent = 'Saving…';

    fetch('/api/save-search-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ braveKey, tavilyKey, exaKey, serperKey })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) {
        resultEl.className = 'notice success';
        resultEl.textContent = '✅ Saved. Primary search source: ' + data.primarySource + '.';
      } else {
        resultEl.className = 'notice warn';
        resultEl.textContent = '⚠️ ' + (data.error || 'Could not save keys.');
      }
    })
    .catch(function() {
      resultEl.className = 'notice warn';
      resultEl.textContent = '⚠️ Could not reach the setup server.';
    });
  };

  // Auto-detect installed IDEs on page load
  function autoDetectIDEs() {
    fetch('/api/detect-ides')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.detected) return;
        data.detected.forEach(function(ide) {
          var cb = document.querySelector('#ide-' + ide + ' input[type=checkbox]');
          if (cb && !cb.checked) { cb.checked = true; toggleIde(cb); }
        });
      })
      .catch(function() { /* auto-detect optional */ });
  }

  function populateIntegrations() {
    autoDetectIDEs();
  }

  // Connect all selected IDEs
  window.connectSelectedIDEs = function() {
    var selected = [];
    document.querySelectorAll('#ide-grid input[type=checkbox]:checked').forEach(function(cb) {
      selected.push(cb.value);
    });
    var installRelay = document.getElementById('install-relay').checked;

    var resultsCard = document.getElementById('connect-results');
    var logEl = document.getElementById('connect-log');
    resultsCard.style.display = '';
    logEl.innerHTML = '<div class="connect-result-line info">Connecting ' + (selected.length || 'no') + ' tools' + (installRelay ? ' + relay' : '') + '...</div>';

    document.getElementById('btn-connect-ides').disabled = true;
    document.getElementById('btn-connect-ides').textContent = 'Connecting...';

    fetch('/api/connect-ides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ides: selected, installRelay: installRelay, brainUrl: W.apiUrl, token: W.pat })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      logEl.innerHTML = '';
      (data.results || []).forEach(function(r) {
        var cls = r.ok ? 'ok' : (r.skipped ? 'info' : 'err');
        var icon = r.ok ? '✅' : (r.skipped ? '⚪' : '❌');
        logEl.innerHTML += '<div class="connect-result-line ' + cls + '">' + icon + ' ' + r.label + ': ' + r.message + '</div>';
      });
      if (data.relayResult) {
        var rc = data.relayResult.ok ? 'ok' : 'err';
        logEl.innerHTML += '<div class="connect-result-line ' + rc + '">' + (data.relayResult.ok ? '✅' : '❌') + ' Relay: ' + data.relayResult.message + '</div>';
      }
      logEl.innerHTML += '<div class="connect-result-line info" style="margin-top:8px">🔄 Memory will start compiling automatically. Ready!</div>';
      document.getElementById('btn-connect-ides').textContent = 'Done — Continue →';
      document.getElementById('btn-connect-ides').disabled = false;
      document.getElementById('btn-connect-ides').onclick = function() { goPhase(5); };
    })
    .catch(function(e) {
      logEl.innerHTML += '<div class="connect-result-line err">❌ Error: ' + e.message + '</div>';
      document.getElementById('btn-connect-ides').textContent = 'Retry';
      document.getElementById('btn-connect-ides').disabled = false;
    });
  };


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

  // ── Phase 7: Settings ──
  function populateSettings() {
    // Load current key values (masked) and usage stats
    fetch('/api/get-search-config')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        // Show placeholder if key exists, empty if not — never show actual key
        if (data.hasTavily)  document.getElementById('s-tavily-key').placeholder  = 'tvly-\u2026\u2026 (key set — enter new value to change)';
        if (data.hasBrave)   document.getElementById('s-brave-key').placeholder   = 'BSA\u2026\u2026 (key set — enter new value to change)';
        if (data.hasExa)     document.getElementById('s-exa-key').placeholder     = '\u2026\u2026 (key set — enter new value to change)';
        if (data.hasSerper)  document.getElementById('s-serper-key').placeholder  = '\u2026\u2026 (key set — enter new value to change)';
        document.getElementById('s-daily-limit').value = data.dailyLimit ?? 50;
      })
      .catch(function() { /* config not saved yet — defaults stay */ });

    fetch('/api/get-search-usage')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        document.getElementById('settings-usage-count').textContent     = data.today;
        document.getElementById('settings-usage-limit').textContent     = data.limit === 'unlimited' ? '\u221e' : data.limit;
        document.getElementById('settings-usage-remaining').textContent = data.remaining === 'unlimited' ? 'unlimited' : data.remaining;
      })
      .catch(function() {});
  }

  window.saveSettings = function() {
    var tavilyKey  = (document.getElementById('s-tavily-key').value  || '').trim();
    var braveKey   = (document.getElementById('s-brave-key').value   || '').trim();
    var exaKey     = (document.getElementById('s-exa-key').value     || '').trim();
    var serperKey  = (document.getElementById('s-serper-key').value  || '').trim();
    var dailyLimit = parseInt(document.getElementById('s-daily-limit').value, 10) || 0;
    var resultEl   = document.getElementById('settings-save-result');

    resultEl.style.display = '';
    resultEl.className = 'notice';
    resultEl.textContent = 'Saving\u2026';

    fetch('/api/save-search-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tavilyKey: tavilyKey, braveKey: braveKey, exaKey: exaKey, serperKey: serperKey, dailyLimit: dailyLimit, mergeExisting: true })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) {
        resultEl.className = 'notice success';
        var src = data.primarySource;
        resultEl.textContent = '\u2705 Saved. ' + (src === 'DuckDuckGo + Wikipedia (free)' ? 'No paid key set \u2014 using DuckDuckGo + Wikipedia.' : 'Primary source: ' + src + '.');
        // Clear fields and re-load placeholders
        ['s-tavily-key','s-brave-key','s-exa-key','s-serper-key'].forEach(function(id) {
          document.getElementById(id).value = '';
        });
        populateSettings();
      } else {
        resultEl.className = 'notice warn';
        resultEl.textContent = '\u26a0\ufe0f ' + (data.error || 'Could not save.');
      }
    })
    .catch(function() {
      resultEl.className = 'notice warn';
      resultEl.textContent = '\u26a0\ufe0f Could not reach server.';
    });
  };

  window.toggleShow = function(id) {
    var el = document.getElementById(id);
    var btn = el.nextElementSibling;
    if (el.type === 'password') {
      el.type = 'text';
      btn.textContent = 'Hide';
    } else {
      el.type = 'password';
      btn.textContent = 'Show';
    }
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

      // ── POST /api/save-search-config — write research.yml ──
      if (url === '/api/save-search-config' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          try {
            const { braveKey, tavilyKey, exaKey, serperKey, dailyLimit, mergeExisting } = JSON.parse(body);
            const configDir = path2.default.join(os2.default.homedir(), '.agent', 'config');
            const configFile = path2.default.join(configDir, 'research.yml');
            fs2.default.mkdirSync(configDir, { recursive: true });

            // If mergeExisting=true (Settings page), blank fields keep existing values
            let existing = {};
            if (mergeExisting && fs2.default.existsSync(configFile)) {
              try {
                const raw = fs2.default.readFileSync(configFile, 'utf8');
                // Simple key extraction without yaml parser dependency in this context
                const extract = (key) => { const m = raw.match(new RegExp(`${key}:\\s*"([^"]+)"`)); return m ? m[1] : ''; };
                existing = {
                  tavily: extract('tavily_api_key'),
                  brave:  extract('brave_api_key'),
                  exa:    extract('exa_api_key'),
                  serper: extract('serper_api_key'),
                };
              } catch { /* ignore */ }
            }

            const resolvedTavily  = tavilyKey  || existing.tavily  || '';
            const resolvedBrave   = braveKey   || existing.brave   || '';
            const resolvedExa     = exaKey     || existing.exa     || '';
            const resolvedSerper  = serperKey  || existing.serper  || '';
            const resolvedLimit   = (dailyLimit != null) ? Number(dailyLimit) : 50;

            const lines = [
              '# Total Recall Research Source Configuration',
              '# Generated by setup wizard / settings — edit freely',
              '# Fallback order: Tavily → Brave → Exa → Serper → DuckDuckGo (free)',
              '',
              '# Tavily: best for AI agents — returns clean extracted text, not just links.',
              '# 1,000 free queries/month. https://tavily.com',
              `tavily_api_key: "${resolvedTavily}"`,
              '',
              '# Brave Search: independent web index, not Google. ~1,000 free/month. https://brave.com/search/api/',
              `brave_api_key: ${braveKey ? `"${braveKey}"` : '""'}`,
              '',
              '# Exa: neural/semantic search, finds pages by meaning. ~1,000 free/month. https://exa.ai',
              `exa_api_key: ${exaKey ? `"${exaKey}"` : '""'}`,
              '',
              '# Serper: Google Search results. 2,500 one-time free credits. https://serper.dev',
              `serper_api_key: ${serperKey ? `"${serperKey}"` : '""'}`,
              '',
              '# Daily search limit (paid queries/day). Default 50 ≈ 1,500/month.',
              '# Set to 0 to disable the cap (for paid plans with high volume).',
              'daily_web_search_limit: 50',
            ].join('\n');
            fs2.default.writeFileSync(path2.default.join(configDir, 'research.yml'), lines);
            const primarySource =
              braveKey  ? 'Brave Search' :
              tavilyKey ? 'Tavily' :
              exaKey    ? 'Exa' :
              serperKey ? 'Serper (Google)' : 'DuckDuckGo + Wikipedia (free)';
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, primarySource }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
        return;
      }

      // ── GET /api/get-search-config — which keys are set + current daily limit ──
      // Returns booleans only — never exposes actual key values
      if (url === '/api/get-search-config' && req.method === 'GET') {
        try {
          const configFile = path2.default.join(os2.default.homedir(), '.agent', 'config', 'research.yml');
          let hasTavily = false, hasBrave = false, hasExa = false, hasSerper = false, dailyLimitVal = 50;
          if (fs2.default.existsSync(configFile)) {
            const raw = fs2.default.readFileSync(configFile, 'utf8');
            const extract = (key) => { const m = raw.match(new RegExp(`${key}:\\s*"([^"]+)"`)); return m ? m[1] : ''; };
            const limitMatch = raw.match(/daily_web_search_limit:\s*(\d+)/);
            hasTavily  = !!extract('tavily_api_key');
            hasBrave   = !!extract('brave_api_key');
            hasExa     = !!extract('exa_api_key');
            hasSerper  = !!extract('serper_api_key');
            dailyLimitVal = limitMatch ? parseInt(limitMatch[1], 10) : 50;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ hasTavily, hasBrave, hasExa, hasSerper, dailyLimit: dailyLimitVal }));
        } catch {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ hasTavily: false, hasBrave: false, hasExa: false, hasSerper: false, dailyLimit: 50 }));
        }
        return;
      }

      // ── GET /api/get-search-usage — today's search count vs limit ──
      if (url === '/api/get-search-usage' && req.method === 'GET') {
        try {
          const usageFile  = path2.default.join(os2.default.homedir(), '.agent', 'config', 'search-usage.json');
          const configFile = path2.default.join(os2.default.homedir(), '.agent', 'config', 'research.yml');
          const today = new Date().toISOString().slice(0, 10);
          let todayCount = 0, dailyLimitVal = 50;
          if (fs2.default.existsSync(usageFile)) {
            const usage = JSON.parse(fs2.default.readFileSync(usageFile, 'utf8'));
            todayCount = usage[today] || 0;
          }
          if (fs2.default.existsSync(configFile)) {
            const m = fs2.default.readFileSync(configFile, 'utf8').match(/daily_web_search_limit:\s*(\d+)/);
            if (m) dailyLimitVal = parseInt(m[1], 10);
          }
          const unlimited = dailyLimitVal === 0;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            today: todayCount,
            limit: unlimited ? 'unlimited' : dailyLimitVal,
            remaining: unlimited ? 'unlimited' : Math.max(0, dailyLimitVal - todayCount),
          }));
        } catch {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ today: 0, limit: 50, remaining: 50 }));
        }
        return;
      }

      // ── GET /api/detect-ides — probe filesystem for installed IDEs ──
      if (url === '/api/detect-ides' && req.method === 'GET') {
        const HOME = os.homedir();
        const detected = [];
        const checks = {
          'claude-code': [HOME + '/.claude/projects', HOME + '/.claude/CLAUDE.md'],
          'codex':       [HOME + '/.codex/sessions', HOME + '/.codex/AGENTS.md'],
          'cursor':      [HOME + '/.cursor/projects', HOME + '/.cursor'],
          'antigravity': [HOME + '/.gemini/antigravity'],
          'vscode':      [HOME + '/Library/Application Support/Code', HOME + '/.vscode'],
          'gemini':      [HOME + '/.gemini'],
          'pi':          [HOME + '/.pi/agent'],
          'hermes':      [HOME + '/.hermes'],
          'openclaw':    [HOME + '/.openclaw'],
          'obsidian':    [HOME + '/Library/Application Support/obsidian', HOME + '/.config/obsidian'],
        };
        for (const [ide, paths] of Object.entries(checks)) {
          if (paths.some(p => { try { return fs2.default.existsSync(p); } catch { return false; } })) {
            detected.push(ide);
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ detected }));
        return;
      }

      // ── POST /api/connect-ides — run connect + relay install ──
      if (url === '/api/connect-ides' && req.method === 'POST') {
        let body = '';
        req.on('data', d => { body += d; });
        req.on('end', async () => {
          let opts;
          try { opts = JSON.parse(body || '{}'); } catch { opts = {}; }
          const { ides = [], installRelay = true, brainUrl, token } = opts;
          const results = [];

          // IDE-to-connect-client mapping
          const IDE_CLIENTS = {
            'claude-code': { client: 'claude-code', label: 'Claude Code' },
            'codex':       { client: 'codex',       label: 'Codex' },
            'cursor':      { client: 'cursor',       label: 'Cursor' },
            'antigravity': { client: 'antigravity',  label: 'Antigravity' },
            'vscode':      { client: 'vscode',       label: 'VS Code Copilot' },
            'gemini':      { client: 'gemini',       label: 'Gemini CLI' },
            'pi':          { client: 'pi',           label: 'Pi Coding Agent' },
            'hermes':      { client: 'hermes',       label: 'Hermes Agent' },
            'openclaw':    { client: 'openclaw',     label: 'OpenClaw' },
            'obsidian':    { client: 'obsidian',     label: 'Obsidian' },
          };

          const { spawnSync: sp } = await import('node:child_process');
          const nodeBin = process.execPath;
          const scriptPath = new URL('../../bin/total-recall.mjs', import.meta.url).pathname;

          for (const ide of ides) {
            const mapping = IDE_CLIENTS[ide];
            if (!mapping) { results.push({ label: ide, ok: false, message: 'Unknown IDE' }); continue; }
            const args = ['connect', mapping.client];
            if (brainUrl) args.push('--brain', brainUrl);
            if (token) args.push('--token', token);
            args.push('--force');
            try {
              const r = sp(nodeBin, [scriptPath, ...args], { encoding: 'utf8', timeout: 30000 });
              if (r.status === 0) {
                results.push({ label: mapping.label, ok: true, message: 'Connected' });
              } else {
                const err = (r.stderr || r.stdout || '').trim().split('\n').pop() || 'failed';
                results.push({ label: mapping.label, ok: false, skipped: err.includes('exists'), message: err });
              }
            } catch (e) {
              results.push({ label: mapping.label, ok: false, message: e.message });
            }
          }

          // Install relay as system service
          let relayResult = null;
          if (installRelay) {
            try {
              const relayArgs = [scriptPath, 'relay', 'install'];
              if (brainUrl) {
                // Write brain config so relay knows where to ship
                const { resolveAgentDir } = await import('./agent-dir.mjs');
                const fs2 = await import('node:fs');
                const path2 = await import('node:path');
                const agentDir = resolveAgentDir();
                const configDir = path2.default.join(agentDir, 'config');
                fs2.default.mkdirSync(configDir, { recursive: true });
                const config = { url: brainUrl };
                if (token) config.token = token;
                fs2.default.writeFileSync(path2.default.join(configDir, 'brain.json'), JSON.stringify(config, null, 2));
              }
              const rr = sp(nodeBin, relayArgs, { encoding: 'utf8', timeout: 30000 });
              relayResult = { ok: rr.status === 0, message: rr.status === 0 ? 'Installed as system service (starts on boot)' : (rr.stderr || rr.stdout || '').trim().split('\n').pop() };
            } catch (e) {
              relayResult = { ok: false, message: e.message };
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, results, relayResult }));
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

// ── Vast.ai auto-provisioner ────────────────────────────────────────────────────────

async function vastAPI(key, method, path, body) {
  const { default: https } = await import('node:https');
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'console.vast.ai',
      path: `/api/v0${path}`,
      method,
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(opts, (r) => {
      let buf = '';
      r.on('data', c => { buf += c; });
      r.on('end', () => {
        try { resolve(JSON.parse(buf)); }
        catch { resolve(buf); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function provisionVastAI(apiKey) {
  emitProgress('log', '🔍 Searching for available GPU instances on Vast.ai...');

  // Search for cheapest RTX 3060 12GB+ with Ubuntu, enough disk
  const offers = await vastAPI(apiKey, 'GET',
    '/bundles/?q={"gpu_name":{"in":["RTX 3060","RTX 3060 Ti","RTX 3070","RTX 3080"]},"disk_space":{"gte":40},"reliability2":{"gte":0.9},"rentable":{"eq":true},"order":[["dph_total","asc"]],"limit":5}'
  );

  const offerList = (offers.offers || []).filter(o => o.rentable);
  if (!offerList.length) {
    emitProgress('error', '❌ No suitable GPU instances available right now. Try again in a few minutes.');
    return;
  }

  const best = offerList[0];
  emitProgress('log', `✅ Found: ${best.gpu_name} — $${(best.dph_total * 24 * 30).toFixed(2)}/mo at ${best.location?.country || 'unknown location'}`);
  emitProgress('log', '🚀 Creating your instance...');

  // Create the instance
  const created = await vastAPI(apiKey, 'PUT', `/asks/${best.id}/`, {
    client_id: 'me',
    image: 'pytorch/pytorch:2.3.0-cuda12.1-cudnn8-runtime',
    disk: 40,
    onstart: 'curl -fsSL https://raw.githubusercontent.com/gregiteen/total-recall/main/install.sh | bash',
    env: {},
    runtype: 'ssh',
    image_login: null,
  });

  if (!created.success) {
    emitProgress('error', `❌ Failed to create instance: ${JSON.stringify(created)}`);
    return;
  }

  const instanceId = created.new_contract;
  emitProgress('log', `✅ Instance created (ID: ${instanceId}). Waiting for it to boot...`);

  // Poll until running
  let instance = null;
  for (let i = 0; i < 40; i++) {
    await sleep(15000);
    const status = await vastAPI(apiKey, 'GET', `/instances/${instanceId}/`);
    instance = (status.instances || [])[0] || status;
    const state = instance.actual_status || instance.status || 'loading';
    emitProgress('log', `⏳ Instance status: ${state}...`);
    if (state === 'running') break;
  }

  if (!instance || (instance.actual_status !== 'running' && instance.status !== 'running')) {
    emitProgress('error', '❌ Instance did not start within 10 minutes. Check your Vast.ai dashboard.');
    return;
  }

  emitProgress('log', '✅ Instance is running! Total Recall is installing...');
  emitProgress('log', `📍 SSH: ssh -p ${instance.ssh_port} root@${instance.ssh_host}`);
  emitProgress('log', '⏳ The installer is pulling the gemma4 model (~10 GB). This takes 5-10 minutes...');
  emitProgress('log', '💡 You can close this window and come back — the install runs in the background.');

  // Store instance info for later phases
  _installOptions = _installOptions || {};
  _installOptions.vastInstanceId = instanceId;
  _installOptions.vastSshHost = instance.ssh_host;
  _installOptions.vastSshPort = instance.ssh_port;
  _installOptions.domain = `${instance.ssh_host}`;
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
