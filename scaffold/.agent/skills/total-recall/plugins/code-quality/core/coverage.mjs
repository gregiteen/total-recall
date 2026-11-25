/** Gate coverage for one repository or every registered project brain. Reads only. */
import fs from 'node:fs';
import path from 'node:path';
import { ensureGates, NEEDS_ENSURE, NEEDS_ATTENTION, SKILL_ID } from './ensure.mjs';
import { buildReportView } from './report-data.mjs';
import { registeredProjects } from './fleet.mjs';

/** The last report of one repository, without starting a check. */
export function reportState(repo) {
  const file = path.join(repo, '.agent', 'skills', SKILL_ID, 'reports', 'latest.json');
  if (!fs.existsSync(file)) return { status: 'missing', at: null, ageDays: null };
  const view = buildReportView(file, { cwd: repo });
  const at = view.finishedAt || view.startedAt || null;
  return { status: view.status, at, ageDays: at ? Math.floor((Date.now() - Date.parse(at)) / 86_400_000) : null, blocking: view.blockingFindings ?? null };
}

export async function repoCoverage(repo, { host } = {}) {
  const gates = await ensureGates(repo, { dryRun: true, host });
  return { repo: gates.repo, state: gates.state, gates: gates.gates, covered: !NEEDS_ENSURE.has(gates.state) && !NEEDS_ATTENTION.has(gates.state), error: gates.error, report: reportState(gates.repo) };
}

/**
 * @returns {Promise<{ total: number, active: number, uncovered: number, uncoveredActive: string[], projects: object[] }>}
 */
export async function fleetCoverage({ activeDays, globalBrainDir, host } = {}) {
  const projects = [];
  for (const project of await registeredProjects({ activeDays, globalBrainDir })) {
    if (!project.exists) { projects.push({ ...project, state: 'missing-path', covered: false, gates: [] }); continue; }
    const coverage = await repoCoverage(project.path, { host });
    projects.push({ ...project, state: coverage.state, covered: coverage.covered, gates: coverage.gates, report: coverage.report, ...(coverage.error ? { error: coverage.error } : {}) });
  }
  const uncovered = projects.filter((p) => !p.covered);
  return {
    total: projects.length,
    active: projects.filter((p) => p.active).length,
    uncovered: uncovered.length,
    uncoveredActive: uncovered.filter((p) => p.active).map((p) => p.name),
    projects,
  };
}

/** One-line check for `startup check`: does this repository have a usable gate list? */
export async function gateStatus(repo, { host } = {}) {
  const coverage = await repoCoverage(repo, { host });
  if (coverage.state === 'no-brain') return { ok: true, outstanding: 0, summary: 'No Total Recall project brain here; gates are not recorded.' };
  // A brain can live in a plain folder of notes. Gates belong to a repository.
  if (!fs.existsSync(path.join(coverage.repo, '.git'))) return { ok: true, outstanding: 0, summary: 'Not a git repository; gates apply to repositories.' };
  if (NEEDS_ENSURE.has(coverage.state)) {
    return { ok: true, outstanding: 1, summary: `No code-quality gates in ${coverage.repo}. Set them up: total-recall code-quality ensure` };
  }
  if (NEEDS_ATTENTION.has(coverage.state)) {
    return { ok: true, outstanding: 1, summary: `The gate list in ${coverage.repo} is ${coverage.state}: ${coverage.error || 'inspect it'}` };
  }
  const { status, blocking } = coverage.report;
  if (status === 'failed' || status === 'infrastructure' || status === 'unparsed-failure') {
    return { ok: true, outstanding: Math.max(1, blocking || 0), summary: `Last gate run ${status} in ${coverage.repo} (${blocking ?? '?'} blocking). Read: total-recall code-quality report` };
  }
  return { ok: true, outstanding: 0, summary: `${coverage.gates.length} gate(s) configured; last run: ${status}.` };
}
