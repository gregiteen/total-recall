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
import { packageVersionOnDisk, requestSelfRestart } from '../../core/server-restart.mjs';

const router = Router();

/**
 * Install into the host root and WAIT for it.
 *
 * This used to be `detached: true` + `unref()`, which meant the endpoint
 * answered "update complete" while npm was still writing files — the same
 * class of lie as reporting an update finished while the old code kept
 * running. We need the exit anyway: the restart decision below reads the
 * manifest on disk, and reading it before npm has replaced it would see the
 * old version and skip the restart.
 *
 * @returns {Promise<{ok: boolean, code?: number, error?: string}>}
 */
function installIntoHostRoot(latest) {
  return new Promise((resolve) => {
    const proc = spawn('npm', ['install', `${PACKAGE_NAME}@${latest}`, '--save'], {
      cwd: ROOT,
      stdio: 'ignore',
    });
    // spawn reports a missing binary or bad cwd as an 'error' EVENT, not a
    // throw, and an unhandled 'error' on an EventEmitter kills the server.
    proc.on('error', (err) => resolve({ ok: false, error: err.message }));
    proc.on('close', (code) => resolve({ ok: code === 0, code }));
  });
}

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
    const restartWanted = req.body?.restart !== false;

    // The version this process is actually RUNNING, captured before anything is
    // installed over it.
    const versionBefore = packageVersionOnDisk(ROOT);

    // Fire multi-project updater (awaits — install can take minutes; client should timeout high)
    const summary = await runPackageAutoUpdate({
      brainDir: configBrainDir,
      roots,
      dryRun,
      force,
      skipThrottle: true,
      save: true,
    });

    // Also install into ROOT when this host is a consumer (non-source)
    const hostInfo = inspectProjectPackage(ROOT);
    let hostInstall = null;
    if (!hostInfo.isSourceTree && (hostInfo.declared || hostInfo.installed) && !dryRun) {
      const latest = summary.latest || (await fetchLatestNpmVersionAsync());
      if (latest && needsUpdate(hostInfo.installed, latest)) {
        hostInstall = await installIntoHostRoot(latest);
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

    // Restart only when the update replaced the code backing THIS process.
    // Some other project's node_modules changing is no reason to bounce the
    // server, and a source tree is never touched by an npm install at all.
    const versionAfter = packageVersionOnDisk(ROOT);
    const selfReplaced = Boolean(versionBefore && versionAfter && versionBefore !== versionAfter);
    let restart = {
      scheduled: false,
      required: selfReplaced,
      reason: selfReplaced
        ? 'restart not requested'
        : 'this server is already running the installed code',
    };
    if (selfReplaced && !dryRun && restartWanted) {
      const outcome = requestSelfRestart();
      restart = {
        scheduled: outcome.scheduled,
        required: true,
        supervisor: outcome.supervisor,
        reason: outcome.scheduled
          ? `restarting into v${versionAfter} (${outcome.supervisor.label})`
          : outcome.reason,
      };
    }

    const restartNote = restart.scheduled
      ? ` Restarting into v${versionAfter} now.`
      : restart.required
        ? ` This server is still running v${versionBefore} — restart it to pick up v${versionAfter}.`
        : '';

    res.json({
      success: ok,
      updating: !dryRun && ok,
      message: dryRun
        ? `Dry-run complete — ${detail}`
        : ok
          ? `Package auto-update finished for registered projects (${detail}). Latest: ${summary?.latest || 'n/a'}.${restartNote}`
          : summary?.reason === 'npm-view-failed'
            ? 'Could not resolve latest version from npm (network or registry). Try again.'
            : `Package auto-update finished with errors (${detail}). Latest: ${summary?.latest || 'n/a'}`,
      summary,
      host_install: hostInstall,
      restart,
    });
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
