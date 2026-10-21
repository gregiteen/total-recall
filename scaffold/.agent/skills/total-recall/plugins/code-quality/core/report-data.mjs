#!/usr/bin/env node
/**
 * code-quality / report-data.mjs — the data adapter behind the report UI.
 *
 * Reads reports/latest.json exactly as check.mjs wrote it and returns a view
 * with an honest status. It never runs a gate and never invents a number: every
 * count comes from the report file, and a missing, unreadable, stale or
 * partial report can never produce status "clean".
 *
 *   node report-data.mjs            print the view as JSON (exit 0 if clean, 1 otherwise)
 *
 * Status, most severe first:
 *   missing         no report file
 *   unreadable      report file is not valid JSON or has an unknown shape
 *   infrastructure  a gate failed to spawn or timed out; results are incomplete
 *   unparsed-failure a gate exited non-zero with no parseable findings
 *   failed          findings or a failing gate
 *   zero-scope      a grep gate scanned zero files, or nothing ran
 *   stale           source changed after the run started, or HEAD moved
 *   unknown-freshness git could not be read
 *   partial         clean, but higher-tier gates were skipped
 *   clean           every gate ran, nothing changed since
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.vue', '.svelte']);

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 20_000 });
}

/** Returns { head, changed } or null when git cannot be read. */
function freshness(report) {
  try {
    const head = git(report.repoRoot, ['rev-parse', 'HEAD']).trim();
    const startedMs = Date.parse(report.startedAt);
    const changed = [];
    for (const rel of git(report.repoRoot, ['ls-files', '-z']).split('\0')) {
      if (!rel || !SOURCE_EXTS.has(path.extname(rel))) continue;
      try {
        if (statSync(path.join(report.repoRoot, rel)).mtimeMs > startedMs) changed.push(rel);
      } catch { /* deleted since the run */ }
    }
    return { head, changed };
  } catch {
    return null;
  }
}

export function buildReportView(reportFile, { now = Date.now(), inspectGit = true } = {}) {
  const base = { reportFile, status: 'missing', reasons: [] };
  if (!existsSync(reportFile)) {
    return { ...base, reasons: ['No report file. Run code-quality-check, then reload.'] };
  }
  let report;
  try {
    report = JSON.parse(readFileSync(reportFile, 'utf8'));
  } catch (err) {
    return { ...base, status: 'unreadable', reasons: [`Report is not valid JSON: ${err.message}`] };
  }
  if (!report || !Array.isArray(report.checks) || !Array.isArray(report.ranChecks) || !report.startedAt) {
    return { ...base, status: 'unreadable', reasons: ['Report does not have the code-quality schema (checks, ranChecks, startedAt).'] };
  }

  const findings = Array.isArray(report.findings) ? report.findings : [];
  const hard = findings.filter((f) => f.severity !== 'warning' && f.severity !== 'info');
  const skipped = Array.isArray(report.skippedChecks) ? report.skippedChecks : [];
  const gates = report.checks.map((c) => ({
    id: c.id,
    ok: Boolean(c.ok),
    exitCode: c.exitCode ?? null,
    durationMs: c.durationMs ?? null,
    scanned: typeof c.scanned === 'number' ? c.scanned : null,
    spawnError: c.spawnError || null,
    timedOut: Boolean(c.timedOut),
    findings: findings.filter((f) => f.check === c.id).length,
  }));
  for (const s of skipped) gates.push({ id: s.id, skipped: true, tier: s.tier });

  const infra = report.checks.filter((c) => c.spawnError || c.timedOut);
  const unparsed = report.checks.filter(
    (c) => !c.ok && !c.spawnError && !c.timedOut && !findings.some((f) => f.check === c.id)
  );
  const zeroScope = report.checks.filter((c) => c.scanned === 0);
  const fresh = inspectGit ? freshness(report) : null;
  const headMoved = Boolean(fresh && report.gitHead && fresh.head !== report.gitHead);

  const reasons = [];
  let status = 'clean';
  const set = (s, why) => { if (status === 'clean' || SEVERITY.indexOf(s) < SEVERITY.indexOf(status)) status = s; reasons.push(why); };
  const SEVERITY = ['infrastructure', 'unparsed-failure', 'failed', 'zero-scope', 'stale', 'unknown-freshness', 'partial', 'clean'];

  if (infra.length) set('infrastructure', `${infra.map((c) => c.id).join(', ')}: spawn failure or timeout; results are incomplete`);
  if (unparsed.length) set('unparsed-failure', `${unparsed.map((c) => `${c.id} (exit ${c.exitCode})`).join(', ')}: failed without parseable findings`);
  if (hard.length || report.checks.some((c) => !c.ok)) {
    if (!infra.length && !unparsed.length) set('failed', `${hard.length} blocking finding(s)`);
  }
  if (report.ranChecks.length === 0) set('zero-scope', 'No gates ran');
  if (zeroScope.length) set('zero-scope', `${zeroScope.map((c) => c.id).join(', ')}: scanned 0 files`);
  if (fresh === null && inspectGit) set('unknown-freshness', 'git could not be read; cannot tell whether this report matches the tree');
  else if (fresh && (fresh.changed.length || headMoved)) {
    set('stale', headMoved
      ? `HEAD moved from ${String(report.gitHead).slice(0, 8)} to ${fresh.head.slice(0, 8)}`
      : `${fresh.changed.length} source file(s) changed after the run started`);
  }
  if (skipped.length) set('partial', `Not run (tier ${report.tier}): ${skipped.map((s) => `${s.id}(${s.tier})`).join(', ')}`);

  return {
    reportFile,
    status,
    reasons,
    clean: status === 'clean',
    toolchain: report.toolchain,
    repoRoot: report.repoRoot,
    tier: report.tier,
    gitHead: report.gitHead ?? null,
    currentHead: fresh?.head ?? null,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt ?? null,
    ageMs: report.finishedAt ? Math.max(0, now - Date.parse(report.finishedAt)) : null,
    durationMs: report.durationMs ?? null,
    sourceFileCount: report.sourceFileCount ?? null,
    ranChecks: report.ranChecks,
    skippedChecks: skipped,
    gates,
    totalFindings: report.totalFindings ?? findings.length,
    blockingFindings: hard.length,
    changedSinceRun: fresh ? fresh.changed : null,
    findings: findings.slice(0, 200),
    findingsTruncated: findings.length > 200,
  };
}

export function defaultReportFile() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'reports', 'latest.json');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const view = buildReportView(process.argv[2] || defaultReportFile());
  console.log(JSON.stringify(view, null, 2));
  process.exitCode = view.clean ? 0 : 1;
}
