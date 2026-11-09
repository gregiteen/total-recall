/**
 * Total Recall ships the hooks; the meta-harness plugin ships the adapter for each
 * harness. `init` and `update` call this so no machine needs a manual step.
 */
export async function loadGateAdapters(projectRoot = process.cwd()) {
  const { loadPluginModule } = await import('./plugin-runtime.mjs');
  const failures = [];
  for (const owner of ['meta-harness', 'cli-agents']) {
    try {
      const adapters = await loadPluginModule(owner, 'gate-adapters', { requireValid: false, projectRoot });
      if (adapters) return { adapters, failures };
    } catch (err) { failures.push(`${owner}: ${err.message}`); }
  }
  return { adapters: null, failures };
}

/** Never throws: an install must finish, and a failure must be reported. */
export async function installHarnessHooks({ projectRoot, home, dryRun = false, log = (line) => console.error(line) } = {}) {
  try {
    const { adapters, failures } = await loadGateAdapters(projectRoot);
    if (!adapters?.installAll) {
      const cause = failures.join('; ') || 'the meta-harness plugin has no installAll';
      log(`  ✖ Harness hooks not installed: ${cause}`);
      return { ok: false, rows: [], error: cause };
    }
    const result = await adapters.installAll({ dryRun, ...(home ? { home } : {}) });
    const { installLessonHooks } = await import('./lesson-hooks.mjs');
    for (const row of result.rows) {
      try { row.lessons = installLessonHooks(row, { dryRun }); }
      catch (error) { row.lessons = { status: 'failed', error: error.message }; result.ok = false; }
    }
    const active = result.rows.filter((row) => row.status !== 'not-present');
    log(`  ${result.ok ? '✔' : '✖'} Harness hooks: ${active.map((row) => `${row.harness} ${row.status}`).join(', ') || 'no harness on this machine'}`);
    for (const row of active) {
      const note = row.note || row.reason;
      if (note) log(`    ${row.harness}: ${note}`);
      if (row.lessons?.error || row.lessons?.note) log(`    ${row.harness} lessons: ${row.lessons.error || row.lessons.note}`);
    }
    return result;
  } catch (err) {
    log(`  ✖ Harness hooks not installed: ${err.message}`);
    return { ok: false, rows: [], error: err.message };
  }
}

/**
 * Take the gate out of every harness. Only `total-recall uninstall` calls this: a fail-closed hook
 * that outlives Total Recall would deny every call in that harness. Never throws, because a harness
 * that cannot be cleaned must not stop the uninstall; it is reported instead.
 */
export async function removeHarnessHooks({ projectRoot, dryRun = false, log = (line) => console.error(line) } = {}) {
  try {
    const { adapters, failures } = await loadGateAdapters(projectRoot);
    if (!adapters?.removeAll) {
      const cause = failures.join('; ') || 'the meta-harness plugin has no removeAll';
      log(`  ✖ Harness hooks not removed: ${cause}`);
      return { ok: false, rows: [], error: cause };
    }
    const { installLessonHooks } = await import('./lesson-hooks.mjs');
    // Find each owner's settings before removal can remove the path.
    for (const adapter of adapters.list()) {
      const existing = await adapter.install({ dryRun: true, remove: true });
      if (existing.settings) installLessonHooks({ harness: adapter.id, settings: existing.settings, status: 'installed' }, { dryRun, remove: true });
    }
    const result = await adapters.removeAll({ dryRun });
    const removed = result.rows.filter((row) => row.status === 'removed').map((row) => row.harness);
    log(`  ${result.ok ? '✔' : '✖'} Harness hooks: ${removed.length ? `removed from ${removed.join(', ')}` : 'none present'}`);
    for (const row of result.rows) {
      const note = row.note || row.error;
      if (note) log(`    ${row.harness}: ${note}`);
    }
    return result;
  } catch (err) {
    log(`  ✖ Harness hooks not removed: ${err.message}`);
    return { ok: false, rows: [], error: err.message };
  }
}
