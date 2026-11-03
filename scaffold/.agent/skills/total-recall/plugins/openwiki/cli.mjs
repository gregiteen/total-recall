#!/usr/bin/env node
/**
 * OpenWiki CLI Handler
 * Executed via: npx total-recall openwiki <subcommand>
 */
import fs from "node:fs";
import path from "node:path";
import { runBootstrapCommand } from './src/bootstrap.mjs';
import { describeRetention, hasWiki, isDue, readProjects, refreshProject, resolveKey, staleness } from './src/refresh.mjs';
import { announceNewVersion, checkUpstreamStatus, propagateUpdates, readUpstreamState } from './src/upstream-watcher.mjs';

/**
 * Regenerate the generated pages of every registered project that carries them.
 *
 * Fleet-wide by design: the plugin ships from the shared brain, so one
 * implementation covers every repository and every node that resolves it.
 * Defaults to a report; --apply performs the refreshes, because regenerating a
 * repository's documentation is a write to that repository.
 */
async function refreshCommand(args) {
  const json = args.includes('--json');
  const apply = args.includes('--apply');
  const force = args.includes('--force');
  const repoIndex = args.indexOf('--repo');
  const onlyArg = args.find((a) => a.startsWith('--repo='));
  const only = onlyArg
    ? onlyArg.slice('--repo='.length)
    : (repoIndex >= 0 && args[repoIndex + 1] && !args[repoIndex + 1].startsWith('--') ? args[repoIndex + 1] : null);

  let projects;
  try {
    projects = readProjects();
  } catch (err) {
    if (json) console.log(JSON.stringify({ ok: false, error: err.message }));
    else console.error(`OpenWiki refresh: ${err.message}`);
    process.exitCode = 2;
    return;
  }
  if (only) projects = projects.filter((p) => p.name === only || p.root === only);
  if (!projects.length) {
    if (json) console.log(JSON.stringify({ ok: false, error: only ? `No registered project matches ${only}` : 'No registered projects' }));
    else console.error(`OpenWiki refresh: ${only ? `no registered project matches ${only}` : 'no registered projects'}`);
    process.exitCode = 2;
    return;
  }

  const reports = [];
  for (const project of projects) {
    if (!hasWiki(project.root)) {
      reports.push({ ...project, action: 'skipped', reason: 'no generated openwiki/ pages' });
      continue;
    }
    let state;
    try {
      state = force ? { due: true, ...staleness(project.root) } : isDue(project);
    } catch (err) {
      reports.push({ ...project, action: 'skipped', reason: err.message });
      continue;
    }
    if (!state.due) {
      reports.push({ ...project, action: 'current', generatedAt: state.generatedAt, commitsSince: state.commitsSince });
      continue;
    }
    reports.push({ ...project, action: 'due', generatedAt: state.generatedAt, commitsSince: state.commitsSince });
  }

  const due = reports.filter((r) => r.action === 'due');
  let payloadBudgetNote = null;
  if (apply && due.length) {
    const { key, from } = resolveKey();
    if (!key) {
      const error = 'no model credential from the auth store (tried auth secret get and secret get)';
      if (json) console.log(JSON.stringify({ ok: false, error, reports }));
      else console.error(`OpenWiki refresh: ${error}`);
      process.exitCode = 1;
      return;
    }
    const RUNNER_BUDGET_MS = 600000;
    const REPORT_RESERVE_MS = 45000;
    const deadline = Date.now() + RUNNER_BUDGET_MS - REPORT_RESERVE_MS;
    let skippedForBudget = 0;
    for (const entry of due) {
      const remaining = deadline - Date.now();
      if (remaining < 60000) { skippedForBudget += 1; continue; }
      const result = refreshProject({ name: entry.name, root: entry.root }, { key, timeoutMs: remaining });
      const index = reports.findIndex((r) => r.root === entry.root);
      reports[index] = { ...reports[index], ...result, credential: from };
      if (Date.now() >= deadline) { skippedForBudget += 1; }
    }
    if (skippedForBudget > 0) {
      payloadBudgetNote = `${skippedForBudget} project(s) left due: one regeneration can consume this command's 600 s runner budget; run again to continue.`;
    }
  }

  const failed = reports.filter((r) => r.action === 'failed');
  const payload = {
    ok: failed.length === 0,
    applied: apply,
    retention: describeRetention(),
    note: payloadBudgetNote,
    counts: {
      registered: projects.length,
      withPages: reports.filter((r) => r.action !== 'skipped').length,
      due: due.length,
      refreshed: reports.filter((r) => r.action === 'refreshed').length,
      failed: failed.length,
      current: reports.filter((r) => r.action === 'current').length,
    },
    reports,
  };
  if (json) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log(`OpenWiki refresh (${apply ? 'apply' : 'report'}): ${payload.counts.registered} registered, ${payload.counts.withPages} with pages, ${payload.counts.due} due`);
    for (const r of reports) {
      if (r.action === 'current') continue;
      const age = r.generatedAt ? `generated ${r.generatedAt.slice(0, 10)}` : 'never generated';
      console.log(`  ${r.action.padEnd(9)} ${r.name.padEnd(28)} ${age}${Number.isFinite(r.commitsSince) ? `, ${r.commitsSince} commits since` : ''}${r.reason ? ` — ${r.reason}` : ''}`);
    }
    if (payloadBudgetNote) console.log(payloadBudgetNote);
    if (!apply && due.length) console.log('Re-run with --apply to regenerate. Pages are a projection; vault content is never touched.');
  }
  if (failed.length) process.exitCode = 1;
}

async function probeCommand(args) {
  const json = args.includes("--json");
  const host = process.env.TOTAL_RECALL_URL || "http://127.0.0.1:3000";
  const start = Date.now();
  try {
    const res = await fetch(`${host}/health`, { signal: AbortSignal.timeout(3000) });
    const latency_ms = Date.now() - start;
    const ok = res.ok;
    const status = res.status;
    const result = { status, ok, latency_ms, endpoint: "/health" };
    if (json) console.log(JSON.stringify(result));
    else console.log(`Health probe: HTTP ${status} (${latency_ms}ms) from ${host}`);
    if (!ok) process.exitCode = 1;
  } catch (err) {
    const latency_ms = Date.now() - start;
    const result = { status: 503, ok: false, latency_ms, error: err.message };
    if (json) console.log(JSON.stringify(result));
    else console.error(`Health probe failure: ${err.message} (${latency_ms}ms)`);
    process.exitCode = 1;
  }
}

async function hubsCommand(args) {
  const json = args.includes("--json");
  const targetDir = path.resolve(process.cwd(), "openwiki");
  const hubs = [];

  if (fs.existsSync(targetDir)) {
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isFile() && ent.name.endsWith(".md")) {
        const fullPath = path.join(targetDir, ent.name);
        const content = fs.readFileSync(fullPath, "utf8");
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : ent.name.replace(/\.md$/, "");
        const lines = content.split("\n").length;
        hubs.push({
          title,
          path: path.relative(process.cwd(), fullPath),
          lines,
          size_bytes: content.length
        });
      }
    }
  }

  if (json) {
    console.log(JSON.stringify({ hubs, count: hubs.length, directory: targetDir }));
  } else {
    if (hubs.length === 0) {
      console.log(`No markdown hubs found in ${targetDir}`);
    } else {
      console.log(`Discovered ${hubs.length} OpenWiki Hub(s) in ${targetDir}:`);
      for (const h of hubs) {
        console.log(`  - ${h.title}: ${h.path} (${h.lines} lines, ${h.size_bytes} bytes)`);
      }
    }
  }
}

import { runOpenWikiIngest } from "./src/ingest.mjs";

async function ingestCommand(args) {
  const result = await runOpenWikiIngest(args);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

/**
 * Surveillance command for monitoring the upstream open-source OpenWiki package.
 */
async function watchCommand(args) {
  const json = args.includes('--json');
  const checkOnly = args.includes('--check-only');
  const announce = args.includes('--announce') || (!checkOnly && !args.includes('--no-announce'));
  const propagate = args.includes('--propagate');

  const status = await checkUpstreamStatus();
  let announcement = null;
  let propagation = null;

  if (status.ok && status.updateAvailable) {
    if (announce) {
      announcement = await announceNewVersion({
        latestVersion: status.latestVersion,
        currentVersion: status.currentVersion,
        releaseNotesUrl: status.releaseNotesUrl
      });
    }
    if (propagate) {
      propagation = await propagateUpdates({ force: true });
    }
  }

  const payload = {
    ok: status.ok,
    status,
    announcement,
    propagation
  };

  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log('\nOpenWiki Upstream Watcher:');
    console.log(`  Active Recorded Version : v${status.currentVersion}`);
    console.log(`  Latest Upstream Version : v${status.latestVersion}`);
    console.log(`  Update Available        : ${status.updateAvailable ? 'YES (Increment Detected)' : 'No (Current)'}`);
    if (status.releaseNotesUrl) {
      console.log(`  Release Notes           : ${status.releaseNotesUrl}`);
    }
    if (announcement?.announced) {
      console.log(`  Operator Announcement   : Dispatched successfully`);
    }
    if (propagation) {
      console.log(`  Fleet Propagation       : ${propagation.ok ? 'Completed' : 'Failed'} (${propagation.updatedCount} projects updated)`);
    }
    console.log('');
  }

  if (!status.ok) process.exitCode = 1;
}

/**
 * Propagate updated generator across registered repositories.
 */
async function propagateCommand(args) {
  const json = args.includes('--json');
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const repoIndex = args.indexOf('--repo');
  const onlyArg = args.find((a) => a.startsWith('--repo='));
  const repo = onlyArg
    ? onlyArg.slice('--repo='.length)
    : (repoIndex >= 0 && args[repoIndex + 1] && !args[repoIndex + 1].startsWith('--') ? args[repoIndex + 1] : null);

  const result = await propagateUpdates({ repo, force, dryRun });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\nOpenWiki Fleet Propagation (${dryRun ? 'DRY RUN' : 'APPLY'}):`);
    console.log(`  Eligible Repositories : ${result.eligibleCount || 0}`);
    console.log(`  Updated Repositories  : ${result.updatedCount || 0}`);
    console.log(`  Failed Repositories   : ${result.failedCount || 0}`);
    if (Array.isArray(result.reports)) {
      for (const r of result.reports) {
        console.log(`  • ${r.name}: ${r.action}${r.reason ? ` — ${r.reason}` : ''}`);
      }
    }
    console.log('');
  }

  if (!result.ok) process.exitCode = 1;
}

const IMPLEMENTED = {};
IMPLEMENTED.probe = probeCommand;
IMPLEMENTED.hubs = hubsCommand;
IMPLEMENTED.ingest = ingestCommand;
IMPLEMENTED.bootstrap = runBootstrapCommand;
IMPLEMENTED.refresh = refreshCommand;
IMPLEMENTED.watch = watchCommand;
IMPLEMENTED.propagate = propagateCommand;

export async function run(argv = process.argv) {
  let rawArgs = Array.isArray(argv) && argv.length > 0 ? [...argv] : process.argv.slice(2);
  while (rawArgs.length > 0 && (
    rawArgs[0].endsWith('node') ||
    rawArgs[0].endsWith('total-recall') ||
    rawArgs[0].endsWith('cli.mjs') ||
    rawArgs[0] === 'openwiki'
  )) {
    rawArgs.shift();
  }

  const sub = rawArgs[0] || "status";
  const json = rawArgs.includes("--json");

  if (sub === "status") {
    const upstream = readUpstreamState();
    const status = {
      plugin: "openwiki",
      implemented: Object.keys(IMPLEMENTED),
      upstream: {
        recordedVersion: upstream.currentRecordedVersion,
        latestVersion: upstream.latestKnownVersion,
        lastChecked: upstream.lastCheckedAt,
        lastPropagated: upstream.lastPropagatedAt
      }
    };
    if (json) console.log(JSON.stringify(status, null, 2));
    else {
      console.log(`OpenWiki: implemented subcommands: ${status.implemented.join(", ")}`);
      console.log(`Upstream Status: recorded v${status.upstream.recordedVersion}, latest v${status.upstream.latestVersion}`);
    }
    return;
  }

  if (sub === "help" || sub === "--help" || sub === "-h") {
    console.log(`
  OpenWiki — Multi-repo knowledge graph and documentation wiki engine

  Usage:
    total-recall openwiki <subcommand> [options]

  Subcommands:
    status                    Show OpenWiki plugin and upstream status
    probe [--json]            Check subsystem health
    hubs [--json]             List indexed documentation hubs
    ingest <path> [options]   Ingest Markdown files into knowledge graph
    bootstrap --brain <path> [--project-root <path>] [--dry-run] [--json]
                              Create missing plugin-owned documentation pages
    refresh [--repo <name>] [--apply] [--force] [--json]
                              Report which registered projects' generated pages are stale;
                              --apply regenerates stale pages (writes openwiki/ only)
    watch [--check-only] [--announce] [--propagate] [--json]
                              Watch upstream OpenWiki repository and announce new versions
    propagate [--repo <name>] [--force] [--dry-run] [--json]
                              Propagate updated generator across registered repositories
`);
    return;
  }

  if (Object.hasOwn(IMPLEMENTED, sub)) return IMPLEMENTED[sub](rawArgs.slice(1));

  if (json) console.log(JSON.stringify({ ok: false, error: `OpenWiki operation is not implemented: ${sub}` }));
  console.error(`OpenWiki: "${sub}" is not implemented.`);
  process.exitCode = 2;
}

if (process.argv[1] && (process.argv[1].endsWith('cli.mjs') || process.argv[1].endsWith('tr-plugin-openwiki'))) {
  run(process.argv);
}

export default run;
