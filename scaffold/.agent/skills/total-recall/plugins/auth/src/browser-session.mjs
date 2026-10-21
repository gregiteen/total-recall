/**
 * Authenticated browser sessions for TR.
 *
 * TR's existing Playwright use (source-adapters.playwrightScrape) is stateless
 * scraping: `chromium.launch()` with a throwaway context. Provider consoles
 * require a logged-in session, so rotation needs a *persistent* profile that
 * survives across runs — you log in once per provider, and the daemon can drive
 * rotations later without re-auth.
 *
 * SECURITY: the profile directory holds live session cookies for Stripe,
 * GitHub, etc. It is at least as sensitive as secrets.enc and is created 0700.
 * Never copy it, never sync it, never log its contents.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PROFILE_DIRNAME = 'browser-profile';

const PROFILE_README = `# TR browser profile — DO NOT SYNC, DO NOT COPY

This directory holds live authenticated sessions (Stripe, GitHub, cloud consoles)
used by \`total-recall auth secret rotate-auto\`.

Treat it as equivalent to secrets.enc:
  - never commit it
  - never include it in backups that leave this machine
  - delete it with \`total-recall auth secret browser-logout\` when no longer needed
`;

/**
 * Check if Google Chrome is currently running on macOS.
 * @returns {boolean}
 */
export function isMacChromeRunning() {
  if (process.platform !== 'darwin') return false;
  try {
    const res = execFileSync('pgrep', ['-x', 'Google Chrome'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return !!res.trim();
  } catch {
    return false;
  }
}

/**
 * Native macOS Chrome driver using AppleScript/JXA. Connects to the operator's
 * already-running, authenticated Google Chrome instance so rotations can drive
 * authenticated consoles without needing to re-login.
 */
export function createMacChromeContext(opts = {}) {
  let activeUrl = '';

  const runJxa = (js) => {
    return execFileSync('osascript', ['-l', 'JavaScript', '-e', js], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  };

  const page = {
    async goto(url) {
      activeUrl = url;
      let host = '';
      try {
        host = new URL(url).hostname;
      } catch {}
      const script = `
        const chrome = Application("Google Chrome");
        let target = null;
        for (const w of chrome.windows()) {
          for (const t of w.tabs()) {
            if (t.url().includes("${host}")) {
              target = t;
              w.activeTabIndex = w.tabs.indexOf(t) + 1;
              break;
            }
          }
          if (target) break;
        }
        if (!target) {
          const w = chrome.windows()[0] || chrome.Window().make();
          target = chrome.Tab({ url: "${url}" });
          w.tabs.push(target);
        } else if (target.url() !== "${url}") {
          target.url = "${url}";
        }
        target.url();
      `;
      try {
        runJxa(script);
      } catch {}
      await page.waitForTimeout(1500);
    },

    async url() {
      let host = '';
      try {
        host = new URL(activeUrl || 'https://portal.telnyx.com').hostname;
      } catch {}
      const script = `
        const chrome = Application("Google Chrome");
        let u = "";
        for (const w of chrome.windows()) {
          for (const t of w.tabs()) {
            if (t.url().includes("${host}")) {
              u = t.url();
              break;
            }
          }
          if (u) break;
        }
        u;
      `;
      try {
        const res = runJxa(script);
        if (res) return res;
      } catch {}
      return activeUrl;
    },

    async waitForTimeout(ms) {
      return new Promise((r) => setTimeout(r, ms));
    },

    async trustedKeystroke(text) {
      if (process.platform === 'darwin') {
        const escaped = String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `
          tell application "Google Chrome" to activate
          delay 0.1
          tell application "System Events"
            keystroke "${escaped}"
          end tell
        `;
        try {
          execFileSync('osascript', ['-e', script], { stdio: 'ignore' });
        } catch {}
      }
    },

    async trustedPress(keyName) {
      if (process.platform === 'darwin') {
        let code = 'space';
        if (keyName === 'Enter' || keyName === 'return') code = 'return';
        else if (keyName === 'space' || keyName === 'Space') code = 'space';
        const script = `
          tell application "Google Chrome" to activate
          delay 0.1
          tell application "System Events"
            keystroke ${code}
          end tell
        `;
        try {
          execFileSync('osascript', ['-e', script], { stdio: 'ignore' });
        } catch {}
      }
    },

    async evaluate(fn, ...args) {
      let host = '';
      try {
        host = new URL(activeUrl || 'https://portal.telnyx.com').hostname;
      } catch {}

      const evalChrome = (code) => {
        const script = `
          const chrome = Application("Google Chrome");
          let res = null;
          for (const w of chrome.windows()) {
            for (const t of w.tabs()) {
              if (t.url().includes("${host}")) {
                res = t.execute({ javascript: ${JSON.stringify(code)} });
                break;
              }
            }
            if (res !== null) break;
          }
          JSON.stringify(res);
        `;
        try {
          const out = runJxa(script);
          return out ? JSON.parse(out) : null;
        } catch {
          return null;
        }
      };

      const fnStr = typeof fn === 'function' ? `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})` : String(fn);
      const wrapped = `
        (() => {
          window.__tr_pending = true;
          window.__tr_result = null;
          window.__tr_error = null;
          try {
            const out = ${fnStr};
            if (out && typeof out.then === 'function') {
              out.then(
                r => { window.__tr_result = r; window.__tr_pending = false; },
                e => { window.__tr_error = String(e); window.__tr_pending = false; }
              );
            } else {
              window.__tr_result = out;
              window.__tr_pending = false;
            }
          } catch (err) {
            window.__tr_error = String(err);
            window.__tr_pending = false;
          }
        })()
      `;

      evalChrome(wrapped);

      const deadline = Date.now() + 35_000;
      while (Date.now() < deadline) {
        const pending = evalChrome('window.__tr_pending');
        if (pending === false) {
          const err = evalChrome('window.__tr_error');
          if (err) throw new Error(err);
          return evalChrome('window.__tr_result');
        }
        await page.waitForTimeout(200);
      }
      return null;
    },

    locator(selector) {
      return {
        first() {
          return this;
        },
        filter() {
          return this;
        },
        async isVisible() {
          return (
            (await page.evaluate((sel) => {
              const el = document.querySelector(sel);
              return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
            }, selector)) || false
          );
        },
        async waitFor(options = {}) {
          const timeout = options.timeout ?? 10_000;
          const started = Date.now();
          while (Date.now() - started < timeout) {
            const vis = await this.isVisible();
            if (vis) return true;
            await page.waitForTimeout(250);
          }
          return false;
        },
        async count() {
          return (await page.evaluate((sel) => document.querySelectorAll(sel).length, selector)) || 0;
        },
        async click() {
          return await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (el) el.click();
          }, selector);
        },
        async fill(text) {
          return await page.evaluate(
            ({ sel, text }) => {
              const el = document.querySelector(sel);
              if (el) {
                el.focus();
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                if (setter) setter.call(el, text);
                else el.value = text;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
            },
            { sel: selector, text }
          );
        },
        async press(key) {
          return await page.evaluate(
            ({ sel, key }) => {
              const el = document.querySelector(sel);
              if (el) {
                el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
                el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
              }
            },
            { sel: selector, key }
          );
        },
      };
    },
  };

  return {
    isMacChrome: true,
    pages: () => [page],
    newPage: async () => page,
    grantPermissions: async () => {},
    close: async () => {},
    setDefaultTimeout: () => {},
  };
}

/**
 * Load chromium if playwright is installed. Mirrors source-adapters.getPlaywright
 * so browser support stays an optional dependency.
 * @returns {Promise<any|null>}
 */
export async function getChromium() {
  try {
    const pw = await import('playwright');
    return pw.chromium || pw.default?.chromium || null;
  } catch {
    return null;
  }
}

/**
 * @param {string} brainDir
 * @returns {string}
 */
export function resolveProfileDir(brainDir) {
  return path.join(brainDir, PROFILE_DIRNAME);
}

/**
 * Create the profile dir with restrictive permissions if absent.
 * @param {string} brainDir
 */
export function ensureProfileDir(brainDir) {
  const dir = resolveProfileDir(brainDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(dir, 'README.md'), PROFILE_README, { mode: 0o600 });
  }
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    /* best effort on exotic filesystems */
  }
  return dir;
}

/**
 * Launch a persistent, authenticated browser context.
 *
 * @param {string} brainDir
 * @param {{ headless?: boolean, timeoutMs?: number }} [opts]
 * @returns {Promise<{ ok: boolean, context?: any, error?: string, profileDir?: string }>}
 */
export async function launchRotationContext(brainDir, opts = {}) {
  // If Chrome is already running on macOS and not opted out, use the operator's active session
  if (opts.useChrome !== false && (opts.chrome || isMacChromeRunning())) {
    return {
      ok: true,
      context: createMacChromeContext(opts),
      profileDir: 'running-google-chrome',
      browser: 'running Google Chrome (macOS active session)',
    };
  }

  const chromium = await getChromium();
  if (!chromium) {
    return {
      ok: false,
      error:
        'playwright is not installed. Run: npm install playwright && npx playwright install chromium',
    };
  }

  const profileDir = ensureProfileDir(brainDir);
  // Headed by default: provider logins routinely require human 2FA, and a
  // headless first-run would simply hang on an invisible challenge.
  //
  // But a headed launch needs a display, and a server usually has none: the window cannot open,
  // Chromium exits at once, and launchPersistentContext reports only "Target page, context or
  // browser has been closed" for every candidate browser. That reads as "no browser installed"
  // and left the operator with a live, un-rotated credential. With no display there is nothing
  // for a human to see anyway, so fall back to headless rather than fail.
  const headless = opts.headless === true || (process.platform === 'linux' && !process.env.DISPLAY);

  const base = {
    headless,
    viewport: { width: 1440, height: 900 },
    // Chromium refuses to start as root with its sandbox on, and it dies so fast that
    // launchPersistentContext reports only "Target page, context or browser has been closed" —
    // the exact failure every rotation attempt hit on this host, from every candidate browser,
    // which reads as "no browser installed" and is why the key was never rotated. Add the flags
    // root needs, and keep /dev/shm out of it because it is small in a container and stalls the
    // renderer.
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      ...(typeof process.getuid === 'function' && process.getuid() === 0
        ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        : []),
    ],
  };

  // Playwright's bundled Chromium is not available on every host — it has
  // dropped support for older macOS versions, and the pinned build is often
  // simply not downloaded. A rotation that dies here strands the operator with
  // live, burned credentials, so fall back to any locally installed Chrome or
  // Edge before giving up.
  const attempts = [
    { label: 'bundled chromium', options: base },
    { label: 'system chrome', options: { ...base, channel: 'chrome' } },
    { label: 'system edge', options: { ...base, channel: 'msedge' } },
  ];

  const failures = [];
  for (const attempt of attempts) {
    try {
      const context = await chromium.launchPersistentContext(profileDir, attempt.options);
      context.setDefaultTimeout(opts.timeoutMs ?? 30_000);
      return { ok: true, context, profileDir, browser: attempt.label };
    } catch (err) {
      failures.push(`${attempt.label}: ${err.message.split('\n')[0]}`);
    }
  }

  return {
    ok: false,
    error:
      `failed to launch a browser profile. Tried ${attempts.length} browsers —\n  ` +
      failures.join('\n  ') +
      '\nInstall one with: npx playwright install chromium (or install Google Chrome).',
    profileDir,
  };
}

/**
 * Navigate to a console and report whether the session is authenticated.
 *
 * Recipes describe authentication by what is visible, not by URL alone, because
 * most consoles redirect to a login page rather than returning an error status.
 *
 * @param {any} context
 * @param {{ console_url: string, signed_in?: string, signed_out?: string }} recipe
 * @returns {Promise<{ page: any, authenticated: boolean, url: string }>}
 */
export async function openConsole(context, recipe) {
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(recipe.console_url, { waitUntil: 'domcontentloaded' });
  // Consoles are SPA-heavy; give client-side auth redirects a beat to settle.
  await page.waitForTimeout(1500);

  const authenticated = await isAuthenticated(page, recipe);
  return { page, authenticated, url: page.url() };
}

/**
 * @param {any} page
 * @param {{ signed_in?: string, signed_out?: string }} recipe
 * @returns {Promise<boolean>}
 */
export async function isAuthenticated(page, recipe, opts = {}) {
  // A visible signed-out marker (login form, "Sign in" CTA) is decisive.
  if (recipe.signed_out) {
    const out = await page.locator(recipe.signed_out).first().isVisible().catch(() => false);
    if (out) return false;
  }

  if (recipe.signed_in) {
    // Consoles are SPA-heavy: the positive marker frequently renders a second
    // or two after DOMContentLoaded. Give it a real wait instead of a single
    // instantaneous probe.
    const appeared = await page
      .locator(recipe.signed_in)
      .first()
      .waitFor({ state: 'visible', timeout: opts.markerTimeoutMs ?? 8000 })
      .then(() => true)
      .catch(() => false);
    if (appeared) return true;

    // The positive marker never showed and no login form matched. Selectors go
    // stale constantly, so fall back to the one signal every console agrees on:
    // an unauthenticated request gets redirected to a login URL.
    return !looksLikeLoginUrl(page.url());
  }

  return !looksLikeLoginUrl(page.url());
}

/**
 * Provider-agnostic sign-in detection. Consoles redirect anonymous visitors to
 * a login route rather than returning an error status, so the landed URL is a
 * far more durable signal than any per-provider CSS selector.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function looksLikeLoginUrl(url) {
  return /\/(login|log-in|sign[_-]?in|signin|auth\/login|sessions\/new|u\/login)(\/|\?|#|$)/i.test(
    String(url || ''),
  );
}

/**
 * Wait for a human to complete login/2FA in the headed window.
 *
 * @param {any} page
 * @param {object} recipe
 * @param {{ timeoutMs?: number, pollMs?: number, onWait?: (s:number)=>void }} [opts]
 * @returns {Promise<boolean>}
 */
export async function waitForLogin(page, recipe, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const pollMs = opts.pollMs ?? 2000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (await isAuthenticated(page, recipe)) return true;
    opts.onWait?.(Math.round((Date.now() - started) / 1000));
    await page.waitForTimeout(pollMs);
  }
  return false;
}

/**
 * Close a context without throwing.
 * @param {any} context
 */
export async function closeContext(context) {
  try {
    await context?.close();
  } catch {
    /* already closed */
  }
}

/**
 * Delete the persistent profile (logout everywhere).
 * @param {string} brainDir
 */
export function clearProfile(brainDir) {
  const dir = resolveProfileDir(brainDir);
  if (!fs.existsSync(dir)) return { removed: false, path: dir };
  fs.rmSync(dir, { recursive: true, force: true });
  return { removed: true, path: dir };
}
