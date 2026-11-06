/** Daemon maintenance delegates enrolled portable skills to their required owners. */
import { loadRegistry } from './skills-registry.mjs';
import { runBounded } from './startup-health.mjs';
import { loadInstalledRequiredInstallationHooks } from './required-plugins.mjs';

export async function maintainPortableSkills({ brainDir, apply = true, run = runBounded } = {}) {
  try {
    const entries = loadRegistry(brainDir).skills;
    const owners = loadInstalledRequiredInstallationHooks(brainDir).filter(({ hook }) => typeof hook.maintain === 'function');
    const reports = await Promise.all(owners.map(({ hook }) => hook.maintain({ brainDir, entries, apply, run })));
    if (reports.length === 1) return reports[0];
    return {
      skipped: reports.every(report => report.skipped),
      failed: reports.reduce((sum, report) => sum + report.failed, 0),
      results: reports.flatMap(report => report.results || []),
    };
  } catch (error) {
    return { failed: 1, results: [], error: error.message };
  }
}
