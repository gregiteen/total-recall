import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, execFileSync } from 'node:child_process';
import { searxngBaseUrl, display, brainDir } from '../core/config.mjs';
import { runInSandbox } from '../core/sandbox.mjs';
import { logger } from '../core/logger.mjs';

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
    const res = await fetch(url.toString(), {
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

// ─── Tool Definitions ─────────────────────────────────────────────────────────

export const AVAILABLE_TOOLS = [
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
];

// ─── Tool Dispatcher ──────────────────────────────────────────────────────────

export async function handleToolCall(toolCall) {
  const { name, arguments: argsString } = toolCall.function;
  try {
    const args = JSON.parse(argsString);
    switch (name) {
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
      default:                      return `Unknown tool: ${name}`;
    }
  } catch (err) {
    logger.error('tools', `Error in ${name}`, { err: err.message });
    return `Tool execution failed: ${err.message}`;
  }
}
