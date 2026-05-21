#!/usr/bin/env node

/**
 * monitor-server.mjs — Live Agent Monitor Web Dashboard
 * 
 * Serves a real-time HTML dashboard that auto-polls for agent status.
 * Open in Antigravity's Simple Browser or any browser.
 * 
 * Usage:
 *   node .agent/skills/cli-agents/scripts/monitor-server.mjs [port]
 */

import http from 'node:http';
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { execSync, spawn, exec } from 'node:child_process';
import util from 'node:util';
const execAsync = util.promisify(exec);
import dotenv from 'dotenv';
import Database from 'better-sqlite3';

// Load .env.development.local if exists
try { dotenv.config({ path: path.join(process.cwd(), '.env.development.local') }); } catch(e) {}


const PORT = parseInt(process.argv[2] || '9111', 10);
const LOG_DIR = '/tmp';
const LOG_PATTERN = /^(gemini|claude|codex)-dispatch.*\.log$|^orchestrator-.*\.log$/;

// Co-processor paths
const COPROCESSOR_PID_FILE = '/tmp/total-recall-coprocessor.pid';
const COPROCESSOR_LOG_FILE = '/tmp/total-recall-coprocessor.log';

function getCoProcessorStatus() {
  let running = false;
  let pid = null;
  let stats = null;
  let lastLog = '';

  // Check PID
  try {
    pid = parseInt(readFileSync(COPROCESSOR_PID_FILE, 'utf-8').trim());
    process.kill(pid, 0); // Check if alive
    running = true;
  } catch {
    pid = null;
  }

  // Parse last heartbeat stats from log
  try {
    if (existsSync(COPROCESSOR_LOG_FILE)) {
      const logContent = readFileSync(COPROCESSOR_LOG_FILE, 'utf-8');
      const lines = logContent.trim().split('\n').filter(Boolean);
      // Find last heartbeat line with stats JSON
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].includes('heartbeat')) {
          const jsonMatch = lines[i].match(/heartbeat\s+(\{.*\})/);
          if (jsonMatch) {
            stats = JSON.parse(jsonMatch[1]);
            break;
          }
        }
      }
      // Get last 5 non-debug lines for display
      const meaningful = lines.filter(l => !l.includes('[DEBUG]')).slice(-5);
      lastLog = meaningful.join('\n');
    }
  } catch { /* ignore parse errors */ }

  return {
    running,
    pid,
    stats: stats || { turnsProcessed: 0, steeringsDetected: 0, sentimentsDetected: 0, contextInjections: 0, contradictionsDetected: 0, researchDispatched: 0, researchCompleted: 0, conclusionsCreated: 0, errors: 0, startedAt: null },
    lastLog,
  };
}

function getLogFiles() {
  try {
    return readdirSync(LOG_DIR)
      .filter(f => LOG_PATTERN.test(f))
      .map(f => path.join(LOG_DIR, f));
  } catch { return []; }
}

function getAgentInfo(filepath) {
  const base = path.basename(filepath);
  if (base.includes('gemini')) return { name: 'Gemini', icon: '🟦', color: '#4285f4' };
  if (base.includes('claude')) return { name: 'Claude', icon: '🟧', color: '#e67e22' };
  if (base.includes('codex'))  return { name: 'Codex',  icon: '🟩', color: '#2ecc71' };
  return { name: 'Unknown', icon: '⬜', color: '#999' };
}

function getStatus(content) {
  if (!content) return { status: 'pending', label: 'PENDING', color: '#666' };
  const lower = content.toLowerCase();
  
  // Orchestrator agents stay RUNNING until their process actually exits
  if (lower.includes('autonomous orchestrator')) {
    // Check if the orchestrator gemini process is still alive
    try {
      const { execSync } = require('node:child_process');
      const ps = execSync('ps aux 2>/dev/null', { encoding: 'utf8' });
      if (ps.includes('AUTONOMOUS ORCHESTRATOR') || ps.includes('orchestrator.mjs')) {
        return { status: 'running', label: 'ORCHESTRATING', color: '#a855f7' };
      }
    } catch {}
    return { status: 'done', label: 'DONE', color: '#2ecc71' };
  }
  
  if (lower.includes('exit code: 0') || lower.includes('committed') || lower.includes('done.') || lower.includes('created file') || lower.includes('has been completed') || lower.includes('skills used') || lower.includes('audit summary'))
    return { status: 'done', label: 'DONE', color: '#2ecc71' };
  if (lower.includes('exit code:') || lower.includes('fatal') || lower.includes('permission denied'))
    return { status: 'error', label: 'ERROR', color: '#e74c3c' };

  // Check PID death to clean up zombies
  const pidMatch = content.match(/\[DISPATCH_PID\]\s+(\d+)/);
  if (pidMatch) {
    const pid = parseInt(pidMatch[1], 10);
    try {
      process.kill(pid, 0); // Check if alive
    } catch (e) {
      // Process is dead, but no explicit success keywords found
      if (lower.includes('success') || lower.includes('finished')) {
         return { status: 'done', label: 'DONE', color: '#2ecc71' };
      }
      return { status: 'error', label: 'CRASHED', color: '#e74c3c' };
    }
  }

  return { status: 'running', label: 'RUNNING', color: '#f39c12' };
}

function getProjectStats() {
  const trackers = [];
  try {
    const files = execSync('find docs/projects/in-progress .agent/skills/refactor/references -name "*_PROJECT_TRACKER.md" -o -name "*_HIT_LIST.md" 2>/dev/null').toString().split('\n').filter(Boolean);
    
    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      let total = 0, completed = 0;
      for (const line of lines) {
        if (line.match(/^\\s*- \\[[xX]\\]/)) { total++; completed++; }
        else if (line.match(/^\\s*- \\[[ ~-]\\]/)) { total++; }
      }
      if (total > 0) {
        let name = path.basename(file).replace(/_(PROJECT_TRACKER|HIT_LIST)\\.md$/, '').replace(/_/g, ' ');
        trackers.push({ name, completed, total, percent: Math.round((completed / total) * 100) });
      }
    }
  } catch(e) {}
  return trackers.sort((a,b) => b.percent - a.percent);
}

const DB_DIR = path.join(process.cwd(), '.agent/skills/cli-agents/data');
if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });
const db = new Database(path.join(DB_DIR, 'monitor.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    completed INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    totalLines INTEGER DEFAULT 0,
    totalBytes INTEGER DEFAULT 0
  );
  INSERT OR IGNORE INTO stats (id, completed, errors, totalLines, totalBytes) VALUES (1, 0, 0, 0, 0);
  
  CREATE TABLE IF NOT EXISTS agent_runs (
    filename TEXT PRIMARY KEY,
    processedBytes INTEGER DEFAULT 0,
    processedLines INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending'
  );
`);

function updateStats(newCompleted, newErrors, newLines, newBytes) {
  const stmt = db.prepare('UPDATE stats SET completed = completed + ?, errors = errors + ?, totalLines = totalLines + ?, totalBytes = totalBytes + ? WHERE id = 1');
  stmt.run(newCompleted, newErrors, newLines, newBytes);
}

function getGlobalStats() {
  return db.prepare('SELECT * FROM stats WHERE id = 1').get();
}

function getAgentRun(filename) {
  let run = db.prepare('SELECT * FROM agent_runs WHERE filename = ?').get(filename);
  if (!run) {
    db.prepare("INSERT INTO agent_runs (filename, processedBytes, processedLines, status) VALUES (?, 0, 0, 'pending')").run(filename);
    run = { filename, processedBytes: 0, processedLines: 0, status: 'pending' };
  }
  return run;
}

function updateAgentRun(filename, processedBytes, processedLines, status) {
  db.prepare('UPDATE agent_runs SET processedBytes = ?, processedLines = ?, status = ? WHERE filename = ?').run(processedBytes, processedLines, status, filename);
}

async function getAgentStatuses() {
  const files = getLogFiles();
  let currentRunning = 0;
  
  let newCompleted = 0;
  let newErrors = 0;
  let newTotalLines = 0;
  let newTotalBytes = 0;
  
  const agents = files.map(f => {
    const info = getAgentInfo(f);
    let content = '';
    try { content = existsSync(f) ? readFileSync(f, 'utf-8') : ''; } catch {}
    const lines = content.split('\n').filter(l => l.trim());
    const lastLines = lines.slice(-30);
    const { status, label, color } = getStatus(content);
    const bytes = content.length;
    
    const filename = path.basename(f);
    const run = getAgentRun(filename);
    
    let processedBytes = run.processedBytes;
    let processedLines = run.processedLines;
    
    if (bytes > run.processedBytes) {
      const bytesDiff = bytes - run.processedBytes;
      const linesDiff = lines.length - run.processedLines;
      newTotalBytes += bytesDiff;
      newTotalLines += linesDiff > 0 ? linesDiff : 0;
      processedBytes = bytes;
      processedLines = lines.length;
    }
    
    if (status !== run.status) {
      if (status === 'done') {
        newCompleted++;
        exec(`node .agent/skills/notifications/scripts/notify.mjs "✅ ${info.name} Done" "${filename}"`, () => {});
      }
      if (status === 'error') {
        newErrors++;
        exec(`node .agent/skills/notifications/scripts/notify.mjs "❌ ${info.name} Error" "Process failed or crashed. See monitor."`, () => {});
      }
    }
    
    updateAgentRun(filename, processedBytes, processedLines, status);
    
    if (status === 'running') currentRunning++;
    
    const commitCount = (content.match(/git commit|committed/gi) || []).length;
    let promptContent = '';
    const promptMatch = content.match(/\[PROMPT_START\]([\s\S]*?)\[PROMPT_END\]/);
    if (promptMatch) promptContent = promptMatch[1].trim();
    
    // Extract project name from prompt
    let project = '';
    const projectMatch = content.match(/PROJECT FOLDER:\s*(.+)/i) || content.match(/Phase\s+\d+[:\s—-]+(.+?)\./i);
    if (projectMatch) {
      project = projectMatch[1].trim().split('/').pop();
    }
    
    // Generate dynamic status line from last meaningful output
    let statusLine = '';
    const meaningfulLines = lines.filter(l => l.trim() && !l.includes('[PROMPT_') && !l.startsWith('Error executing'));
    if (meaningfulLines.length > 0) {
      const last = meaningfulLines[meaningfulLines.length - 1].trim();
      statusLine = last.length > 120 ? last.substring(0, 120) + '…' : last;
    }
    
    return { ...info, file: filename, status, label, color, lastLines, bytes, lines: lines.length, commits: commitCount, prompt: promptContent, project, statusLine };
  });
  
  if (newCompleted > 0 || newErrors > 0 || newTotalLines > 0 || newTotalBytes > 0) {
    updateStats(newCompleted, newErrors, newTotalLines, newTotalBytes);
  }
  
  const currentGlobal = getGlobalStats();
  const totalRuns = db.prepare('SELECT COUNT(*) as c FROM agent_runs').get().c;
  
  return {
    agents,
    stats: {
      total: totalRuns,
      running: currentRunning,
      completed: currentGlobal.completed,
      errors: currentGlobal.errors,
      totalLines: currentGlobal.totalLines,
      totalBytes: (currentGlobal.totalBytes/1024).toFixed(1) + ' KB'
    },
    projects: getProjectStats(),
    providers: await fetchProviderStats(),
    coprocessor: getCoProcessorStatus()
  };
}

let _providerCache = null;
let _providerCacheTime = 0;
const PROVIDER_CACHE_TTL = 30000; // 30 seconds

async function fetchProviderStats() {
  const now = Date.now();
  if (_providerCache && (now - _providerCacheTime) < PROVIDER_CACHE_TTL) {
    return _providerCache;
  }
  
  const stats = [];
  const HOME = process.env.HOME || process.env.USERPROFILE || '/Users/greg';
  
  // Claude Stats — from native ~/.claude/stats-cache.json
  try {
    const claudePath = path.join(HOME, '.claude', 'stats-cache.json');
    if (existsSync(claudePath)) {
      const data = JSON.parse(readFileSync(claudePath, 'utf8'));
      let inputTokens = 0, outputTokens = 0, cacheReads = 0, messages = 0, toolCalls = 0;
      if (data.modelUsage) {
        Object.values(data.modelUsage).forEach(m => {
          inputTokens += (m.inputTokens || 0);
          outputTokens += (m.outputTokens || 0);
          cacheReads += (m.cacheReadInputTokens || 0);
        });
      }
      if (data.dailyActivity) {
        data.dailyActivity.forEach(d => {
          messages += (d.messageCount || 0);
          toolCalls += (d.toolCallCount || 0);
        });
      }
      stats.push({ 
        name: 'Claude', color: '#e67e22', 
        inputTokens, outputTokens, cacheReads, messages, toolCalls,
        usage: inputTokens + outputTokens
      });
    } else {
      stats.push({ name: 'Claude', color: '#e67e22', usage: 0, inputTokens: 0, outputTokens: 0, cacheReads: 0, messages: 0, toolCalls: 0 });
    }
  } catch(e) {
    stats.push({ name: 'Claude', color: '#e67e22', usage: 0, inputTokens: 0, outputTokens: 0, cacheReads: 0, messages: 0, toolCalls: 0 });
  }

  // Gemini Stats — from ~/.gemini/tmp/*/chats/session-*.jsonl
  try {
    const geminiTmpBase = path.join(HOME, '.gemini', 'tmp');
    let inputTokens = 0, outputTokens = 0, cachedTokens = 0, thoughtTokens = 0, messages = 0, toolCalls = 0;
    if (existsSync(geminiTmpBase)) {
      const allDirs = readdirSync(geminiTmpBase);
      for (const pDir of allDirs) {
        const chatsDir = path.join(geminiTmpBase, pDir, 'chats');
        if (existsSync(chatsDir)) {
          const files = readdirSync(chatsDir).filter(f => f.startsWith('session-'));
          for (const file of files) {
            try {
              const content = readFileSync(path.join(chatsDir, file), 'utf8');
              content.split('\n').filter(l => l.trim()).forEach(line => {
                try {
                  const entry = JSON.parse(line);
                  // Gemini entries have type:"gemini" with tokens object
                  if (entry.type === 'gemini' && entry.tokens) {
                    inputTokens += (entry.tokens.input || 0);
                    outputTokens += (entry.tokens.output || 0);
                    cachedTokens += (entry.tokens.cached || 0);
                    thoughtTokens += (entry.tokens.thoughts || 0);
                    if (entry.toolCalls) toolCalls += entry.toolCalls.length;
                  }
                  if (entry.type === 'user') messages++;
                } catch {}
              });
            } catch {}
          }
        }
      }
    }
    stats.push({ 
      name: 'Gemini', color: '#4285f4',
      inputTokens, outputTokens, cacheReads: cachedTokens, messages, toolCalls,
      thoughtTokens,
      usage: inputTokens + outputTokens
    });
  } catch(e) {
    stats.push({ name: 'Gemini', color: '#4285f4', usage: 0, inputTokens: 0, outputTokens: 0, cacheReads: 0, messages: 0, toolCalls: 0, thoughtTokens: 0 });
  }

  _providerCache = stats;
  _providerCacheTime = now;
  return stats;
}

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Agent Terminals</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0D0D0D;
      color: #E0E0E0;
      padding: 16px;
      min-height: 100vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      font-family: 'JetBrains Mono', monospace;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding: 12px 20px;
      background: #1A1A1A;
      border: 1px solid #333;
      border-radius: 8px;
    }
    .topbar h1 {
      font-size: 16px;
      font-weight: 700;
      color: #FFF;
      display: flex;
      align-items: center;
      gap: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #10B981;
      box-shadow: 0 0 8px #10B981;
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
    
    .real-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 16px;
    }
    .stat-card {
      background: #1A1A1A;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .stat-val { font-size: 24px; font-weight: 700; color: #FFF; }
    .stat-lbl { font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(600px, 1fr));
      gap: 16px;
      flex: 1;
      min-height: 0;
    }
    .terminal-window {
      background: #000000;
      border: 1px solid #333;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }
    .terminal-header {
      background: #1A1A1A;
      padding: 8px 16px;
      border-bottom: 1px solid #333;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .terminal-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .terminal-badges {
      display: flex;
      gap: 12px;
      align-items: center;
      font-size: 11px;
      color: #888;
    }
    .agent-logo { width: 16px; height: 16px; }
    .terminal-body {
      padding: 12px;
      font-size: 13px;
      line-height: 1.5;
      overflow-y: auto;
      max-height: 300px;
      color: #A1A1AA;
    }
    .terminal-body::-webkit-scrollbar { width: 8px; }
    .terminal-body::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
    .line {
      white-space: pre-wrap;
      word-break: break-all;
    }
    .no-agents {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #666;
      font-size: 14px;
      grid-column: 1 / -1;
    }
  </style>
</head>
<body>
  <div class="topbar">
    <h1><span class="dot"></span> Agent Orchestrator</h1>
    <span style="font-size: 12px; color: #888;" id="clock">--</span>
  </div>
  
  
  <div class="dispatch-panel" style="background: #1A1A1A; border: 1px solid #333; border-radius: 8px; padding: 16px; margin-bottom: 16px; display: flex; gap: 12px; align-items: center;">
    <input type="text" id="dispatch-prompt" placeholder="Enter task prompt here..." style="flex: 1; padding: 10px; background: #0D0D0D; border: 1px solid #444; color: #FFF; border-radius: 4px; font-family: 'JetBrains Mono', monospace;">
    <button onclick="dispatchAgent('claude')" style="padding: 10px 16px; background: #e67e22; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Launch Claude</button>
    <button onclick="dispatchAgent('gemini')" style="padding: 10px 16px; background: #4285f4; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Launch Gemini</button>
    <button onclick="dispatchAgent('codex')" style="padding: 10px 16px; background: #2ecc71; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Launch Codex</button>
  </div>

  <div id="coprocessor-card" style="margin-bottom: 16px;"></div>

  <div class="real-stats" id="stats"></div>

  <div id="history" style="margin-bottom: 16px;"></div>

  <div class="grid" id="agents">
    <div class="no-agents">Waiting for agents to dispatch...</div>
  </div>

  <script>
    const LOGOS = {
      Gemini: '<svg viewBox="0 0 24 24" class="agent-logo" fill="#4285f4"><path d="M12 0L14.7 9.3L24 12L14.7 14.7L12 24L9.3 14.7L0 12L9.3 9.3L12 0Z"/></svg>',
      Claude: '<svg viewBox="0 0 24 24" class="agent-logo" fill="#e67e22"><path d="M12 2a2 2 0 00-2 2v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-4V4a2 2 0 00-2-2zm-3 8a2 2 0 110 4 2 2 0 010-4zm6 0a2 2 0 110 4 2 2 0 010-4z"/></svg>',
      Codex: '<svg viewBox="0 0 24 24" class="agent-logo" fill="#2ecc71"><path d="M22.28 10.32c-.08-2.6-1.54-4.83-3.8-5.83-.8-2.4-3.15-3.95-5.74-3.85-2.06.07-3.94 1.15-5 2.87C5.35 2.76 2.86 3.8 1.7 6.13c-.8 1.6-.8 3.5 0 5.1-1.16 2.33-1.07 5.1.25 7.34 1.48 2.5 4.3 3.9 7.2 3.65 1.15 1.74 3.03 2.83 5.1 2.9 2.6.08 4.95-1.46 5.75-3.85 2.27-1 3.73-3.23 3.8-5.82a6.4 6.4 0 00-1.5-4.13zM12 20.9c-1.85 0-3.56-.9-4.63-2.4l7.1-4.1v-3.7l3.6 2.1c.1.9-.2 1.8-.8 2.4-1.3 1.2-3.1 1.9-5.27 1.9zm-7-2.6c-1.12-1.24-1.45-3-.87-4.57L7.7 16v4.2c-1.6-.2-3.05-1-4-2.3zM3 10.7a4.67 4.67 0 012.3-4c1.6-.94 3.56-1.05 5.25-.3L7 10.5v4.2l-3.6 2.1c-.26-1.9.15-3.8 1.25-5.27v-.83zm7.65-6.6a5 5 0 014.62-1 4.7 4.7 0 012.83 2.5L11 9.7V5.5c-1.23.1-2.33.6-3.1 1.5-.77 1-1.1 2.3-.9 3.5l-3.6-2.1c1-1.83 2.8-3.04 4.87-3.12h.38zm9.5 5.4c1.1 1.25 1.44 3 .86 4.58l-3.56-2.07v-4.2c1.6.2 3.06 1 4.02 2.3l-1.32-.6zM21 13.3a4.66 4.66 0 01-2.3 4c-1.6.93-3.55 1.05-5.24.3l3.56-4.1v-4.2l3.6-2.08c.25 1.87-.16 3.76-1.25 5.24v.84zm-7.65 6.6a5 5 0 01-4.6-1c-1-1.3-1.4-2.9-.84-4.5l7.1 4.1v4.2c1.23-.12 2.34-.6 3.12-1.48.8-1.03 1.13-2.34.92-3.56l3.6 2.08c-1 1.85-2.8 3.06-4.88 3.14h-.42zm-1.85-9.1l-3.6-2.1 3.6-2.1 3.6 2.1v4.2l-3.6 2.1v-4.2z"/></svg>'
    };

    
    async function dispatchAgent(agent) {
      const prompt = document.getElementById('dispatch-prompt').value;
      if (!prompt) return alert('Please enter a prompt first.');
      try {
        document.getElementById('dispatch-prompt').value = '';
        await fetch('/api/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent, prompt })
        });
      } catch(e) { alert('Dispatch failed: ' + e); }
    }

    async function poll() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        document.getElementById('clock').textContent = new Date().toLocaleTimeString();

        // Render Co-Processor card
        const cp = data.coprocessor || {};
        const cpStats = cp.stats || {};
        const cpRunning = cp.running;
        const cpEl = document.getElementById('coprocessor-card');
        cpEl.innerHTML = 
          '<div style="background:#1A1A1A;border:1px solid ' + (cpRunning ? '#a855f7' : '#333') + ';border-radius:8px;padding:16px;display:flex;align-items:center;gap:20px;' + (cpRunning ? 'box-shadow:0 0 12px rgba(168,85,247,0.15);' : '') + '">' +
            '<div style="display:flex;align-items:center;gap:10px;min-width:200px;">' +
              '<span style="font-size:20px;">🧠</span>' +
              '<div>' +
                '<div style="font-size:13px;font-weight:700;color:#FFF;text-transform:uppercase;letter-spacing:0.5px;">Memory Co-Processor</div>' +
                '<div style="font-size:11px;color:' + (cpRunning ? '#a855f7' : '#666') + ';margin-top:2px;">' + (cpRunning ? '● RUNNING (PID ' + cp.pid + ')' : '○ STOPPED') + '</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;gap:20px;flex:1;justify-content:space-around;">' +
              '<div style="text-align:center;"><div style="font-size:18px;font-weight:700;color:#a855f7;">' + (cpStats.turnsProcessed || 0) + '</div><div style="font-size:10px;color:#888;text-transform:uppercase;">Turns</div></div>' +
              '<div style="text-align:center;"><div style="font-size:18px;font-weight:700;color:#f59e0b;">' + (cpStats.steeringsDetected || 0) + '</div><div style="font-size:10px;color:#888;text-transform:uppercase;">Steerings</div></div>' +
              '<div style="text-align:center;"><div style="font-size:18px;font-weight:700;color:#10b981;">' + (cpStats.contextInjections || 0) + '</div><div style="font-size:10px;color:#888;text-transform:uppercase;">Injections</div></div>' +
              '<div style="text-align:center;"><div style="font-size:18px;font-weight:700;color:#3b82f6;">' + (cpStats.sentimentsDetected || 0) + '</div><div style="font-size:10px;color:#888;text-transform:uppercase;">Sentiments</div></div>' +
              '<div style="text-align:center;"><div style="font-size:18px;font-weight:700;color:#ef4444;">' + (cpStats.contradictionsDetected || 0) + '</div><div style="font-size:10px;color:#888;text-transform:uppercase;">Conflicts</div></div>' +
              '<div style="text-align:center;"><div style="font-size:18px;font-weight:700;color:#06b6d4;">' + (cpStats.researchDispatched || 0) + '</div><div style="font-size:10px;color:#888;text-transform:uppercase;">Researched</div></div>' +
              '<div style="text-align:center;"><div style="font-size:18px;font-weight:700;color:#8b5cf6;">' + (cpStats.conclusionsCreated || 0) + '</div><div style="font-size:10px;color:#888;text-transform:uppercase;">Conclusions</div></div>' +
              '<div style="text-align:center;"><div style="font-size:18px;font-weight:700;color:' + ((cpStats.errors || 0) > 0 ? '#ef4444' : '#666') + ';">' + (cpStats.errors || 0) + '</div><div style="font-size:10px;color:#888;text-transform:uppercase;">Errors</div></div>' +
            '</div>' +
          '</div>';
        
        const phtml = data.providers.map(p => {
          const fmt = n => n > 1000000 ? (n/1000000).toFixed(1) + 'M' : n > 1000 ? (n/1000).toFixed(1) + 'k' : n;
          return '<div class="stat-card"><div class="stat-lbl">' + p.name + ' In/Out</div><div class="stat-val" style="color:' + p.color + '">' + fmt(p.inputTokens || 0) + ' / ' + fmt(p.outputTokens || 0) + '</div></div>'
            + (p.cacheReads ? '<div class="stat-card"><div class="stat-lbl">' + p.name + ' Cache</div><div class="stat-val" style="color:#666">' + fmt(p.cacheReads) + '</div></div>' : '')
            + '<div class="stat-card"><div class="stat-lbl">' + p.name + ' Msgs/Tools</div><div class="stat-val" style="color:' + p.color + '">' + fmt(p.messages || 0) + ' / ' + fmt(p.toolCalls || 0) + '</div></div>';
        }).join('');
        document.getElementById('stats').innerHTML = phtml + 
          '<div class="stat-card"><div class="stat-lbl">Total Dispatched</div><div class="stat-val" style="color:#FFF">' + data.stats.total + '</div></div>' +
          '<div class="stat-card"><div class="stat-lbl">Active Agents</div><div class="stat-val" style="color:#f59e0b">' + data.stats.running + '</div></div>' +
          '<div class="stat-card"><div class="stat-lbl">Tasks Completed</div><div class="stat-val" style="color:#10b981">' + data.stats.completed + '</div></div>' +
          '<div class="stat-card"><div class="stat-lbl">Errors</div><div class="stat-val" style="color:#ef4444">' + data.stats.errors + '</div></div>' +
          '<div class="stat-card"><div class="stat-lbl">Lines Processed</div><div class="stat-val" style="color:#3b82f6">' + data.stats.totalLines + '</div></div>' +
          '<div class="stat-card"><div class="stat-lbl">Data Processed</div><div class="stat-val" style="color:#8b5cf6">' + data.stats.totalBytes + '</div></div>';
        
        // Render completed agent history
        const historyEl = document.getElementById('history');
        const doneAgents = data.agents.filter(a => a.status === 'done' || a.status === 'error');
        if (doneAgents.length) {
          historyEl.innerHTML = '<div style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Completed Agents</div>' +
            doneAgents.map(a => {
              const logo = LOGOS[a.name] || a.icon;
              const badge = a.status === 'done' 
                ? '<span style="color:#10b981;">✅ DONE</span>' 
                : '<span style="color:#ef4444;">❌ ERROR</span>';
              const task = a.prompt ? a.prompt.substring(0, 100).replace(/</g,'&lt;') + (a.prompt.length > 100 ? '…' : '') : a.file;
              const proj = a.project ? ' — ' + a.project : '';
              return '<div style="background:#1A1A1A;border:1px solid #333;border-radius:6px;padding:10px 14px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;border-left:3px solid ' + a.color + ';">'
                + '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;"><span style="color:' + a.color + ';font-weight:600;">' + logo + ' ' + a.name + '</span><span style="color:#888;font-size:11px;">' + proj + '</span><span style="color:#A1A1AA;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + task + '</span></div>'
                + '<div style="display:flex;align-items:center;gap:12px;flex-shrink:0;font-size:12px;">' + badge + '<span style="color:#666;">' + a.lines + 'L</span></div></div>';
            }).join('');
        } else {
          historyEl.innerHTML = '';
        }

        // Render active agents
        const container = document.getElementById('agents');
        const activeAgents = data.agents.filter(a => a.status === 'running');
        if (!activeAgents.length) {
          container.innerHTML = '<div class="no-agents">Waiting for agents to dispatch...</div>';
        } else {
        container.innerHTML = activeAgents.map(a => {
          const logo = LOGOS[a.name] || a.icon;
          return '<div class="terminal-window">' +
            '<div class="terminal-header" style="border-bottom-color: ' + a.color + '40; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 12px 16px;">' +
              '<div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">' +
                '<div class="terminal-title" style="color: ' + a.color + '">' +
                  logo + ' ' + a.name + ' ' + (a.project ? '<span style="font-size:11px;color:#888;font-weight:400">— ' + a.project + '</span>' : '') +
                '</div>' +
                '<div class="terminal-badges">' +
                  '<span style="color: ' + a.color + '">[' + a.label + ']</span>' +
                  '<span>' + a.lines + 'L</span>' +
                '</div>' +
              '</div>' +
              (a.statusLine ? '<div style="font-size: 11px; color: #a3e635; background: #1a2e05; padding: 4px 10px; border-radius: 4px; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">▸ ' + a.statusLine.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>' : '') +
              (a.prompt ? '<div style="font-size: 11px; color: #E0E0E0; background: #222; padding: 6px 10px; border-radius: 4px; border-left: 3px solid ' + a.color + '; white-space: pre-wrap; width: 100%; word-break: break-word; max-height: 100px; overflow-y: auto;"><strong>Task:</strong> ' + a.prompt.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>' : '') +
            '</div>' +
            '<div class="terminal-body" id="term-' + a.file + '">' +
              a.lastLines.map(l => {
                let s = l.replace(/</g,'&lt;').replace(/>/g,'&gt;');
                let openSpans = 0;
                s = s.replace(/\\x1b\\[(\\d+)(;\\d+)*m/g, (m, c) => {
                  if (c === '0') {
                    let res = '';
                    while(openSpans > 0) { res += '</span>'; openSpans--; }
                    return res;
                  }
                  const colors = {
                    '1': '<span style="font-weight:bold;color:#FFF">',
                    '31': '<span style="color:#ef4444">', '32': '<span style="color:#22c55e">',
                    '33': '<span style="color:#f59e0b">', '34': '<span style="color:#3b82f6">',
                    '35': '<span style="color:#d946ef">', '36': '<span style="color:#0ea5e9">',
                    '90': '<span style="color:#737373">', '91': '<span style="color:#ef4444">',
                    '92': '<span style="color:#22c55e">', '93': '<span style="color:#f59e0b">',
                    '94': '<span style="color:#3b82f6">', '95': '<span style="color:#d946ef">',
                    '96': '<span style="color:#0ea5e9">'
                  };
                  if (colors[c]) { openSpans++; return colors[c]; }
                  return '';
                });
                let closes = '';
                while(openSpans > 0) { closes += '</span>'; openSpans--; }
                return '<div class="line">' + s + closes + '</div>';
              }).join('') +
            '</div>' +
          '</div>';
        }).join('');
        
        document.querySelectorAll('.terminal-body').forEach(el => {
          el.scrollTop = el.scrollHeight;
        });
        }
      } catch(e) {}
    }
    poll();
    setInterval(poll, 3000);
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  
  if (req.method === 'POST' && req.url === '/api/dispatch') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const p = spawn('node', ['.agent/skills/cli-agents/scripts/dispatch.mjs', payload.agent, payload.prompt, '--bg', '--notify'], { cwd: process.cwd(), detached: true, stdio: 'ignore' });
        p.unref();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch(e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.url === '/api/status') {
    try {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(await getAgentStatuses()));
    } catch(e) {
      res.writeHead(500);
      res.end('Error fetching statuses');
    }
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(DASHBOARD_HTML);
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`🤖 Agent Monitor already running on port ${PORT}.`);
    process.exit(0);
  } else {
    console.error('Server error:', e);
  }
});

server.listen(PORT, () => {
  console.log(`🤖 Agent Monitor running at http://localhost:${PORT}`);
});
