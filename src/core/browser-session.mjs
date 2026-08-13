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

const PROFILE_DIRNAME = 'browser-profile';

const PROFILE_README = `# TR browser profile — DO NOT SYNC, DO NOT COPY

This directory holds live authenticated sessions (Stripe, GitHub, cloud consoles)
used by \`total-recall secret rotate-auto\`.

Treat it as equivalent to secrets.enc:
  - never commit it
  - never include it in backups that leave this machine
  - delete it with \`total-recall secret browser-logout\` when no longer needed
`;

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
  const headless = opts.headless === true;

  try {
    const context = await chromium.launchPersistentContext(profileDir, {
      headless,
      viewport: { width: 1440, height: 900 },
      args: ['--disable-blink-features=AutomationControlled', '--no-first-run'],
    });
    context.setDefaultTimeout(opts.timeoutMs ?? 30_000);
    return { ok: true, context, profileDir };
  } catch (err) {
    return { ok: false, error: `failed to launch browser profile: ${err.message}`, profileDir };
  }
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
export async function isAuthenticated(page, recipe) {
  // A visible signed-out marker (login form, "Sign in" CTA) is decisive.
  if (recipe.signed_out) {
    const out = await page.locator(recipe.signed_out).first().isVisible().catch(() => false);
    if (out) return false;
  }
  if (recipe.signed_in) {
    return page.locator(recipe.signed_in).first().isVisible().catch(() => false);
  }
  return true;
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
