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
import { spawn, spawnSync } from 'node:child_process';
import fs, { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';
import yaml from 'yaml';
import { BCRYPT_COST } from '../server/auth.mjs';


const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Brain data dir — all user config/data lives inside the meta-skill. */
function _brainDir() {
  return path.join(os.homedir(), '.agent', 'skills', 'total-recall');
}

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

// ─── Sync Install Options from Disk ──────────────────────────────────────────

export function syncInstallOptionsFromDisk() {
  try {
    const configFile = path.join(_brainDir(), 'config', 'wizard-config.json');
    if (fs.existsSync(configFile)) {
      const data = JSON.parse(fs.readFileSync(configFile, 'utf8') || '{}');
      _installOptions = _installOptions || {};
      if (data.deployTarget) _installOptions.deployTarget = data.deployTarget;
      if (data['cfg-domain']) _installOptions.domain = data['cfg-domain'];
      if (data['cfg-cloudflare-token']) _installOptions.cloudflareToken = data['cfg-cloudflare-token'];
      if (data.httpsMethod) _installOptions.httpsMethod = data.httpsMethod;
      if (data['cfg-localnet-host']) _installOptions.localnetHost = data['cfg-localnet-host'];
      if (data['cfg-localnet-user']) _installOptions.localnetUser = data['cfg-localnet-user'];
      if (data.vastInstanceId) _installOptions.vastInstanceId = data.vastInstanceId;
      if (data.vastSshHost) _installOptions.vastSshHost = data.vastSshHost;
      if (data.vastSshPort) _installOptions.vastSshPort = data.vastSshPort;
      if (data['cfg-dashboard-password']) _installOptions.dashboardPassword = data['cfg-dashboard-password'];
      if (data['cfg-github-token']) _installOptions.githubToken = data['cfg-github-token'];
      if (data.apiUrl) _installOptions.apiUrl = data.apiUrl;
      if (data.dashUrl) _installOptions.dashUrl = data.dashUrl;
      if (data.healthUrl) _installOptions.healthUrl = data.healthUrl;
      if (data.skipLocalInstall != null) _installOptions.skipLocalInstall = data.skipLocalInstall;
      if (data['cfg-cloud-provider']) _installOptions.cloudProvider = data['cfg-cloud-provider'];
      if (data['cfg-cloud-token']) _installOptions.cloudToken = data['cfg-cloud-token'];
      if (data['cfg-cloud-region']) _installOptions.cloudRegion = data['cfg-cloud-region'];
    }
  } catch (e) {
    console.error('Failed to sync wizard config from disk:', e);
  }
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

export function startDeployUI(port = 3001) {
  // Load saved wizard config from disk on startup
  syncInstallOptionsFromDisk();

  return new Promise((resolve) => {
    _server = http.createServer(async (req, res) => {
      // Set global CORS headers to allow cross-origin requests (e.g., from file:// or localhost/127.0.0.1 mismatches)
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

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
            _log = [];
            _done = false;
            _installOptions = opts;

            // Persist keys to secrets.enc
            try {
              const configDir = path.join(_brainDir(), 'config');
              const secretsPath = path.join(configDir, 'secrets.enc');
              fs.mkdirSync(configDir, { recursive: true });
              let secrets = {};
              if (fs.existsSync(secretsPath)) {
                try { secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8') || '{}'); } catch {}
              }
              if (opts.googleApiKey) {
                secrets.google_api_key = opts.googleApiKey.trim();
              }
              if (opts.openaiApiKey) {
                secrets.openai_api_key = opts.openaiApiKey.trim();
              }
              fs.writeFileSync(secretsPath, JSON.stringify(secrets, null, 2), { encoding: 'utf8', mode: 0o600 });
            } catch (e) {
              console.error('Failed to save API keys to secrets.enc:', e);
            }

            // Auto-persist options to wizard-config.json on server disk
            try {
              const configDir = path.join(_brainDir(), 'config');
              const configFile = path.join(configDir, 'wizard-config.json');
              fs.mkdirSync(configDir, { recursive: true });
              let current = {};
              if (fs.existsSync(configFile)) {
                try { current = JSON.parse(fs.readFileSync(configFile, 'utf8') || '{}'); } catch {}
              }
              if (opts.domain) current['cfg-domain'] = opts.domain;
              if (opts.cloudflareToken) current['cfg-cloudflare-token'] = opts.cloudflareToken;
              if (opts.httpsMethod) current['httpsMethod'] = opts.httpsMethod;
              if (opts.deployTarget) current['deployTarget'] = opts.deployTarget;
              if (opts.localnetHost) current['cfg-localnet-host'] = opts.localnetHost;
              if (opts.localnetUser) current['cfg-localnet-user'] = opts.localnetUser;
              if (opts.dashboardPassword) current['cfg-dashboard-password'] = opts.dashboardPassword;
              if (opts.githubToken) current['cfg-github-token'] = opts.githubToken;
              if (opts.cloudProvider) current['cfg-cloud-provider'] = opts.cloudProvider;
              if (opts.cloudToken) current['cfg-cloud-token'] = opts.cloudToken;
              if (opts.cloudRegion) current['cfg-cloud-region'] = opts.cloudRegion;
              if (opts.installGlobal !== undefined) current['installGlobal'] = opts.installGlobal;
              if (opts.projectPaths) current['projectPaths'] = opts.projectPaths;
              fs.writeFileSync(configFile, JSON.stringify(current, null, 2), { encoding: 'utf8', mode: 0o600 });

            } catch (e) {
              console.error('Failed to auto-persist install options on disk:', e);
            }

            // Unblock the main installer process
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
            syncInstallOptionsFromDisk();
            const opts = JSON.parse(body || '{}');
            const name = opts.name || 'default';
            const scope = opts.scope || '*';

            // Check if it is a remote deploy target
            if (_installOptions && (_installOptions.deployTarget === 'vastai' || _installOptions.deployTarget === 'localnet')) {
              let host = '';
              let port = '';
              let user = 'root';
              let cmdPrefix = '';

              if (_installOptions.deployTarget === 'vastai') {
                host = _installOptions.vastSshHost;
                port = _installOptions.vastSshPort;
                user = 'root';
                cmdPrefix = 'export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"; export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh";';
              } else {
                host = _installOptions.localnetHost;
                user = _installOptions.localnetUser || 'root';
                cmdPrefix = 'export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"; export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh";';
              }

              if (host) {
                const sshArgs = [];
                if (port) {
                  sshArgs.push('-p', String(port));
                }
                sshArgs.push('-o', 'StrictHostKeyChecking=no');
                sshArgs.push('-o', 'ConnectTimeout=10');
                sshArgs.push(`${user}@${host}`);

                // Command to run total-recall generate-pat
                const remoteCmd = `${cmdPrefix} if [ -f "$HOME/total-recall/bin/total-recall.mjs" ]; then node "$HOME/total-recall/bin/total-recall.mjs" generate-pat --name "${name}" --scope "${scope}"; else npx --yes total-recall generate-pat --name "${name}" --scope "${scope}"; fi`;
                sshArgs.push(remoteCmd);

                console.log(`[Proxy generate-pat] SSH command: ssh ${sshArgs.join(' ')}`);
                const r = spawnSync('ssh', sshArgs, { encoding: 'utf8', timeout: 25000 });

                if (r.status === 0) {
                  const stdout = r.stdout || '';
                  console.log(`[Proxy generate-pat] SSH Success. Output:\n${stdout}`);
                  const match = stdout.match(/Token:\s*(tr_[a-zA-Z0-9_-]+)/);
                  if (match && match[1]) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ token: match[1], note: 'Key generated successfully on remote host.' }));
                    return;
                  }
                } else {
                  console.error(`[Proxy generate-pat] SSH Failed (exit ${r.status}). Stderr:`, r.stderr);
                }
              }
            }

            // Fallback for local setups or if remote SSH fails:
            // First try to hit the local brain server on port 3000 if it is up
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 3000);
              const r = await fetch('http://localhost:3000/api/keys', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer local',
                },
                body,
                signal: controller.signal,
              });
              clearTimeout(timeoutId);
              if (r.ok) {
                const data = await r.json();
                res.writeHead(r.status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
                return;
              }
            } catch (e) {
              console.log('[Proxy generate-pat] Local brain server not running on port 3000. Generating local fallback token...');
            }

            // Direct local fallback using issueKey so it actually gets persisted to the local VFS keys.jsonl!
            const { issueKey } = await import('../server/keys.mjs');
            const key = issueKey(name, { scopes: scope.split(',').map(s => s.trim()) });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              token: key.token,
              note: 'Generated in local VFS key registry. Ensure the brain server is configured to use this vault.'
            }));
          } catch (e) {
            console.error('[Proxy generate-pat] Fallback failed:', e);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }

      // ── POST /api/reset-remote-password — reset password on remote VM or locally ──
      if (url === '/api/reset-remote-password' && req.method === 'POST') {
        let body = '';
        req.on('data', d => { body += d; });
        req.on('end', async () => {
          try {
            syncInstallOptionsFromDisk();
            const { password } = JSON.parse(body || '{}');
            if (!password || password.length < 8) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Password must be at least 8 characters long.' }));
              return;
            }

            // Check if it is a remote deploy target
            if (_installOptions && (_installOptions.deployTarget === 'vastai' || _installOptions.deployTarget === 'localnet')) {
              let host = '';
              let port = '';
              let user = 'root';
              let cmdPrefix = '';

              if (_installOptions.deployTarget === 'vastai') {
                host = _installOptions.vastSshHost;
                port = _installOptions.vastSshPort;
                user = 'root';
                cmdPrefix = 'export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"; export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh";';
              } else {
                host = _installOptions.localnetHost;
                user = _installOptions.localnetUser || 'root';
                cmdPrefix = 'export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"; export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh";';
              }

              if (host) {
                const sshArgs = [];
                if (port) {
                  sshArgs.push('-p', String(port));
                }
                sshArgs.push('-o', 'StrictHostKeyChecking=no');
                sshArgs.push('-o', 'ConnectTimeout=10');
                sshArgs.push(`${user}@${host}`);

                // Command to run total-recall reset-password
                const remoteCmd = `${cmdPrefix} if [ -f "$HOME/total-recall/bin/total-recall.mjs" ]; then node "$HOME/total-recall/bin/total-recall.mjs" reset-password "${password}"; else npx --yes total-recall reset-password "${password}"; fi`;
                sshArgs.push(remoteCmd);

                console.log(`[Proxy reset-remote-password] SSH command: ssh ${sshArgs.join(' ')}`);
                const r = spawnSync('ssh', sshArgs, { encoding: 'utf8', timeout: 25000 });

                if (r.status === 0) {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ ok: true, target: 'remote', note: 'Remote password successfully updated.' }));
                  return;
                } else {
                  console.error(`[Proxy reset-remote-password] SSH Failed (exit ${r.status}). Stderr:`, r.stderr);
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: `SSH Command failed on remote host: ${r.stderr || 'Unknown error'}` }));
                  return;
                }
              }
            }

            // Local fallback
            const { default: resetPassword } = await import('./reset-password.mjs');
            await resetPassword([password]);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, target: 'local', note: 'Local password successfully updated.' }));
          } catch (e) {
            console.error('[Proxy reset-remote-password] Failed:', e);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
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
            const configDir = path.join(_brainDir(), 'config');
            const configFile = path.join(configDir, 'research.yml');
            fs.mkdirSync(configDir, { recursive: true });

            // If mergeExisting=true (Settings page), blank fields keep existing values
            let existing = {};
            if (mergeExisting && fs.existsSync(configFile)) {
              try {
                const raw = fs.readFileSync(configFile, 'utf8');
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
            fs.writeFileSync(path.join(configDir, 'research.yml'), lines);
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
          const configFile = path.join(_brainDir(), 'config', 'research.yml');
          let hasTavily = false, hasBrave = false, hasExa = false, hasSerper = false, dailyLimitVal = 50;
          if (fs.existsSync(configFile)) {
            const raw = fs.readFileSync(configFile, 'utf8');
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

      // ── GET /api/import/rules — scan local rule files ──
      if (url === '/api/import/rules' && req.method === 'GET') {
        try {
          const query = new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams;
          const dirParam = query.get('dir');
          const dirs = dirParam ? [path.resolve(dirParam)] : [process.cwd(), os.homedir()];
          
          const { detectRuleFiles } = await import('../core/import-rules.mjs');
          const detected = detectRuleFiles(dirs);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, detected }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
        return;
      }

      // ── POST /api/import/rules — import selected rule files ──
      if (url === '/api/import/rules' && req.method === 'POST') {
        let body = '';
        req.on('data', d => { body += d; });
        req.on('end', async () => {
          try {
            const { files, force = false } = JSON.parse(body || '{}');
            if (!Array.isArray(files) || files.length === 0) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing files parameter or files is empty' }));
              return;
            }
            const { resolveAgentDir, resolveBrainDir } = await import('./agent-dir.mjs');
            const { detectRuleFiles, importRuleFiles } = await import('../core/import-rules.mjs');
            
            const brDir = resolveBrainDir();
            const vaultDir = path.join(brDir, 'memory-vault');
            
            // Gather parent directories to run detectRuleFiles and retrieve rich metadata
            const parentDirs = Array.from(new Set(files.map(f => path.dirname(f))));
            const detected = detectRuleFiles(parentDirs);
            const selectedFileObjects = detected.filter(f => files.includes(f.absolutePath));
            
            const result = importRuleFiles(selectedFileObjects, { force, vaultDir });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }

      // ── GET /api/get-search-usage — today's search count vs limit ──
      if (url === '/api/get-search-usage' && req.method === 'GET') {
        try {
          const usageFile  = path.join(_brainDir(), 'config', 'search-usage.json');
          const configFile = path.join(_brainDir(), 'config', 'research.yml');
          const today = new Date().toISOString().slice(0, 10);
          let todayCount = 0, dailyLimitVal = 50;
          if (fs.existsSync(usageFile)) {
            const usage = JSON.parse(fs.readFileSync(usageFile, 'utf8'));
            todayCount = usage[today] || 0;
          }
          if (fs.existsSync(configFile)) {
            const m = fs.readFileSync(configFile, 'utf8').match(/daily_web_search_limit:\s*(\d+)/);
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

      // ── POST /api/save-wizard-config — save setup wizard state to disk ──
      if (url === '/api/save-wizard-config' && req.method === 'POST') {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            const configDir = path.join(_brainDir(), 'config');
            const configFile = path.join(configDir, 'wizard-config.json');
            fs.mkdirSync(configDir, { recursive: true });

            // Read existing configuration if exists, and merge
            let current = {};
            if (fs.existsSync(configFile)) {
              try {
                current = JSON.parse(fs.readFileSync(configFile, 'utf8') || '{}');
              } catch {}
            }

            const updated = { ...current, ...data };
            fs.writeFileSync(configFile, JSON.stringify(updated, null, 2), { encoding: 'utf8', mode: 0o600 });
            syncInstallOptionsFromDisk();

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }

      // ── GET /api/get-wizard-config — get saved setup wizard state from disk ──
      if (url === '/api/get-wizard-config' && req.method === 'GET') {
        try {
          syncInstallOptionsFromDisk();
          const configFile = path.join(_brainDir(), 'config', 'wizard-config.json');
          let saved = {};
          if (fs.existsSync(configFile)) {
            saved = JSON.parse(fs.readFileSync(configFile, 'utf8') || '{}');
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(saved));
        } catch {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({}));
        }
        return;
      }

      // ── POST /api/reset-wizard-config — reset setup wizard state ──
      if (url === '/api/reset-wizard-config' && req.method === 'POST') {
        try {
          const configFile = path.join(_brainDir(), 'config', 'wizard-config.json');
          if (fs.existsSync(configFile)) {
            fs.unlinkSync(configFile);
          }
          // Reset server-side in-memory setup logs and status
          _log = [];
          _done = false;
          _installOptionsReceived = false;
          _installOptions = null;
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
        return;
      }

      // ── GET /api/detect-projects — scan common code dirs for git repos ──
      if (url === '/api/detect-projects' && req.method === 'GET') {
        const HOME = os.homedir();
        const codeDirs = [
          path.join(HOME, 'Github'),
          path.join(HOME, 'github'),
          path.join(HOME, 'Projects'),
          path.join(HOME, 'projects'),
          path.join(HOME, 'Developer'),
          path.join(HOME, 'developer'),
          path.join(HOME, 'Code'),
          path.join(HOME, 'code'),
          path.join(HOME, 'repos'),
          path.join(HOME, 'Repos'),
          path.join(HOME, 'src'),
          path.join(HOME, 'workspace'),
          path.join(HOME, 'Workspace'),
          path.join(HOME, 'dev'),
          path.join(HOME, 'Dev'),
          path.join(HOME, 'Desktop'),
        ];
        const projects = [];
        const seen = new Set();
        for (const dir of codeDirs) {
          try {
            if (!fs.existsSync(dir)) continue;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (!entry.isDirectory()) continue;
              if (entry.name.startsWith('.')) continue;
              const fullPath = path.join(dir, entry.name);
              if (seen.has(fullPath)) continue;
              // Check if it's a git repo or has package.json (code project)
              const hasGit = fs.existsSync(path.join(fullPath, '.git'));
              const hasPkg = fs.existsSync(path.join(fullPath, 'package.json'));
              const hasCargo = fs.existsSync(path.join(fullPath, 'Cargo.toml'));
              const hasPyproject = fs.existsSync(path.join(fullPath, 'pyproject.toml'));
              const hasGoMod = fs.existsSync(path.join(fullPath, 'go.mod'));
              if (hasGit || hasPkg || hasCargo || hasPyproject || hasGoMod) {
                seen.add(fullPath);
                // Check if already has a Total Recall project brain
                const hasBrain = fs.existsSync(path.join(fullPath, '.agent', 'skills', 'total-recall'));
                projects.push({ name: entry.name, path: fullPath, hasGit, hasBrain });
              }
            }
          } catch { /* skip unreadable dirs */ }
        }
        // Sort alphabetically by name
        projects.sort((a, b) => a.name.localeCompare(b.name));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ projects }));
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
          if (paths.some(p => { try { return fs.existsSync(p); } catch { return false; } })) {
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
          const { ides = [], installRelay = true, installObsidian = false, brainUrl, token } = opts;
          const results = [];

          // IDE-to-connect-client mapping (coding agents only — Obsidian handled separately)
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
                const agentDir = resolveAgentDir();
                const configDir = path.join(agentDir, 'skills', 'total-recall', 'config');
                fs.mkdirSync(configDir, { recursive: true });
                const config = { url: brainUrl };
                if (token) config.token = token;
                fs.writeFileSync(path.join(configDir, 'brain.json'), JSON.stringify(config, null, 2));
              }
              const rr = sp(nodeBin, relayArgs, { encoding: 'utf8', timeout: 30000 });
              relayResult = { ok: rr.status === 0, message: rr.status === 0 ? 'Installed as system service (starts on boot)' : (rr.stderr || rr.stdout || '').trim().split('\n').pop() };
            } catch (e) {
              relayResult = { ok: false, message: e.message };
            }
          }

          // Connect Obsidian vault sync
          let obsidianResult = null;
          if (installObsidian) {
            try {
              const obsArgs = [scriptPath, 'connect', 'obsidian'];
              if (brainUrl) obsArgs.push('--brain', brainUrl);
              obsArgs.push('--force');
              const or = sp(nodeBin, obsArgs, { encoding: 'utf8', timeout: 30000 });
              obsidianResult = { ok: or.status === 0, message: or.status === 0 ? 'Vault sync configured' : (or.stderr || or.stdout || '').trim().split('\n').pop() };
            } catch (e) {
              obsidianResult = { ok: false, message: e.message };
            }
          }

          // Persist the connected IDE choices to wizard-config.json
          try {
            const { resolveBrainDir } = await import('./agent-dir.mjs');
            const brDir = resolveBrainDir();
            const configFilePath = path.join(brDir, 'config', 'wizard-config.json');
            let current = {};
            if (fs.existsSync(configFilePath)) {
              current = JSON.parse(fs.readFileSync(configFilePath, 'utf8') || '{}');
            }
            current.configuredIdes = ides;
            fs.mkdirSync(path.dirname(configFilePath), { recursive: true });
            fs.writeFileSync(configFilePath, JSON.stringify(current, null, 2), 'utf8');
          } catch (e) {
            console.error('Error persisting configuredIdes to wizard-config.json:', e);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, results, relayResult, obsidianResult }));
        });
        return;
      }

      // ── POST /api/vastai-instances ──
      if (url === '/api/vastai-instances' && req.method === 'POST') {
        let body = '';
        req.on('data', d => { body += d; });
        req.on('end', async () => {
          try {
            const { vastaiKey } = JSON.parse(body || '{}');
            if (!vastaiKey) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing vastaiKey' }));
              return;
            }
            const data = await vastAPI(vastaiKey, 'GET', '/instances/');
            if (data.success === false) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: data.msg }));
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, instances: data.instances || [] }));
            }
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }

      // ── POST /api/destroy-vastai-instance ──
      if (url === '/api/destroy-vastai-instance' && req.method === 'POST') {
        let body = '';
        req.on('data', d => { body += d; });
        req.on('end', async () => {
          try {
            const { vastaiKey, instanceId } = JSON.parse(body || '{}');
            if (!vastaiKey || !instanceId) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing vastaiKey or instanceId' }));
              return;
            }
            const data = await vastAPI(vastaiKey, 'DELETE', `/instances/${instanceId}/`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: data.success !== false, data }));
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }

      // ── POST /api/provision-vastai ──
      if (url === '/api/provision-vastai' && req.method === 'POST') {
        let body = '';
        req.on('data', d => { body += d; });
        req.on('end', async () => {
          try {
            const { vastaiKey, instanceId, dashboardPassword } = JSON.parse(body || '{}');
            if (!vastaiKey) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing vastaiKey' }));
              return;
            }
            
            _log = [];
            _done = false;
            provisionVastAI(vastaiKey, instanceId, dashboardPassword).catch(err => {
              console.error('provisionVastAI background error:', err);
              emitProgress('error', err.message);
            });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }

      // ── POST /api/github/configure — configure automatic GitHub backup ──
      if (url === '/api/github/configure' && req.method === 'POST') {
        let body = '';
        req.on('data', d => { body += d; });
        req.on('end', async () => {
          res.writeHead(200, {
            'Content-Type': 'application/x-ndjson',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          });

          const send = (data) => {
            res.write(JSON.stringify(data) + '\n');
          };

          const log = (msg) => {
            send({ type: 'log', msg });
          };

          const step = (stepIndex, status, msg) => {
            send({ type: 'step', stepIndex, status, msg });
            if (msg) log(msg);
          };

          try {
            const { token } = JSON.parse(body || '{}');
            if (!token) {
              throw new Error('Missing Personal Access Token.');
            }

            // ── Step 1: Authenticate with GitHub ──
            step(1, 'active', '🔄 Authenticating with GitHub API...');
            const userRes = await fetch('https://api.github.com/user', {
              headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Total-Recall-Wizard'
              }
            });

            if (!userRes.ok) {
              const errText = await userRes.text();
              throw new Error(`GitHub Authentication failed (status ${userRes.status}). Ensure your token is correct and has the required scopes.`);
            }

            const userData = await userRes.json();
            const username = userData.login;
            step(1, 'success', `✅ Authenticated successfully as @${username}`);

            // ── Step 2: Create Private Repo ──
            step(2, 'active', '🔄 Provisioning private repository "total-recall-brain" on GitHub...');
            const repoRes = await fetch('https://api.github.com/user/repos', {
              method: 'POST',
              headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'Total-Recall-Wizard'
              },
              body: JSON.stringify({
                name: 'total-recall-brain',
                private: true,
                description: 'Total Recall Sovereign AI memory backup (encrypted VFS)',
                has_issues: false,
                has_projects: false,
                has_wiki: false
              })
            });

            if (repoRes.status === 201) {
              step(2, 'success', '✅ Private repository "total-recall-brain" successfully created!');
            } else if (repoRes.status === 422) {
              // Gracefully handle if repository already exists
              const repoErr = await repoRes.json();
              if (repoErr.errors && repoErr.errors.some(e => e.message && e.message.includes('already exists'))) {
                step(2, 'success', 'ℹ️ Repository "total-recall-brain" already exists. Continuing with configuration.');
              } else {
                throw new Error(`Failed to create repository: ${JSON.stringify(repoErr)}`);
              }
            } else {
              const errText = await repoRes.text();
              throw new Error(`Failed to create repository (status ${repoRes.status}): ${errText}`);
            }

            const backupUrl = `https://${username}:${token}@github.com/${username}/total-recall-brain.git`;

            // ── Step 3: Setup Local Git Repository ──
            step(3, 'active', '🔄 Setting up git repository in ~/.agent...');
            const agentDir = path.join(os.homedir(), '.agent');
            fs.mkdirSync(agentDir, { recursive: true });

            const git = (...args) => {
              const result = spawnSync('git', args, { cwd: agentDir, encoding: 'utf8' });
              return {
                ok: result.status === 0,
                stdout: result.stdout?.trim() || '',
                stderr: result.stderr?.trim() || '',
              };
            };

            const gitDir = path.join(agentDir, '.git');
            if (!fs.existsSync(gitDir)) {
              log('🔧 Initializing git repository in ~/.agent');
              const init = git('init', '-b', 'main');
              if (!init.ok) {
                git('init');
                git('checkout', '-b', 'main');
              }
              const gitignore = path.join(agentDir, '.gitignore');
              if (!fs.existsSync(gitignore)) {
                fs.writeFileSync(gitignore, 'skills/total-recall/memory-derived/embeddings.jsonl\n');
                log('📝 Created default .gitignore');
              }
            }

            // Configure identities if missing so commit doesn't fail
            const checkEmail = git('config', 'user.email');
            if (!checkEmail.ok || !checkEmail.stdout) {
              log('🔧 Setting local git email to backup@total-recall');
              git('config', 'user.email', 'backup@total-recall');
            }
            const checkName = git('config', 'user.name');
            if (!checkName.ok || !checkName.stdout) {
              log('🔧 Setting local git name to Total Recall');
              git('config', 'user.name', 'Total Recall');
            }

            // Add or update remote
            const remoteCheck = git('remote', 'get-url', 'backup');
            if (!remoteCheck.ok) {
              git('remote', 'add', 'backup', backupUrl);
              log('🔗 Added remote "backup" pointing to your private GitHub repository');
            } else {
              git('remote', 'set-url', 'backup', backupUrl);
              log('🔗 Updated remote "backup" URL');
            }

            // Optimize Git http.postBuffer for pushing large directories (e.g. 500MB)
            log('⚙️ Optimizing buffer size to prevent push failures (git config http.postBuffer 524288000)...');
            git('config', 'http.postBuffer', '524288000');
            git('config', 'core.bigFileThreshold', '10m');

            step(3, 'success', '✅ Local repository optimized and configured successfully!');

            // ── Step 4: Perform Initial Push ──
            step(4, 'active', '🔄 Staging and pushing initial vault backup (this may take a minute)...');
            log('📂 Staging files in ~/.agent...');
            git('add', '-A');

            const status = git('status', '--porcelain');
            const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

            if (!status.stdout) {
              log('✅ No new changes to backup.');
            } else {
              log('💾 Creating backup commit...');
              const commit = git('commit', '-m', `backup: setup ${stamp}`);
              if (!commit.ok) {
                log(`⚠️ Commit output: ${commit.stderr}`);
              }
            }

            log('📤 Pushing files to GitHub main branch...');
            const push = git('push', 'backup', 'HEAD:main', '--force');
            if (!push.ok) {
              throw new Error(`Push failed: ${push.stderr}`);
            }

            step(4, 'success', '✅ Initial backup successfully pushed to your GitHub repository!');

            // ── Step 5: Register Daily Backup Scheduler ──
            step(5, 'active', '🔄 Installing automated daily backup scheduler (2:00 AM)...');

            const nodeBin = process.execPath;
            const scriptPath = new URL('../../bin/total-recall.mjs', import.meta.url).pathname;

            log(`⚙️ Running setup deploy helper to install cron/launchd plist...`);
            const schedResult = spawnSync(nodeBin, [scriptPath, 'deploy', '--backup-repo', backupUrl], {
              encoding: 'utf8',
              env: { ...process.env, HOME: os.homedir() }
            });

            if (schedResult.status !== 0) {
              log(`⚠️ Scheduler setup stdout: ${schedResult.stdout}`);
              log(`⚠️ Scheduler setup stderr: ${schedResult.stderr}`);
              throw new Error(`Failed to configure automatic backup scheduler: ${schedResult.stderr || schedResult.stdout}`);
            }

            if (schedResult.stdout) {
              log(schedResult.stdout);
            }
            step(5, 'success', '✅ Automated daily backup scheduler successfully registered!');

            // ── Step 6: Store Secrets ──
            log('🔒 Saving token securely in local files...');
            const configDir = path.join(_brainDir(), 'config');

            // Persist to secrets.enc
            const secretsPath = path.join(configDir, 'secrets.enc');
            let secrets = {};
            if (fs.existsSync(secretsPath)) {
              try { secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8') || '{}'); } catch {}
            }
            secrets.github_token = token;
            fs.writeFileSync(secretsPath, JSON.stringify(secrets, null, 2), { encoding: 'utf8', mode: 0o600 });

            // Persist to wizard-config.json
            const configFile = path.join(configDir, 'wizard-config.json');
            let current = {};
            if (fs.existsSync(configFile)) {
              try { current = JSON.parse(fs.readFileSync(configFile, 'utf8') || '{}'); } catch {}
            }
            current['cfg-github-token'] = token;
            current['backupRepo'] = backupUrl;
            fs.writeFileSync(configFile, JSON.stringify(current, null, 2), { encoding: 'utf8', mode: 0o600 });

            log('✅ Encryption keys and tokens written.');

            send({
              type: 'success',
              msg: `GitHub Automatic Backup has been configured! Your brain is backed up to the private total-recall-brain repository, and the daily backup scheduler (2:00 AM) is fully active.`
            });
          } catch (err) {
            log(`❌ Error: ${err.message}`);
            send({ type: 'error', msg: err.message });
          } finally {
            res.end();
          }
        });
        return;
      }

      // ── POST /api/install-cli ──
      if (url === '/api/install-cli' && req.method === 'POST') {
        let body = '';
        req.on('data', d => { body += d; });
        req.on('end', async () => {
          try {
            const { agent } = JSON.parse(body || '{}');
            if (!agent) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing agent parameter' }));
              return;
            }

            console.log(`[Wizard] Triggering installation for CLI agent: ${agent}`);
            
            let cmd = '';
            if (agent === 'claude-code') {
              cmd = 'npm install -g @anthropic-ai/claude-code';
            } else if (agent === 'antigravity') {
              cmd = 'npm link';
            } else if (agent === 'codex') {
              cmd = 'npm install -g @openai/codex || true';
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Unknown agent: ${agent}` }));
              return;
            }

            // Run locally or remotely depending on deployTarget
            syncInstallOptionsFromDisk();
            if (_installOptions && (_installOptions.deployTarget === 'vastai' || _installOptions.deployTarget === 'localnet')) {
              let host = '';
              let port = '';
              let user = 'root';
              let cmdPrefix = 'export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH";';

              if (_installOptions.deployTarget === 'vastai') {
                host = _installOptions.vastSshHost;
                port = _installOptions.vastSshPort;
                user = 'root';
              } else {
                host = _installOptions.localnetHost;
                user = _installOptions.localnetUser || 'root';
              }

              if (host) {
                const sshArgs = [];
                if (port) sshArgs.push('-p', String(port));
                sshArgs.push('-o', 'StrictHostKeyChecking=no');
                sshArgs.push('-o', 'ConnectTimeout=10');
                sshArgs.push(`${user}@${host}`);

                // Execute the command remotely
                const remoteCmd = `${cmdPrefix} cd /Users/gregoryiteen/github/total-recall && ${cmd}`;
                sshArgs.push(remoteCmd);

                console.log(`[Proxy install-cli] Remote SSH command: ssh ${sshArgs.join(' ')}`);
                const { spawnSync: sp } = await import('node:child_process');
                const r = sp('ssh', sshArgs, { encoding: 'utf8', timeout: 60000 });

                if (r.status === 0) {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ ok: true, output: r.stdout }));
                } else {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: r.stderr || r.stdout || 'Remote installation failed' }));
                }
                return;
              }
            }

            // Local installation
            const { spawnSync: sp } = await import('node:child_process');
            console.log(`[Wizard] Running local command: ${cmd}`);
            const r = sp('sh', ['-c', cmd], { encoding: 'utf8', timeout: 60000, cwd: process.cwd() });

            if (r.status === 0) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, output: r.stdout }));
            } else {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: r.stderr || r.stdout || 'Local installation failed' }));
            }
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
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

// ── Vast.ai auto-provisioner ────────────────────────────────────────────────────────

export async function vastAPI(key, method, path, body) {
  const { default: https } = await import('node:https');
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(`/api/v0${path}`, 'https://console.vast.ai');
    const opts = {
      method,
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(url, opts, (r) => {
      let buf = '';
      r.on('data', c => { buf += c; });
      r.on('end', () => {
        const isSuccessStatus = r.statusCode >= 200 && r.statusCode < 300;
        let parsed = null;
        try {
          parsed = JSON.parse(buf);
        } catch {
          parsed = null;
        }

        if (!isSuccessStatus) {
          console.error(`[Vast.ai API Error] ${method} ${path} -> HTTP ${r.statusCode}:`, buf);
          resolve({
            success: false,
            error: 'http_error',
            status: r.statusCode,
            msg: (parsed && (parsed.msg || parsed.error)) || buf.trim() || `HTTP status ${r.statusCode}`
          });
          return;
        }

        if (parsed === null) {
          console.error(`[Vast.ai API Error] Failed to parse JSON response for ${method} ${path}:`, buf);
          resolve({
            success: false,
            error: 'parse_error',
            msg: buf.trim() || 'Empty response'
          });
          return;
        }

        resolve(parsed);
      });
    });
    req.on('error', (err) => {
      console.error(`[Vast.ai API Network Error] ${method} ${path}:`, err);
      resolve({
        success: false,
        error: 'network_error',
        msg: err.message
      });
    });
    if (data) req.write(data);
    req.end();
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function isTunnelUrlAlive(url) {
  try {
    const healthUrl = `${url}/health`;
    console.log(`[Health Check] Checking if remote endpoint is responsive: ${healthUrl}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(healthUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    console.log(`[Health Check] Remote endpoint responded with status: ${res.status}`);
    if (res.status === 200 || res.status === 401 || res.status === 403 || res.status === 503) {
      return true;
    }
  } catch (err) {
    console.log(`[Health Check] Connection failed for ${url}: ${err.message}`);
  }
  return false;
}

export async function provisionVastAI(apiKey, instanceId = null, dashboardPassword = 'totalrecall') {
  let finalInstanceId = instanceId;
  const isAdopting = !!finalInstanceId;
  const maxAttempts = isAdopting ? 1 : 5;
  const failedOfferIds = new Set();
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;
    if (!isAdopting) {
      if (attempt > 1) {
        emitProgress('log', `🔄 Retry attempt ${attempt}/${maxAttempts}: Finding another GPU offer...`);
      }
      emitProgress('log', '🔍 Searching for available GPU instances on Vast.ai...');

      // Search for cheapest compatible GPU with Ubuntu, enough disk (strictly 24GB+ VRAM for the 26B MoE model)
      const queryObj = {
        gpu_name: {
          in: [
            "RTX 3090", "RTX 4090", "A5000", "RTX A5000", "A6000", "RTX A6000",
            "RTX 6000 Ada", "A100", "L40", "L40S"
          ]
        },
        disk_space: { gte: 40 },
        reliability2: { gte: 0.9 },
        rentable: { eq: true },
        order: [["dph_total", "asc"]],
        limit: 10
      };

      const path = `/bundles/?q=${encodeURIComponent(JSON.stringify(queryObj))}`;
      console.log(`[Vast.ai] Querying available offers using path: ${path}`);
      const offers = await vastAPI(apiKey, 'GET', path);

      if (offers.success === false) {
        console.error('[Vast.ai] API query failed:', offers);
        emitProgress('log', `⚠️ Vast.ai API query warning: ${offers.msg || offers.error || 'Unknown error'}`);
        if (attempt === maxAttempts) {
          emitProgress('error', `❌ Vast.ai API query failed repeatedly. Last error: ${offers.msg || offers.error || 'Unknown error'}`);
          return;
        }
        await sleep(5000);
        continue;
      }

      const offerList = (offers.offers || []).filter(o => {
        if (!o.rentable || failedOfferIds.has(o.id)) return false;
        const geo = (o.geolocation || '').toLowerCase();
        if (geo.includes('cn') || geo.includes('china') || geo.includes('russia') || geo.includes('ru')) {
          console.log(`[Vast.ai] Skipping offer ${o.id} due to Chinese/Russian geolocation: ${o.geolocation}`);
          return false;
        }
        return true;
      });
      if (!offerList.length) {
        console.warn('[Vast.ai] No suitable rentable GPU offers found.');
        emitProgress('log', '⚠️ No suitable GPU offers available right now or all tried offers failed.');
        if (attempt === maxAttempts) {
          emitProgress('error', '❌ No suitable GPU instances available right now. Try again in a few minutes.');
          return;
        }
        await sleep(5000);
        continue;
      }

      const best = offerList[0];
      failedOfferIds.add(best.id);
      emitProgress('log', `✅ Found: ${best.gpu_name} — $${(best.dph_total * 24 * 30).toFixed(2)}/mo at ${best.location?.country || 'unknown location'}`);
      emitProgress('log', '🚀 Creating your instance...');

      // Create the instance
      const created = await vastAPI(apiKey, 'PUT', `/asks/${best.id}/`, {
        client_id: 'me',
        image: 'nvidia/cuda:12.1.1-runtime-ubuntu22.04',
        disk: 40,
        onstart: 'export AUTO_DEPLOY=1; export HTTPS_METHOD=cloudflare-quick; (apt-get update && apt-get install -y zstd) >/dev/null 2>&1; curl -fsSL https://raw.githubusercontent.com/gregiteen/total-recall/main/install.sh -o /tmp/install.sh && bash /tmp/install.sh && rm /tmp/install.sh',
        env: {},
        runtype: 'ssh',
        image_login: null,
      });

      if (!created.success) {
        emitProgress('log', `⚠️ Failed to create instance on offer ${best.id}: ${created.msg || created.error || JSON.stringify(created)}`);
        if (attempt === maxAttempts) {
          emitProgress('error', `❌ Failed to create instance after ${maxAttempts} attempts.`);
          return;
        }
        await sleep(5000);
        continue;
      }

      finalInstanceId = created.new_contract;
      emitProgress('log', `✅ Instance created (ID: ${finalInstanceId}). Waiting for it to boot...`);
    } else {
      emitProgress('log', `🔄 Adopting existing Vast.ai instance (ID: ${finalInstanceId}). Waiting for it to boot...`);
    }

    // Poll until running
    let instance = null;
    let errorCount = 0;
    let pollFailed = false;

    for (let i = 0; i < 120; i++) {
      await sleep(15000);
      
      // Query general /instances/ due to Vast.ai API GET /instances/{id}/ bug
      const status = await vastAPI(apiKey, 'GET', '/instances/');
      
      if (status.success === false) {
        errorCount++;
        console.warn(`[Vast.ai API Poll Warning] Attempt ${i + 1} failed:`, status);
        emitProgress('log', `⚠️ Vast.ai API temporary warning: ${status.msg || status.error || 'Network query issue'} (Retrying...)`);
        if (errorCount >= 10) {
          emitProgress('log', `⚠️ Vast.ai API failed repeatedly. Message: ${status.msg || status.error || 'Unknown error'}`);
          pollFailed = true;
          break;
        }
        continue;
      }
      
      // Reset error count on successful query
      errorCount = 0;
      
      const allInstances = status.instances || [];
      instance = allInstances.find(inst => inst.id === Number(finalInstanceId));
      
      if (!instance) {
        // Right after creation, sometimes it takes a few seconds to appear in the instances list
        if (i < 3) {
          emitProgress('log', `⏳ Instance ID ${finalInstanceId} not visible in account yet. Waiting for Vast.ai synchronization...`);
          continue;
        }
        emitProgress('log', `⚠️ Instance ${finalInstanceId} was not found in your Vast.ai account. It may have been rejected or deleted by the host.`);
        pollFailed = true;
        break;
      }
      
      const state = instance.actual_status || instance.status || 'loading';
      const statusMsg = instance.status_msg || '';
      
      // Display status with detail if available
      if (statusMsg) {
        emitProgress('log', `⏳ Instance status: ${state} (${statusMsg})...`);
      } else {
        emitProgress('log', `⏳ Instance status: ${state}...`);
      }
      
      if (state === 'running') {
        break;
      }
      
      // Early failure detection: stopped, offline, or broken, or having daemon errors in status_msg
      const hasCriticalError = statusMsg && (statusMsg.toLowerCase().includes('error') || statusMsg.toLowerCase().includes('failed'));
      if (state === 'broken' || state === 'offline' || state === 'stopped' || hasCriticalError) {
        emitProgress('log', `⚠️ Instance failed to boot (state: '${state}'): ${statusMsg || 'Host failed to start container.'}`);
        pollFailed = true;
        break;
      }
    }

    if (pollFailed || !instance || (instance.actual_status !== 'running' && instance.status !== 'running')) {
      if (finalInstanceId && !isAdopting) {
        // Best effort destroy the failed/broken contract so the user doesn't get charged
        console.log(`[Vast.ai] Best-effort destroying failed instance ${finalInstanceId}`);
        await vastAPI(apiKey, 'DELETE', `/instances/${finalInstanceId}/`);
      }
      
      if (attempt < maxAttempts) {
        emitProgress('log', `⚠️ Booting failed or instance rejected for ID ${finalInstanceId || ''}. Retrying...`);
        finalInstanceId = null;
        await sleep(5000);
        continue;
      } else {
        emitProgress('error', `❌ Provisioning failed after ${maxAttempts} attempts. Check the error log or your Vast.ai dashboard.`);
        return;
      }
    }

    // Succeeded!
    emitProgress('log', '✅ Instance is running! Total Recall is installing...');
    emitProgress('log', `📍 SSH: ssh -p ${instance.ssh_port} root@${instance.ssh_host}`);
    emitProgress('log', '⏳ Waiting for remote SSH server to start...');

    // Wait for SSH to boot
    let sshReady = false;
    for (let attempt = 1; attempt <= 36; attempt++) {
      try {
        const res = spawnSync('ssh', [
          '-p', String(instance.ssh_port),
          '-o', 'StrictHostKeyChecking=no',
          '-o', 'ConnectTimeout=5',
          `root@${instance.ssh_host}`,
          'echo "SSH_OK"'
        ], { encoding: 'utf8', timeout: 6000 });
        if (res.stdout && res.stdout.includes('SSH_OK')) {
          sshReady = true;
          break;
        }
      } catch (e) {
        console.error(`SSH check attempt ${attempt} failed:`, e.message);
      }
      emitProgress('log', `⏳ Waiting for SSH server to start (attempt ${attempt}/36)...`);
      await sleep(5000);
    }

    if (!sshReady) {
      emitProgress('error', '❌ Could not connect to remote instance via SSH after 3 minutes. Please check your SSH keys or retry provisioning.');
      return;
    }
    emitProgress('log', '✅ SSH connection established! Streaming installation log...');

    // Stream logs via tail in the background
    const tailProc = spawn('ssh', [
      '-p', String(instance.ssh_port),
      '-o', 'StrictHostKeyChecking=no',
      `root@${instance.ssh_host}`,
      'tail -f -n +1 /var/log/onstart.log 2>/dev/null'
    ]);

    let tunnelUrl = null;
    let buffer = '';

    const handleData = (data) => {
      buffer += data.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop(); // keep last incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        emitProgress('log', `[Remote VM] ${line}`);

        // Detect the trycloudflare URL!
        const match = line.match(/https:\/\/.*\.trycloudflare\.com/);
        if (match) {
          console.log(`[Remote VM] Log streamed trycloudflare candidate: ${match[0]}`);
        }
      }
    };

    tailProc.stdout.on('data', handleData);
    tailProc.stderr.on('data', handleData);
    tailProc.on('error', (err) => {
      console.error('Tail process error:', err);
    });

    // Poll in parallel for the trycloudflare URL
    let pollCount = 0;
    while (!tunnelUrl && pollCount < 360) { // poll for up to 30 minutes
      pollCount++;
      await sleep(5000);
      try {
        const res = spawnSync('ssh', [
          '-p', String(instance.ssh_port),
          '-o', 'StrictHostKeyChecking=no',
          `root@${instance.ssh_host}`,
          'grep -o "https://.*\\.trycloudflare\\.com" /var/log/onstart.log ~/.agent/logs/cloudflared.log 2>/dev/null | tail -n 1'
        ], { encoding: 'utf8', timeout: 5000 });
        if (res.stdout && res.stdout.includes('trycloudflare.com')) {
          const found = res.stdout.match(/https:\/\/.*\.trycloudflare\.com/);
          if (found) {
            const candidateUrl = found[0];
            const alive = await isTunnelUrlAlive(candidateUrl);
            if (alive) {
              tunnelUrl = candidateUrl;
              break;
            } else {
              console.log(`[Remote VM] Found tunnel candidate ${candidateUrl} but it is not responsive yet.`);
            }
          }
        }
      } catch (e) {
        // ignore polling SSH errors
      }
    }

    // Cleanup tail process
    try { tailProc.kill(); } catch {}

    if (!tunnelUrl) {
      emitProgress('error', '❌ Installation completed but failed to resolve Cloudflare Quick Tunnel URL. Please check the remote VM logs.');
      return;
    }

    // Configure remote password securely once SSH is ready and tunnel is verified
    if (dashboardPassword) {
      emitProgress('log', '🔒 Configuring remote admin dashboard password...');
      try {
        const hash = bcrypt.hashSync(dashboardPassword, BCRYPT_COST);
        const forceReset = (!dashboardPassword || dashboardPassword === 'totalrecall');
        // We run a remote node one-liner to update security.yml on the remote VM
        const remoteScript = `
const fs = require('fs');
const path = require('path');
const os = require('os');

// Wait for config dir and security.yml to exist if needed
const securityFile = path.join(os.homedir(), '.agent', 'skills', 'total-recall', 'config', 'security.yml');
for (let i = 0; i < 15; i++) {
  if (fs.existsSync(securityFile)) break;
  require('child_process').spawnSync('sleep', ['1']);
}

if (!fs.existsSync(securityFile)) {
  fs.mkdirSync(path.dirname(securityFile), { recursive: true });
  fs.writeFileSync(securityFile, 'dashboard:\\n  password_hash: null\\n  force_password_reset: ${forceReset}\\n', 'utf8');
}

let content = fs.readFileSync(securityFile, 'utf8');
if (content.includes('dashboard:')) {
  const lines = content.split('\\n');
  let inDashboard = false;
  let hashSet = false;
  let forceResetSet = false;
  
  for (let j = 0; j < lines.length; j++) {
    const line = lines[j];
    if (line.startsWith('dashboard:')) {
      inDashboard = true;
      continue;
    }
    if (inDashboard && (line.startsWith('privacy:') || line.startsWith('yolo_mode:') || line.startsWith('api:') || line.startsWith('rate_limits:') || line.startsWith('bind:') || line.startsWith('network:'))) {
      inDashboard = false;
    }
    
    if (inDashboard) {
      if (line.includes('password_hash:')) {
        lines[j] = '  password_hash: "${hash}"';
        hashSet = true;
      }
      if (line.includes('force_password_reset:')) {
        lines[j] = '  force_password_reset: ${forceReset}';
        forceResetSet = true;
      }
    }
  }
  
  // Find where dashboard starts to inject missing fields
  const dbIndex = lines.findIndex(l => l.startsWith('dashboard:'));
  if (dbIndex !== -1) {
    if (!hashSet) {
      lines.splice(dbIndex + 1, 0, '  password_hash: "${hash}"');
    }
    if (!forceResetSet) {
      lines.splice(dbIndex + 1, 0, '  force_password_reset: ${forceReset}');
    }
  }
  
  fs.writeFileSync(securityFile, lines.join('\\n'), 'utf8');
} else {
  content += '\\ndashboard:\\n  password_hash: "${hash}"\\n  force_password_reset: ${forceReset}\\n';
  fs.writeFileSync(securityFile, content, 'utf8');
}
console.log("REMOTE_PASS_OK");
`;
        
        const res = spawnSync('ssh', [
          '-p', String(instance.ssh_port),
          '-o', 'StrictHostKeyChecking=no',
          `root@${instance.ssh_host}`,
          `node -e ${JSON.stringify(remoteScript)}`
        ], { encoding: 'utf8', timeout: 15000 });
        
        console.log('[Remote Security Setup] stdout:', res.stdout);
        console.log('[Remote Security Setup] stderr:', res.stderr);
        if (res.stdout && res.stdout.includes('REMOTE_PASS_OK')) {
          emitProgress('log', '🔒 Remote admin dashboard password configured successfully.');
        } else {
          emitProgress('log', '⚠️ Remote admin password setup command ran, but check remote logs.');
        }
      } catch (err) {
        emitProgress('log', `⚠️ Failed to configure remote password automatically: ${err.message}`);
      }
    }

    emitProgress('log', `🎉 Total Recall is fully deployed and accessible at: ${tunnelUrl}`);

    // Store instance info for later phases
    _installOptions = _installOptions || {};
    _installOptions.vastInstanceId = finalInstanceId;
    _installOptions.vastSshHost = instance.ssh_host;
    _installOptions.vastSshPort = instance.ssh_port;
    _installOptions.domain = tunnelUrl.replace('https://', '');
    _installOptions.apiUrl = tunnelUrl;
    _installOptions.dashUrl = `${tunnelUrl}/dashboard`;
    _installOptions.healthUrl = `${tunnelUrl}/health`;
    _installOptions.deployTarget = 'vastai';
    _installOptions.skipLocalInstall = true;
    if (dashboardPassword) {
      _installOptions.dashboardPassword = dashboardPassword;
    }

    // Persist to disk so it stays across restarts!
    try {
      const configDir = path.join(_brainDir(), 'config');
      const configFile = path.join(configDir, 'wizard-config.json');
      fs.mkdirSync(configDir, { recursive: true });
      let current = {};
      if (fs.existsSync(configFile)) {
        try { current = JSON.parse(fs.readFileSync(configFile, 'utf8') || '{}'); } catch {}
      }
      current.deployTarget = 'vastai';
      current.vastInstanceId = finalInstanceId;
      current.vastSshHost = instance.ssh_host;
      current.vastSshPort = instance.ssh_port;
      current['cfg-domain'] = _installOptions.domain;
      current['cfg-api-url'] = _installOptions.apiUrl;
      current['cfg-dash-url'] = _installOptions.dashUrl;
      current['cfg-health-url'] = _installOptions.healthUrl;
      if (_installOptions.dashboardPassword) {
        current['cfg-dashboard-password'] = _installOptions.dashboardPassword;
      }
      fs.writeFileSync(configFile, JSON.stringify(current, null, 2), { encoding: 'utf8', mode: 0o600 });
    } catch (e) {
      console.error('Failed to auto-persist remote install options on disk:', e);
    }

    _installOptionsReceived = true;
    if (_resolveInstallOptions) {
      _resolveInstallOptions(_installOptions);
      _resolveInstallOptions = null;
    }

    // Finish visual installation screen
    finishDeployUI({
      apiUrl: _installOptions.apiUrl,
      dashUrl: _installOptions.dashUrl,
      healthUrl: _installOptions.healthUrl
    });
    return;
  }
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
    if (_server) {
      try { _server.close(); } catch {}
    }
    const finalUrl = dashUrl || apiUrl || '';
    console.log(`\n  🎉 Installation successfully completed!`);
    console.log(`  📍 Deployed Brain Site URL: \u001b[36m${finalUrl}\u001b[0m`);
    console.log(`  📍 API Endpoint:           \u001b[36m${apiUrl}\u001b[0m\n`);
    process.exit(0);
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
