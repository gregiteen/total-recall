#!/usr/bin/env node
/**
 * code-quality / report.mjs — read the last check report and pick the next work.
 *
 * This never runs a checker. It reads
 * reports/latest.json, tells you whether that report still describes your
 * working tree, and orders the remaining findings so you know what to fix next.
 *
 * Views:
 *   report.mjs                 worst files first (default)
 *   report.mjs worst <skip>    page deeper into the worst-files list
 *   report.mjs type            group by error code
 *   report.mjs file <pattern>  everything matching one path
 *   report.mjs count           totals per code and per check
 *   report.mjs raw <checkId>   raw tool output for one check
 *   report.mjs [json|--json]   machine-readable view with honest status (feeds the UI)
 *   report.mjs --review-diagnostics [--json]  cached gate and finding details
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stateDir } from './state.mjs';
import { buildReportView, printCachedReport, wantsStructuredReport } from './report-data.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_DIR = stateDir();
const REPORT_JSON = path.join(SKILL_DIR, 'reports', 'latest.json');
const REPORT_TXT = path.join(SKILL_DIR, 'reports', 'latest.txt');
const CHECK_CMD = `node ${path.relative(process.cwd(), path.join(__dirname, 'check.mjs')) || 'check.mjs'}`;

const [mode = 'worst', arg] = process.argv.slice(2);
const MAX_SHOWN = 150;

// Flush machine output before exiting so piped JSON remains complete.
if (wantsStructuredReport(process.argv.slice(2))) {
  process.exit(await printCachedReport(process.argv.slice(2), REPORT_JSON));
}

const view = buildReportView(REPORT_JSON);
if (['missing', 'unreadable', 'foreign'].includes(view.status)) {
  console.error(`Code Quality report: ${view.status}\n${view.reasons.join('\n')}`);
  process.exit(1);
}
process.exitCode = view.clean ? 0 : 1;

const report = JSON.parse(readFileSync(REPORT_JSON, 'utf8'));
const changed = view.changedSinceRun;
const ageMin = Math.round((Date.now() - Date.parse(report.finishedAt)) / 60000);

// ─── Header ───────────────────────────────────────────────────────────────────

// Errors block a push; warnings and infos are reported but do not. Showing the
// split keeps "17 findings" from reading as "17 things I must fix now".
const sevCount = (report.findings || []).reduce((m, f) => {
  const k = f.severity === 'warning' || f.severity === 'info' ? f.severity : 'error';
  m[k] = (m[k] || 0) + 1;
  return m;
}, {});
const sevLabel = ['error', 'warning', 'info']
  .filter((k) => sevCount[k])
  .map((k) => `${sevCount[k]} ${k}`)
  .join(', ');
console.log(
  `\n code-quality — ${report.toolchain} — ${report.totalFindings} finding(s)${sevLabel ? ` (${sevLabel})` : ''}`
);
console.log(`   ran ${report.ranChecks.join(', ')} at tier=${report.tier} in ${(report.durationMs / 1000).toFixed(1)}s, ${ageMin}min ago`);

if (report.skippedChecks?.length) {
  console.log(`     NOT run: ${report.skippedChecks.map((c) => `${c.id}(${c.tier})`).join(', ')} — this is partial coverage.`);
}
if (report.infrastructureFailure) {
  const bad = report.checks.filter((c) => c.spawnError || c.timedOut);
  console.log(`    INFRASTRUCTURE FAILURE — findings below are incomplete:`);
  for (const c of bad) console.log(`      ${c.id}: ${c.spawnError ? `spawn failed (${c.spawnError})` : 'timed out'}`);
}

// A gate that exited non-zero but produced no parsed findings means the tool
// reported a problem in a format the parser did not understand. Silently
// showing "0 findings" there would be a false clean bill of health.
const opaque = (report.checks || []).filter(
  (c) => !c.ok && !c.spawnError && !c.timedOut && !(report.findings || []).some((f) => f.check === c.id)
);
if (opaque.length) {
  console.log(`     FAILED WITHOUT PARSEABLE FINDINGS — the tool objected, the parser did not understand it:`);
  for (const c of opaque) {
    console.log(`      ${c.id} (exit ${c.exitCode}) → inspect with: report.mjs raw ${c.id}`);
  }
}

console.log(`    Report status: ${view.status}`);
for (const reason of view.reasons) console.log(`    ${reason}`);
if (changed !== null && changed.length === 0 && view.currentHead === view.gitHead) {
  console.log(`    FRESH — no tracked source file has changed since this run started.`);
} else if (changed?.length) {
  console.log(`    STALE for ${changed.length} file(s) edited after the run started:`);
  for (const f of changed.slice(0, 8)) console.log(`      ${f}`);
  if (changed.length > 8) console.log(`      … and ${changed.length - 8} more`);
  console.log(`   Findings in those files may already be fixed. Re-run: ${CHECK_CMD}`);
}
console.log('');

// ─── Views ────────────────────────────────────────────────────────────────────

const findings = report.findings || [];
const byFile = () => {
  const m = new Map();
  for (const f of findings) {
    if (!m.has(f.file)) m.set(f.file, []);
    m.get(f.file).push(f);
  }
  return m;
};
const fmt = (f) => `  ${f.file}:${f.line}:${f.col}  ${f.code}  ${f.message}${f.snippet ? `\n      ↳ ${f.snippet}` : ''}`;
const staleMark = (file) => (changed?.includes(file) ? ' ' : '');

// `raw` reads the stored tool output, not the parsed findings, so it must be
// reachable when there are zero findings — that is precisely the "failed
// without parseable findings" case the header just told you to inspect.
if (mode === 'raw') {
  if (!existsSync(REPORT_TXT)) { console.error('No raw output stored.'); process.exit(1); }
  const raw = readFileSync(REPORT_TXT, 'utf8');
  if (!arg) { console.log(raw.slice(0, 20000)); process.exit(view.clean ? 0 : 1); }
  const section = raw.split(/^# /m).find((s) => s.startsWith(arg));
  console.log(section ? `# ${section}`.slice(0, 40000) : `No raw section for check "${arg}".`);
  process.exit(section && view.clean ? 0 : 1);
}

if (findings.length === 0) {
  console.log(' No findings.');
  process.exit(view.clean ? 0 : 1);
}

switch (mode) {
  case 'count': {
    const codes = {};
    const checks = {};
    for (const f of findings) {
      codes[f.code] = (codes[f.code] || 0) + 1;
      checks[f.check] = (checks[f.check] || 0) + 1;
    }
    console.log(`── by check ──`);
    for (const [k, n] of Object.entries(checks).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);
    console.log(`\n── by code ──`);
    for (const [k, n] of Object.entries(codes).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);
    break;
  }
  case 'type': {
    const codes = {};
    for (const f of findings) (codes[f.code] ||= []).push(f);
    for (const [code, list] of Object.entries(codes).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`\n ${code} — ${list.length}`);
      for (const f of list.slice(0, 6)) console.log(fmt(f));
      if (list.length > 6) console.log(`     … ${list.length - 6} more`);
    }
    break;
  }
  case 'file': {
    if (!arg) { console.error('Usage: report.mjs file <pattern>'); process.exit(1); }
    const hits = findings.filter((f) => f.file.includes(arg));
    console.log(` ${hits.length} finding(s) matching "${arg}"${staleMark(hits[0]?.file || '')}`);
    hits.slice(0, MAX_SHOWN).forEach((f) => console.log(fmt(f)));
    break;
  }
  default: {
    const skip = parseInt(arg, 10) || 0;
    const files = [...byFile().entries()].sort((a, b) => b[1].length - a[1].length);
    const page = files.slice(skip, skip + 4);
    console.log(`── worst files (${skip + 1}–${skip + page.length} of ${files.length}) ──`);
    for (const [file, list] of page) {
      console.log(`\n ${file} (${list.length})${staleMark(file)}`);
      list.slice(0, 40).forEach((f) => console.log(fmt(f)));
      if (list.length > 40) console.log(`     … ${list.length - 40} more`);
    }
    if (files.length > skip + 4) {
      console.log(`\n  ${files.length - (skip + 4)} more file(s). Next page:`);
      console.log(`   node ${path.relative(process.cwd(), __filename)} worst ${skip + 4}`);
    }
  }
}

console.log('');
