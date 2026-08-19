import { Router } from 'express';
import { requireAuth, requireScope } from '../auth.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { ROOT, serverError } from './_shared.mjs';
import { brainDir as configBrainDir } from '../../core/config.mjs';
import {
  PACKAGE_NAME,
  fetchLatestNpmVersionAsync,
  inspectProjectPackage,
  listUpdateRoots,
  runPackageAutoUpdate,
  needsUpdate,
  isPackageAutoUpdateEnabled,
} from '../../core/package-auto-update.mjs';

const router = Router();

router.get('/api/update/check', requireAuth, async (_req, res) => {
  try {
    // Host package (this install)
    let current = null;
    try {
      const pkg = await import('../../../package.json', { with: { type: 'json' } });
      current = pkg.default.version;
    } catch {
      current = null;
    }

    // Non-blocking npm view (spawnSync blocked the whole server and froze Settings).
    const latest = (await fetchLatestNpmVersionAsync({ timeoutMs: 8_000 })) || '';
    const roots = listUpdateRoots({ brainDir: configBrainDir });
    const projects = roots.map(({ root, name, source }) => {
      const info = inspectProjectPackage(root);
      return {
        name,
        root,
        source,
        declared: info.declared,
        installed: info.installed,
        is_source_tree: info.isSourceTree,
        update_available: !info.isSourceTree && needsUpdate(info.installed, latest),
      };
    });

    const consumersBehind = projects.filter((p) => p.update_available).length;
    const updateAvailable =
      Boolean(latest && current && needsUpdate(current, latest)) || consumersBehind > 0;

    res.json({
      package: PACKAGE_NAME,
      current,
      currentVersion: current,
      latest,
      latestVersion: latest,
      // snake + camel for dashboard clients
      update_available: updateAvailable,
      updateAvailable,
      auto_update_enabled: isPackageAutoUpdateEnabled(),
      projects,
      consumers_behind: consumersBehind,
    });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/update/run
 * Body optional: { dryRun?: boolean, force?: boolean, roots?: string[] }
 * Runs multi-repo npm install for total-recall-brain@latest via package-auto-update.
 */
router.post('/api/update/run', requireAuth, requireScope('config:write'), async (req, res) => {
  try {
    const dryRun = Boolean(req.body?.dryRun);
    const force = req.body?.force !== false;
    const roots = Array.isArray(req.body?.roots) ? req.body.roots : undefined;

    // Fire multi-project updater (awaits — install can take minutes; client should timeout high)
    const summary = await runPackageAutoUpdate({
      brainDir: configBrainDir,
      roots,
      dryRun,
      force,
      skipThrottle: true,
      save: true,
    });

    // Also kick a local install in ROOT when this host is a consumer (non-source)
    const hostInfo = inspectProjectPackage(ROOT);
    if (!hostInfo.isSourceTree && (hostInfo.declared || hostInfo.installed) && !dryRun) {
      const latest = summary.latest || (await fetchLatestNpmVersionAsync());
      if (latest && needsUpdate(hostInfo.installed, latest)) {
        const proc = spawn('npm', ['install', `${PACKAGE_NAME}@${latest}`, '--save'], {
          cwd: ROOT,
          detached: true,
          stdio: 'ignore',
        });
        proc.unref();
      }
    }

    const failed = Number(summary?.failed || 0);
    const updated = Number(summary?.updated || 0);
    const upToDate = Number(summary?.up_to_date || 0);
    const skipped = Number(
      (summary?.results || []).filter((r) => String(r.status || '').startsWith('skipped')).length,
    );
    const ok = !summary?.skipped && failed === 0;
    const parts = [];
    if (updated) parts.push(`${updated} updated`);
    if (upToDate) parts.push(`${upToDate} already current`);
    if (skipped) parts.push(`${skipped} skipped`);
    if (failed) parts.push(`${failed} failed`);
    const detail = parts.length ? parts.join(', ') : 'no projects checked';

    res.json({
      success: ok,
      updating: !dryRun && ok,
      message: dryRun
        ? `Dry-run complete — ${detail}`
        : ok
          ? `Package auto-update finished for registered projects (${detail}). Latest: ${summary?.latest || 'n/a'}`
          : summary?.reason === 'npm-view-failed'
            ? 'Could not resolve latest version from npm (network or registry). Try again.'
            : `Package auto-update finished with errors (${detail}). Latest: ${summary?.latest || 'n/a'}`,
      summary,
    });
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
