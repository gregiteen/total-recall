import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, execFileSync } from 'node:child_process';
import { searxngBaseUrl, display, brainDir } from '../core/config.mjs';
import { runInSandbox } from '../core/sandbox.mjs';
import { logger } from '../core/logger.mjs';
import { throttledFetch } from '../core/throttled-fetch.mjs';

// ─── Browser Session (persistent across tool calls in a process) ──────────────

let _browser = null;
let _page    = null;

async function getBrowserPage() {
  if (!_browser) {
    try {
      const { chromium } = await import('playwright');
      _browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-dev-shm-usage',
          // Only disable Chromium sandbox when running as root (where it's required)
          ...(process.getuid?.() === 0 ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
        ],
      });
      _page = await _browser.newPage();
      await _page.setViewportSize({ width: 1280, height: 900 });
      await _page.setExtraHTTPHeaders({ 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36' });
    } catch (err) {
      throw new Error(`Failed to load or spawn Playwright browser. Please ensure playwright is installed and your environment supports browser execution. (Detail: ${err.message})`);
    }
  }
  return _page;
}

async function pageToMarkdown(page) {
  // Extract readable text from current page
  return page.evaluate(() => {
    const clean = (el) => el?.innerText?.trim() || '';
    const title = document.title;
    const url   = location.href;
    // Remove nav/footer/script noise
    ['script','style','nav','footer','header','aside'].forEach(tag => {
      document.querySelectorAll(tag).forEach(n => n.remove());
    });
    const body = clean(document.body).slice(0, 6000);
    return `# ${title}\nURL: ${url}\n\n${body}`;
  });
}

// ─── Browser Tools ────────────────────────────────────────────────────────────

export async function browserNavigate(url) {
  try {
    const page = await getBrowserPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);
    const content = await pageToMarkdown(page);
    return content;
  } catch (err) {
    return `Navigation failed: ${err.message}`;
  }
}

export async function browserSearch(query) {
  try {
    const page = await getBrowserPage();
    const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    // Extract search results
    const results = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('[data-testid="result"]').forEach((el, i) => {
        if (i >= 6) return;
        const title   = el.querySelector('h2')?.innerText?.trim() || '';
        const snippet = el.querySelector('[data-result="snippet"]')?.innerText?.trim() || '';
        const link    = el.querySelector('a')?.href || '';
        if (title) items.push(`[${i+1}] ${title}\n${link}\n${snippet}`);
      });
      return items;
    });
    if (results.length === 0) {
      // Fallback: return raw page text
      return `Search results for "${query}":\n\n${(await pageToMarkdown(page)).slice(0, 3000)}`;
    }
    return `Search results for "${query}":\n\n${results.join('\n\n')}`;
  } catch (err) {
    return `Search failed: ${err.message}`;
  }
}

export async function browserScreenshot() {
  try {
    const page = await getBrowserPage();
    const buf  = await page.screenshot({ type: 'png', fullPage: false });
    const b64  = buf.toString('base64');
    const url  = page.url();
    return `Screenshot taken of: ${url}\n[image/png base64]: ${b64.slice(0, 200)}... (${Math.round(b64.length / 1024)}KB)`;
  } catch (err) {
    return `Screenshot failed: ${err.message}`;
  }
}

export async function browserClick(selector) {
  try {
    const page = await getBrowserPage();
    // Try CSS selector first, then visible text
    try {
      await page.click(selector, { timeout: 5000 });
    } catch {
      await page.getByText(selector, { exact: false }).first().click({ timeout: 5000 });
    }
    await page.waitForTimeout(800);
    const content = await pageToMarkdown(page);
    return `Clicked "${selector}". Page is now:\n\n${content.slice(0, 2000)}`;
  } catch (err) {
    return `Click failed: ${err.message}`;
  }
}

export async function browserType(selector, text) {
  try {
    const page = await getBrowserPage();
    try {
      await page.fill(selector, text);
    } catch {
      await page.getByLabel(selector, { exact: false }).first().fill(text);
    }
    return `Typed "${text}" into "${selector}"`;
  } catch (err) {
    return `Type failed: ${err.message}`;
  }
}

export async function browserGetContent() {
  try {
    const page = await getBrowserPage();
    const content = await pageToMarkdown(page);
    return content;
  } catch (err) {
    return `Get content failed: ${err.message}`;
  }
}

export async function browserEval(js) {
  try {
    const page   = await getBrowserPage();
    const result = await page.evaluate(js);
    return `Result: ${JSON.stringify(result)}`;
  } catch (err) {
    return `Eval failed: ${err.message}`;
  }
}

// ─── SearXNG Web Search ───────────────────────────────────────────────────────

export async function executeWebSearch(query) {
  const searxngUrl = searxngBaseUrl || 'http://127.0.0.1:8888';
  logger.info('search', `Query: "${query}" via ${searxngUrl}`);
  try {
    const url = new URL(`${searxngUrl}/search`);
    url.searchParams.append('q', query);
    url.searchParams.append('format', 'json');
    const res = await throttledFetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const results = (data.results || []).slice(0, 6);
    if (results.length === 0) throw new Error('no results');
    return `Search results for "${query}":\n\n` + results.map((r, i) =>
      `[${i+1}] ${r.title}\n${r.url}\n${r.content || r.snippet || ''}`
    ).join('\n\n');
  } catch (err) {
    logger.warn('search', 'SearXNG failed, falling back to browser search', { err: err.message });
    return browserSearch(query);
  }
}

// ─── Code Execution ───────────────────────────────────────────────────────────

export async function executeCode(code) {
  try {
    const tmpDir    = path.join(os.tmpdir(), 'total-recall-sandbox');
    fs.mkdirSync(tmpDir, { recursive: true });
    const scriptPath = path.join(tmpDir, `script-${Date.now()}.mjs`);
    fs.writeFileSync(scriptPath, code);
    logger.info('sandbox', `Executing code at ${scriptPath}`);
    const result = await runInSandbox(scriptPath, 15000);
    try { fs.unlinkSync(scriptPath); } catch {}
    return result.success
      ? `Code executed successfully.\nOutput:\n${result.output}`
      : `Code execution failed (exit ${result.code}).\nOutput:\n${result.output}`;
  } catch (err) {
    return `Error executing code: ${err.message}`;
  }
}

// ─── Design Update ────────────────────────────────────────────────────────────

export async function updateDesign(markdown) {
  try {
    const configDir = path.join(brainDir, 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'DESIGN.md'), markdown);
    return 'Successfully updated DESIGN.md.';
  } catch (err) {
    return `Error updating design: ${err.message}`;
  }
}

// ─── Computer Use (Desktop / X11 Control) ────────────────────────────────────

let _xDisplay = null;

async function ensureDisplay() {
  if (_xDisplay) return _xDisplay;
  if (display) {
    _xDisplay = display;
    return _xDisplay;
  }
  // No DISPLAY — try to start Xvfb on :99
  try {
    execSync('Xvfb :99 -screen 0 1280x900x24 -ac &', { timeout: 3000, stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 1200));
    process.env.DISPLAY = ':99';
    _xDisplay = ':99';
  } catch {
    _xDisplay = ':0';
  }
  return _xDisplay;
}

function xrun(cmd) {
  return execSync(cmd, { timeout: 8000, encoding: 'utf8' }).trim();
}

// Safe version for xdotool commands — uses execFileSync with argument arrays
function xrunSafe(args, envOverrides = {}) {
  return execFileSync(args[0], args.slice(1), {
    timeout: 8000,
    encoding: 'utf8',
    env: { ...process.env, ...envOverrides },
  }).trim();
}

export async function computerScreenshot() {
  try {
    const display = await ensureDisplay();
    const tmpFile = path.join(os.tmpdir(), `cu-shot-${Date.now()}.png`);
    xrunSafe(['scrot', '-z', tmpFile], { DISPLAY: display });
    const buf  = fs.readFileSync(tmpFile);
    const b64  = buf.toString('base64');
    try { fs.unlinkSync(tmpFile); } catch {}
    return `Desktop screenshot taken (${Math.round(b64.length / 1024)}KB)\n[image/png base64]: ${b64.slice(0, 200)}... (${b64.length} chars total)`;
  } catch (err) {
    return `Screenshot failed: ${err.message}`;
  }
}

export async function computerMouseMove(x, y) {
  try {
    const display = await ensureDisplay();
    const nx = parseInt(x, 10), ny = parseInt(y, 10);
    if (isNaN(nx) || isNaN(ny)) throw new Error('Invalid coordinates');
    xrunSafe(['xdotool', 'mousemove', String(nx), String(ny)], { DISPLAY: display });
    return `Mouse moved to (${x}, ${y})`;
  } catch (err) {
    return `Mouse move failed: ${err.message}`;
  }
}

export async function computerLeftClick(x, y) {
  try {
    const display = await ensureDisplay();
    const nx = parseInt(x, 10), ny = parseInt(y, 10);
    if (isNaN(nx) || isNaN(ny)) throw new Error('Invalid coordinates');
    xrunSafe(['xdotool', 'mousemove', String(nx), String(ny), 'click', '1'], { DISPLAY: display });
    return `Left-clicked at (${x}, ${y})`;
  } catch (err) {
    return `Click failed: ${err.message}`;
  }
}

export async function computerDoubleClick(x, y) {
  try {
    const display = await ensureDisplay();
    const nx = parseInt(x, 10), ny = parseInt(y, 10);
    if (isNaN(nx) || isNaN(ny)) throw new Error('Invalid coordinates');
    xrunSafe(['xdotool', 'mousemove', String(nx), String(ny), 'click', '--repeat', '2', '--delay', '100', '1'], { DISPLAY: display });
    return `Double-clicked at (${x}, ${y})`;
  } catch (err) {
    return `Double-click failed: ${err.message}`;
  }
}

export async function computerRightClick(x, y) {
  try {
    const display = await ensureDisplay();
    const nx = parseInt(x, 10), ny = parseInt(y, 10);
    if (isNaN(nx) || isNaN(ny)) throw new Error('Invalid coordinates');
    xrunSafe(['xdotool', 'mousemove', String(nx), String(ny), 'click', '3'], { DISPLAY: display });
    return `Right-clicked at (${x}, ${y})`;
  } catch (err) {
    return `Right-click failed: ${err.message}`;
  }
}

export async function computerType(text) {
  try {
    const display = await ensureDisplay();
    // Write text via temp file to avoid shell-quoting issues
    const tmpFile = path.join(os.tmpdir(), `cu-type-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, text);
    xrunSafe(['xdotool', 'type', '--clearmodifiers', '--file', tmpFile], { DISPLAY: display });
    try { fs.unlinkSync(tmpFile); } catch {}
    return `Typed: ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`;
  } catch (err) {
    return `Type failed: ${err.message}`;
  }
}

export async function computerKey(key) {
  try {
    const display = await ensureDisplay();
    // Validate key against safe xdotool key name pattern
    if (!/^[a-zA-Z0-9_+ ]+$/.test(key)) throw new Error('Invalid key name');
    xrunSafe(['xdotool', 'key', key], { DISPLAY: display });
    return `Key pressed: ${key}`;
  } catch (err) {
    return `Key press failed: ${err.message}`;
  }
}

export async function computerScroll(x, y, direction, amount = 3) {
  try {
    const display = await ensureDisplay();
    const button = direction === 'up' ? 4 : 5;
    const nx = parseInt(x, 10), ny = parseInt(y, 10);
    const amt = parseInt(amount, 10) || 3;
    if (isNaN(nx) || isNaN(ny)) throw new Error('Invalid coordinates');
    const clickArgs = [];
    for (let i = 0; i < amt; i++) clickArgs.push('click', String(button));
    xrunSafe(['xdotool', 'mousemove', String(nx), String(ny), ...clickArgs], { DISPLAY: display });
    return `Scrolled ${direction} ${amount}× at (${x}, ${y})`;
  } catch (err) {
    return `Scroll failed: ${err.message}`;
  }
}

// ─── Mesh Operations Tools ───────────────────────────────────────────────────

function meshServerPort() {
  const value = Number(process.env.TR_SERVER_PORT || process.env.PORT || 3000);
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : 3000;
}

export async function meshListNodes() {
  try {
    const { listEnrichedMeshNodes } = await import('../core/mesh.mjs');
    const { resolveNodeAccess } = await import('../core/mesh-access.mjs');
    const nodes = listEnrichedMeshNodes();
    const formatted = nodes.map((n) => {
      const access = resolveNodeAccess(n);
      return {
        hostname: n.hostname,
        ip: n.ip,
        online: Boolean(n.online),
        self: Boolean(n.self),
        os: n.os || 'unknown',
        role: n.role || (n.self ? 'local' : 'peer'),
        login: access.complete ? access.target : 'no login recorded',
        ssh_ready: Boolean(access.complete),
        channels: n.io?.channels || [],
      };
    });
    return JSON.stringify(formatted, null, 2);
  } catch (err) {
    logger.error('tools', 'Error listing mesh nodes', { err: err.message });
    return `Failed to list mesh nodes: ${err.message}`;
  }
}

export async function meshStatus() {
  try {
    const { isMeshAvailable, getMeshSelf } = await import('../core/mesh.mjs');
    const { describeHeadscaleAvailability } = await import('../core/headscale-client.mjs');
    const { resolveBrainDir } = await import('../cli/agent-dir.mjs');
    const brainDir = resolveBrainDir();
    const headscale = await describeHeadscaleAvailability(brainDir);
    const self = getMeshSelf();
    return JSON.stringify({
      mesh_online: isMeshAvailable(),
      headscale_configured: Boolean(headscale.configured),
      headscale_url: headscale.url || null,
      headscale_status: headscale.reason || 'operational',
      self_node: self ? { hostname: self.hostname, ip: self.ip } : null,
    }, null, 2);
  } catch (err) {
    logger.error('tools', 'Error checking mesh status', { err: err.message });
    return `Failed to check mesh status: ${err.message}`;
  }
}

export async function meshExec(target, command, timeoutMs = 60000) {
  try {
    if (!target || !command) {
      return 'Error: `node` and `command` parameters are required for mesh_exec.';
    }
    const { execMeshCommand } = await import('../core/mesh.mjs');
    const res = await execMeshCommand(target, command, { timeoutMs: Number(timeoutMs) || 60000 });
    return JSON.stringify({
      node: res.node,
      hostname: res.hostname,
      ip: res.ip,
      exitCode: res.exitCode,
      success: res.success,
      stdout: res.stdout,
      stderr: res.stderr,
    }, null, 2);
  } catch (err) {
    logger.error('tools', `Error executing command on mesh node "${target}"`, { err: err.message });
    return `Mesh execution failed on "${target}": ${err.message}`;
  }
}

export async function meshSetAccess(node, accessPatch = {}) {
  try {
    if (!node) {
      return 'Error: `node` parameter is required for mesh_set_access.';
    }
    const { setMeshNodeAccess } = await import('../core/mesh.mjs');
    const patch = { source: 'chat-tool' };
    if (accessPatch.ssh_user !== undefined) patch.ssh_user = String(accessPatch.ssh_user).trim();
    if (accessPatch.ssh_port !== undefined) patch.ssh_port = Number.parseInt(accessPatch.ssh_port, 10) || 22;
    if (accessPatch.identity_file !== undefined) patch.identity_file = String(accessPatch.identity_file).trim();
    if (accessPatch.ssh_host !== undefined) patch.ssh_host = String(accessPatch.ssh_host).trim();

    const res = await setMeshNodeAccess(node, patch);
    if (!res.written) {
      return `Failed to set access for "${node}": ${res.reason || 'write rejected'}`;
    }
    return JSON.stringify({ success: true, node, updated: patch }, null, 2);
  } catch (err) {
    logger.error('tools', `Error setting access for "${node}"`, { err: err.message });
    return `Failed to update access for "${node}": ${err.message}`;
  }
}

export async function meshPing(node) {
  try {
    if (!node) {
      return 'Error: `node` parameter is required for mesh_ping.';
    }
    const { findMeshNode } = await import('../core/mesh.mjs');
    const target = findMeshNode(node);
    if (!target) {
      return `Mesh node "${node}" not found in mesh topology.`;
    }
    if (target.self) {
      return JSON.stringify({ node: target.hostname, ip: target.ip, latency_ms: 0, self: true, reachable: true }, null, 2);
    }
    if (!target.ip || !target.online) {
      return JSON.stringify({ node: target.hostname, ip: target.ip, latency_ms: null, reachable: false, error: 'offline' }, null, 2);
    }
    const start = Date.now();
    try {
      const peerUrl = `http://${target.ip}:${meshServerPort()}/health`;
      const response = await throttledFetch(peerUrl, {}, 5000);
      const ms = Date.now() - start;
      const ok = response.ok || response.status === 200;
      return JSON.stringify({
        node: target.hostname,
        ip: target.ip,
        latency_ms: ok ? ms : null,
        status: response.status,
        reachable: ok,
      }, null, 2);
    } catch (fetchErr) {
      try {
        const { spawnSync } = await import('node:child_process');
        const pingResult = spawnSync('ping', ['-c', '1', '-W', '2', target.ip], { encoding: 'utf8', timeout: 3000 });
        const ms = Date.now() - start;
        const pingOk = pingResult.status === 0;
        return JSON.stringify({
          node: target.hostname,
          ip: target.ip,
          latency_ms: pingOk ? ms : null,
          reachable: pingOk,
          method: 'icmp',
        }, null, 2);
      } catch {
        return JSON.stringify({
          node: target.hostname,
          ip: target.ip,
          latency_ms: null,
          reachable: false,
          error: fetchErr.message,
        }, null, 2);
      }
    }
  } catch (err) {
    return `Failed to ping "${node}": ${err.message}`;
  }
}

export async function meshMintPreAuthKey(options = {}) {
  try {
    const { createHeadscalePreAuthKey } = await import('../core/headscale-client.mjs');
    const { resolveBrainDir } = await import('../cli/agent-dir.mjs');
    const brainDir = resolveBrainDir();
    const result = await createHeadscalePreAuthKey(brainDir, {
      reusable: Boolean(options.reusable),
      ephemeral: Boolean(options.ephemeral),
      expirationMinutes: options.expirationMinutes ? Number(options.expirationMinutes) : 60,
    });
    return JSON.stringify(result, null, 2);
  } catch (err) {
    logger.error('tools', 'Error minting preauth key', { err: err.message });
    return `Failed to mint pre-auth key: ${err.message}`;
  }
}

/**
 * The user asked, in chat, for background research. Recorded as a user request
 * (runs ahead of autonomous research, no budget applies).
 */
export async function queueResearch(topic, notes) {
  const { requestResearch } = await import('../core/research-gate.mjs');
  const item = requestResearch({ topic, notes, via: 'chat' });
  const state = item.status === 'done' ? 'already researched' : item.status === 'pending' ? 'queued' : item.status;
  return JSON.stringify({ id: item.id, topic: item.topic, status: state, note: 'Runs in the background; findings will appear in memory and future context.' });
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────

export const AVAILABLE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'queue_research',
      description: 'Queue deep background research on a topic. Use ONLY when the user explicitly asks you to research something in depth or to look into it later. Returns immediately; the findings land in memory and show up in future context. For an answer right now, use search_web instead.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Specific, searchable topic, e.g. "Stripe Node SDK v17 webhook signature verification".' },
          notes: { type: 'string', description: 'Optional: what the user wants to learn and why.' },
        },
        required: ['topic'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the internet for current information, news, or facts. Uses local SearXNG if available, falls back to a real browser search automatically.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_navigate',
      description: 'Navigate the browser to a URL and return the page content as markdown. Use this to read any webpage.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full URL to navigate to (include https://).' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_click',
      description: 'Click an element on the current page by CSS selector or visible text.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector or visible text of the element to click.' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_type',
      description: 'Type text into an input field on the current page.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector or label of the input field.' },
          text:     { type: 'string', description: 'Text to type.' },
        },
        required: ['selector', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_get_content',
      description: 'Get the full text content of the current browser page as markdown.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_screenshot',
      description: 'Take a screenshot of the current browser page.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_eval',
      description: 'Run JavaScript in the current browser page and return the result. Use for extracting specific data or interacting with page APIs.',
      parameters: {
        type: 'object',
        properties: {
          js: { type: 'string', description: 'JavaScript expression to evaluate in the page context.' },
        },
        required: ['js'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_code',
      description: 'Execute Node.js code in a secure sandbox. Use for API calls, data processing, calculations.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Node.js code to execute. Do not wrap in markdown.' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_design',
      description: 'Write markdown to the Sandbox DESIGN.md. Use when asked to create or update a UI or document.',
      parameters: {
        type: 'object',
        properties: {
          markdown: { type: 'string', description: 'Complete markdown content for DESIGN.md.' },
        },
        required: ['markdown'],
      },
    },
  },
  // ── Computer Use ──────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'computer_screenshot',
      description: 'Take a full screenshot of the computer desktop. Use this to see what is on screen before clicking.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'computer_left_click',
      description: 'Move the mouse to absolute screen coordinates and left-click. Always take a screenshot first to find the right coordinates.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'integer', description: 'X pixel coordinate on screen' },
          y: { type: 'integer', description: 'Y pixel coordinate on screen' },
        },
        required: ['x', 'y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'computer_double_click',
      description: 'Move to screen coordinates and double-click (e.g. to open files or select words).',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'integer', description: 'X pixel coordinate' },
          y: { type: 'integer', description: 'Y pixel coordinate' },
        },
        required: ['x', 'y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'computer_right_click',
      description: 'Move to screen coordinates and right-click (opens context menus).',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'integer', description: 'X pixel coordinate' },
          y: { type: 'integer', description: 'Y pixel coordinate' },
        },
        required: ['x', 'y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'computer_mouse_move',
      description: 'Move the mouse cursor to screen coordinates without clicking.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'integer', description: 'X pixel coordinate' },
          y: { type: 'integer', description: 'Y pixel coordinate' },
        },
        required: ['x', 'y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'computer_type',
      description: 'Type text at the current cursor position using keyboard simulation. Click an input field first.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to type' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'computer_key',
      description: 'Press a keyboard key or combo (e.g. "Return", "ctrl+c", "ctrl+v", "alt+Tab", "super", "Escape").',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key name in xdotool format' },
        },
        required: ['key'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'computer_scroll',
      description: 'Scroll the mouse wheel at a screen position.',
      parameters: {
        type: 'object',
        properties: {
          x:         { type: 'integer', description: 'X coordinate' },
          y:         { type: 'integer', description: 'Y coordinate' },
          direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction' },
          amount:    { type: 'integer', description: 'Number of scroll clicks (default 3)' },
        },
        required: ['x', 'y', 'direction'],
      },
    },
  },
  // ── Mesh Operations ───────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'mesh_list_nodes',
      description: 'List all nodes on the WireGuard mesh network with their hostname, IP address, online status, role, OS, and resolved SSH login target.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mesh_status',
      description: 'Check mesh control plane (Headscale) availability, enrollment status, active policy, and self node details.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mesh_exec',
      description: 'Execute a shell command remotely on another mesh node via SSH. Automatically handles PATH and SSH configuration.',
      parameters: {
        type: 'object',
        properties: {
          node: { type: 'string', description: 'Target node hostname, slug, or mesh IP (e.g. "macmini", "cloud", "100.64.0.2").' },
          command: { type: 'string', description: 'Shell command to execute on the remote node (e.g. "uptime", "git status", "docker ps").' },
          timeoutMs: { type: 'integer', description: 'Timeout in milliseconds (default 60000).' },
        },
        required: ['node', 'command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mesh_set_access',
      description: 'Record or update SSH login credentials (user, port, identity key file, address override) on a mesh node entity in the memory vault.',
      parameters: {
        type: 'object',
        properties: {
          node: { type: 'string', description: 'Target node hostname, slug, or mesh IP.' },
          ssh_user: { type: 'string', description: 'Username to log in as (e.g. "greg", "root", "gregoryiteen").' },
          ssh_port: { type: 'integer', description: 'SSH port (default 22).' },
          identity_file: { type: 'string', description: 'Path to private SSH key file (e.g. "~/.ssh/id_ed25519").' },
          ssh_host: { type: 'string', description: 'Custom host or IP override if not using the mesh IP.' },
        },
        required: ['node'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mesh_ping',
      description: 'Ping a mesh node to measure round-trip latency and verify reachability over the WireGuard mesh.',
      parameters: {
        type: 'object',
        properties: {
          node: { type: 'string', description: 'Target node hostname, slug, or mesh IP.' },
        },
        required: ['node'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mesh_mint_preauthkey',
      description: 'Mint a pre-authentication enrollment key to join a new machine or phone to the mesh network.',
      parameters: {
        type: 'object',
        properties: {
          reusable: { type: 'boolean', description: 'Whether the key can be used more than once.' },
          ephemeral: { type: 'boolean', description: 'Whether the enrolled node should be ephemeral (removed when disconnected).' },
          expirationMinutes: { type: 'integer', description: 'Key lifetime in minutes (default 60).' },
        },
      },
    },
  },
];

// ─── Tool Dispatcher ──────────────────────────────────────────────────────────

export async function handleToolCall(toolCall) {
  const { name, arguments: argsString } = toolCall.function;
  try {
    const args = JSON.parse(argsString);
    switch (name) {
      case 'queue_research':    return await queueResearch(args.topic, args.notes);
      case 'search_web':        return await executeWebSearch(args.query);
      case 'browser_navigate':  return await browserNavigate(args.url);
      case 'browser_click':     return await browserClick(args.selector);
      case 'browser_type':      return await browserType(args.selector, args.text);
      case 'browser_get_content': return await browserGetContent();
      case 'browser_screenshot':  return await browserScreenshot();
      case 'browser_eval':      return await browserEval(args.js);
      case 'execute_code':      return await executeCode(args.code);
      case 'update_design':         return await updateDesign(args.markdown);
      // Computer use
      case 'computer_screenshot':   return await computerScreenshot();
      case 'computer_left_click':   return await computerLeftClick(args.x, args.y);
      case 'computer_double_click': return await computerDoubleClick(args.x, args.y);
      case 'computer_right_click':  return await computerRightClick(args.x, args.y);
      case 'computer_mouse_move':   return await computerMouseMove(args.x, args.y);
      case 'computer_type':         return await computerType(args.text);
      case 'computer_key':          return await computerKey(args.key);
      case 'computer_scroll':       return await computerScroll(args.x, args.y, args.direction, args.amount ?? 3);
      // Mesh operations
      case 'mesh_list_nodes':       return await meshListNodes();
      case 'mesh_status':           return await meshStatus();
      case 'mesh_exec':             return await meshExec(args.node, args.command, args.timeoutMs);
      case 'mesh_set_access':       return await meshSetAccess(args.node, args);
      case 'mesh_ping':             return await meshPing(args.node);
      case 'mesh_mint_preauthkey':  return await meshMintPreAuthKey(args);
      default:                      return `Unknown tool: ${name}`;
    }
  } catch (err) {
    logger.error('tools', `Error in ${name}`, { err: err.message });
    return `Tool execution failed: ${err.message}`;
  }
}
