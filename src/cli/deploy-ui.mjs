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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// ─── HTML Wizard (src/cli/wizard.html) ───────────────────────────────────────
// HTML, CSS, and all client-side JS live in wizard.html.
// Keep this file focused on the Node.js server and API route handlers.

const HTML = readFileSync(path.join(__dirname, 'wizard.html'), 'utf8');

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
