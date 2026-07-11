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
