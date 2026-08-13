/**
 * Secrets rotation orchestration.
 *
 * - Detect overdue keys (schedule metadata)
 * - Enqueue assisted rotation tasks (optional browser-use)
 * - After rotate: re-export .env to bound repos
 * - TR PATs can be auto-rotated when explicitly requested
 *
 * Never log secret values. Never write values into vault/openwiki.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  listRotationDue,
  listSecretsMeta,
  rotateSecret,
  getSecret,
  updateSecretMeta,
} from './secrets-store.mjs';
import { exportEnvToProject, exportEnvToRegistry, loadProjectRegistry, projectSlugFromPath } from './secrets-env-export.mjs';
import { getProvider, providerForKeyName } from './provider-catalog.mjs';
import { atomicWrite, safeStringify } from './vault.mjs';
import { getRotationPlan, generateSecretValue } from './rotation-capability.mjs';
import { getRecipe, valueLooksValid } from './provider-rotation-recipes.mjs';
import {
  launchRotationContext,
  openConsole,
  waitForLogin,
  closeContext,
} from './browser-session.mjs';

/**
 * Build a supervised browser-use prompt for rotating one key.
 * Does not perform automation itself.
 */
export function buildBrowserRotatePrompt(secretMeta) {
  const catalog = getProvider(secretMeta.provider) || providerForKeyName(secretMeta.key);
  const consoleUrl = secretMeta.console_url || catalog?.console_url || '(provider console)';
  const docsUrl = secretMeta.api_docs_url || catalog?.docs_url || '';

  return [
    `Rotate API credential for secret key: ${secretMeta.key}`,
    `Provider: ${secretMeta.provider || catalog?.id || 'unknown'}`,
    '',
    'SUPERVISED browser workflow (do NOT auto-revoke until TR confirms store+export):',
    `1. Open: ${consoleUrl}`,
    '2. Complete login / 2FA with the human if needed.',
    '3. Create a NEW API key (do not delete the old one yet).',
    '4. Copy the new key value ONCE — never paste into chat logs or vault markdown.',
    '5. Tell the human to run (or run via tool if value is only in a secure channel):',
    `   npx total-recall secret rotate ${secretMeta.key} "<NEW_VALUE>" --export-env`,
    '6. After TR confirms export succeeded, revoke/disable the OLD key in the console.',
    '',
    docsUrl ? `API docs: ${docsUrl}` : '',
    secretMeta.repos?.length ? `Bound repos: ${secretMeta.repos.join(', ')}` : 'Repos: (unbound / global projection)',
    secretMeta.next_rotate_due ? `Was due: ${secretMeta.next_rotate_due}` : '',
    '',
    'Safety: never screenshot the full key; never write the value into remember/openwiki.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Enqueue one queue task per overdue secret (or refresh existing pending).
 * @param {string} brainDir
 * @param {{ autoOnly?: boolean, queueDir?: string }} opts
 */
export async function enqueueRotationDueTasks(brainDir, opts = {}) {
  const due = await listRotationDue(brainDir, { autoOnly: !!opts.autoOnly });
  const queueDir =
    opts.queueDir || path.join(brainDir, 'scheduler', 'queue');
  if (!fs.existsSync(queueDir)) fs.mkdirSync(queueDir, { recursive: true });

  const created = [];
  const now = new Date().toISOString();

  for (const secret of due) {
    const slug = `secret-rotate-${secret.key}`
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .slice(0, 80);
    const filePath = path.join(queueDir, `${slug}.md`);
    if (fs.existsSync(filePath)) {
      // leave existing pending task
      created.push({ key: secret.key, slug, status: 'exists' });
      continue;
    }

    const prompt = buildBrowserRotatePrompt(secret);
    const front = {
      type: 'task',
      slug,
      category: 'secrets-rotation',
      title: `Rotate secret: ${secret.key}`,
      status: 'pending',
      priority: secret.auto_rotate ? 1 : 2,
      executor: 'secrets-rotation-assist',
      capabilities: ['secrets:rotate', 'notify'],
      intent: `Rotate overdue secret ${secret.key} (supervised browser or provider API)`,
      payload: {
        secret_key: secret.key,
        provider: secret.provider,
        auto_rotate: !!secret.auto_rotate,
        console_url: secret.console_url,
        browser_prompt: true,
      },
      created: now,
      updated: now,
    };

    const body = [
      `## Objective`,
      ``,
      `Rotate \`${secret.key}\` — schedule overdue.`,
      ``,
      `## Browser-use instructions`,
      ``,
      '```',
      prompt,
      '```',
      ``,
      `## After new value is obtained`,
      ``,
      '```bash',
      `npx total-recall secret rotate ${secret.key} "<NEW_VALUE>" --export-env`,
      '```',
    ].join('\n');

    atomicWrite(filePath, safeStringify(body, front));
    created.push({ key: secret.key, slug, status: 'created', path: filePath });
  }

  return { due: due.length, tasks: created };
}

/**
 * Rotate value then re-export .env to bound repos (and optionally all registry).
 */
export async function rotateSecretAndExport(brainDir, key, newValue, opts = {}) {
  const result = await rotateSecret(brainDir, key, newValue, {
    actor: opts.actor || 'cli',
    provider: opts.provider,
  });

  const metaRows = await listSecretsMeta(brainDir);
  const row = metaRows.find((r) => r.key === key);
  const exports = [];

  if (opts.exportEnv !== false) {
    const registry = loadProjectRegistry();
    const repos = row?.repos || [];
    const boundPaths = new Set();

    for (const r of repos) {
      // match registry by name/slug
      for (const entry of registry) {
        if (entry.name === r || projectSlugFromPath(entry.path) === r) {
          if (entry.path && fs.existsSync(entry.path)) boundPaths.add(path.resolve(entry.path));
        }
      }
      // also allow absolute path in repos
      if (r.startsWith('/') && fs.existsSync(r)) boundPaths.add(path.resolve(r));
    }

    if (row?.project_path && fs.existsSync(row.project_path)) {
      boundPaths.add(path.resolve(row.project_path));
    }

    if (opts.exportAllProjects) {
      const all = await exportEnvToRegistry(brainDir, {
        includeGlobal: true,
        example: true,
      });
      for (const r of all) exports.push(r);
    } else if (boundPaths.size) {
      for (const p of boundPaths) {
        try {
          const r = await exportEnvToProject(brainDir, p, {
            includeGlobal: opts.includeGlobal !== false,
            example: true,
          });
          exports.push({ ok: true, ...r });
        } catch (err) {
          exports.push({ ok: false, path: p, error: err.message });
        }
      }
    } else if (opts.exportCwd) {
      const r = await exportEnvToProject(brainDir, process.cwd(), {
        includeGlobal: true,
        example: true,
      });
      exports.push({ ok: true, ...r });
    }
  }

  return {
    ...result,
    secret: row,
    exports,
  };
}

/**
 * Daemon executor: scan due secrets and enqueue assist tasks.
 */
export async function runSecretsRotationCheck(ctx) {
  const result = await enqueueRotationDueTasks(ctx.brainDir, {
    autoOnly: false,
    queueDir: ctx.queueDir,
  });
  return {
    success: true,
    output: `Rotation check: ${result.due} due, ${result.tasks.filter((t) => t.status === 'created').length} tasks created`,
    executor: 'secrets-rotation-check',
    ...result,
  };
}

/**
 * Daemon executor: re-export all project envs from SSOT.
 */
export async function runSecretsExportAll(ctx) {
  const results = await exportEnvToRegistry(ctx.brainDir, {
    includeGlobal: true,
    example: true,
  });
  const ok = results.filter((r) => r.ok).length;
  return {
    success: true,
    output: `export-env: ${ok}/${results.length} projects updated`,
    executor: 'secrets-export-env',
    results,
  };
}

/**
 * Print browser prompt for a key (CLI helper).
 */
export async function getBrowserRotateAssist(brainDir, key) {
  const rows = await listSecretsMeta(brainDir);
  const row = rows.find((r) => r.key === key);
  if (!row) throw new Error(`Secret not found: ${key}`);
  return {
    key,
    prompt: buildBrowserRotatePrompt(row),
    console_url: row.console_url,
    docs_url: row.api_docs_url,
    overdue: row.rotation_overdue,
    next_rotate_due: row.next_rotate_due,
  };
}

// ─── Executed rotation ──────────────────────────────────────────────────────────

/**
 * Read the freshly-copied credential out of the browser's own clipboard.
 *
 * Provider consoles show a new key exactly once behind a "copy" button. Reading
 * it here keeps the value inside TR's process — it never transits a shell
 * argument, an env var, or a chat transcript.
 *
 * @param {any} page
 * @returns {Promise<string|null>}
 */
async function captureFromClipboard(page) {
  try {
    const text = await page.evaluate(() => navigator.clipboard.readText());
    return typeof text === 'string' ? text.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Drive a provider console to mint a new credential, then store + export it.
 *
 * Verified recipes are driven autonomously. Unverified ones run supervised: TR
 * opens the console and waits while the human creates and copies the key. TR
 * never blind-clicks guessed selectors on a billing dashboard.
 *
 * The old credential is NOT revoked here — revocation only happens after the
 * new value is stored, exported, and (where possible) proven to authenticate.
 *
 * @param {string} brainDir
 * @param {string} key
 * @param {{
 *   headless?: boolean,
 *   label?: string,
 *   timeoutMs?: number,
 *   onStatus?: (msg: string) => void,
 * }} [opts]
 */
export async function rotateViaBrowser(brainDir, key, opts = {}) {
  const say = opts.onStatus || (() => {});
  const rows = await listSecretsMeta(brainDir);
  const row = rows.find((r) => r.key === key);
  if (!row) throw new Error(`Secret not found: ${key}`);

  const plan = getRotationPlan(key, row);
  const recipe = getRecipe(plan.provider);
  if (!recipe) {
    return {
      ok: false,
      key,
      class: plan.class,
      error: `no rotation recipe for provider "${plan.provider || 'unknown'}"`,
      hint: 'Add an entry to provider-rotation-recipes.mjs to enable this.',
    };
  }

  const launched = await launchRotationContext(brainDir, {
    headless: opts.headless === true && recipe.verified,
    timeoutMs: opts.timeoutMs,
  });
  if (!launched.ok) return { ok: false, key, error: launched.error };

  const { context } = launched;
  try {
    say(`opening ${recipe.console_url}`);
    const { page, authenticated } = await openConsole(context, recipe);

    if (!authenticated) {
      say('not signed in — complete login/2FA in the browser window');
      const ok = await waitForLogin(page, recipe, {
        timeoutMs: opts.timeoutMs ?? 180_000,
        onWait: (s) => say(`waiting for login… ${s}s`),
      });
      if (!ok) return { ok: false, key, error: 'login timed out' };
      say('signed in');
    }

    // Allow clipboard reads for this origin so the console's copy button works.
    try {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
        origin: new URL(recipe.console_url).origin,
      });
    } catch {
      /* some engines auto-grant; failure here is not fatal */
    }

    let value = null;
    if (recipe.verified && typeof recipe.create === 'function') {
      say('creating new credential');
      value = await recipe.create(page, { label: opts.label || `total-recall ${new Date().toISOString().slice(0, 10)}` });
      if (!value) value = await captureFromClipboard(page);
    } else {
      say(`SUPERVISED — ${recipe.create_hint}`);
      say('TR is watching the clipboard; copy the new value when it appears.');
      const deadline = Date.now() + (opts.timeoutMs ?? 300_000);
      while (Date.now() < deadline) {
        const candidate = await captureFromClipboard(page);
        if (candidate && valueLooksValid(recipe, candidate)) {
          value = candidate;
          break;
        }
        await page.waitForTimeout(2000);
      }
    }

    if (!value) return { ok: false, key, error: 'no new credential captured' };
    if (!valueLooksValid(recipe, value)) {
      // Shape mismatch means we probably read the wrong node — refuse to
      // overwrite a working credential with garbage.
      return { ok: false, key, error: 'captured value failed provider shape check; nothing was stored' };
    }

    // Prove the new credential works BEFORE it replaces the old one.
    let verified = null;
    if (typeof recipe.verify === 'function') {
      say('verifying new credential against provider API');
      verified = await recipe.verify(value);
      if (!verified) {
        return { ok: false, key, error: 'new credential failed verification; nothing was stored' };
      }
    }

    say('storing + exporting');
    const result = await rotateSecretAndExport(brainDir, key, value, {
      actor: 'browser-rotation',
      provider: plan.provider,
      exportEnv: opts.exportEnv !== false,
    });
    value = null; // drop the reference promptly

    return {
      ok: true,
      key,
      provider: plan.provider,
      supervised: !recipe.verified,
      verified,
      exports: result.exports,
      revoke_hint: recipe.revoke_hint || 'Revoke the old credential in the console now that the new one is live.',
    };
  } finally {
    await closeContext(context);
  }
}

/**
 * Rotate any key by whichever method its class supports.
 *
 * self_generated keys are fully automatic — no browser, no human, no provider.
 *
 * @param {string} brainDir
 * @param {string} key
 * @param {object} [opts]
 */
export async function rotateAuto(brainDir, key, opts = {}) {
  const rows = await listSecretsMeta(brainDir);
  const row = rows.find((r) => r.key === key);
  if (!row) throw new Error(`Secret not found: ${key}`);
  const plan = getRotationPlan(key, row);

  if (plan.class === 'self_generated') {
    const value = generateSecretValue(key);
    const result = await rotateSecretAndExport(brainDir, key, value, {
      actor: 'self-generated-rotation',
      exportEnv: opts.exportEnv !== false,
    });
    return { ok: true, key, class: plan.class, method: 'self_generated', exports: result.exports };
  }

  if (plan.class === 'provider_browser' || plan.class === 'provider_api') {
    return { ...(await rotateViaBrowser(brainDir, key, opts)), class: plan.class, method: 'browser' };
  }

  return {
    ok: false,
    key,
    class: plan.class,
    method: 'manual',
    error: plan.reason,
    console_url: plan.console_url,
  };
}
