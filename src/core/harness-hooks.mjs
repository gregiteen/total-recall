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
export async function installHarnessHooks({ projectRoot, dryRun = false, log = (line) => console.error(line) } = {}) {
  try {
    const { adapters, failures } = await loadGateAdapters(projectRoot);
    if (!adapters?.installAll) {
      const cause = failures.join('; ') || 'the meta-harness plugin has no installAll';
      log(`  ✖ Harness hooks not installed: ${cause}`);
      return { ok: false, rows: [], error: cause };
    }
    const result = await adapters.installAll({ dryRun });
    const active = result.rows.filter((row) => row.status !== 'not-present');
    log(`  ${result.ok ? '✔' : '✖'} Harness hooks: ${active.map((row) => `${row.harness} ${row.status}`).join(', ') || 'no harness on this machine'}`);
    for (const row of active) {
      const note = row.note || row.reason;
      if (note) log(`    ${row.harness}: ${note}`);
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
