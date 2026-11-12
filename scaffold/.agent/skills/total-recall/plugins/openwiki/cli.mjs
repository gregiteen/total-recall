#!/usr/bin/env node
/**
 * OpenWiki CLI Handler
 * Executed via: npx total-recall openwiki <subcommand>
 */
import fs from "node:fs";
import path from "node:path";
import { runBootstrapCommand } from './src/bootstrap.mjs';
import { describeRetention, hasWiki, isDue, readProjects, refreshProject, refreshProjectAsync, resolveKey, staleness } from './src/refresh.mjs';
import { watchUpstream, propagateUpdates, readUpstreamState, bundledGeneratorVersion } from './src/upstream-watcher.mjs';
import { loadOpenWikiConfig, setOpenWikiConfigValue, resetOpenWikiConfig, resolveConfigPath, ALLOWED_CONFIG_KEYS, ALLOWED_PROVIDERS } from './src/config.mjs';
import { discoverAllHubs } from './src/mesh-vaults.mjs';
import { searchWikiHubs } from './src/search.mjs';
import { buildKnowledgeGraph } from './src/graph.mjs';
import { getTokenStatus, setTokenValue } from './src/token.mjs';
import { lintWikiHubs } from './src/lint.mjs';
import { generateWiki } from './src/generate.mjs';
import { retrieveContext } from './src/context-provider.mjs';

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
    let state;
    try {
      state = force ? { due: true, ...staleness(project.root) } : isDue(project);
    } catch (err) {
      reports.push({ ...project, action: 'skipped', reason: err.message });
      continue;
    }
    if (!state.due) {
      if (state.skipped) {
        reports.push({ ...project, action: 'skipped', reason: state.reason });
      } else {
        reports.push({ ...project, action: 'current', generatedAt: state.generatedAt, commitsSince: state.commitsSince });
      }
      continue;
    }
    reports.push({
      ...project,
      action: 'due',
      uninitialized: Boolean(state.uninitialized),
      generatedAt: state.generatedAt,
      commitsSince: state.commitsSince,
      reason: state.reason
    });
  }

  const due = reports.filter((r) => r.action === 'due');
  let payloadBudgetNote = null;
  if (apply && due.length) {
    const config = loadOpenWikiConfig();
    const { key, from } = resolveKey({ provider: config.provider });
    if (!key) {
      const keyName = config.provider === 'google' ? 'GOOGLE_API_KEY' : 'OPENROUTER_API_KEY';
      const error = `No model credential for provider '${config.provider}'. Save via: total-recall auth secret set ${keyName} --stdin`;
      if (json) console.log(JSON.stringify({ ok: false, error, reports }));
      else console.error(`OpenWiki refresh: ${error}`);
      process.exitCode = 1;
      return;
    }
    const concurrencyArg = args.find((a) => a.startsWith('--concurrency='));
    const concurrencyIndex = args.indexOf('--concurrency');
    const concurrency = Math.max(1, parseInt(
      concurrencyArg ? concurrencyArg.slice('--concurrency='.length) : (concurrencyIndex >= 0 ? args[concurrencyIndex + 1] : '8'),
      10
    ) || 8);

    if (!json) {
      console.log(`OpenWiki refresh (apply): dispatching ${due.length} projects with concurrency ${concurrency}`);
    }

    let queueIndex = 0;
    let completedCount = 0;
    const worker = async () => {
      while (queueIndex < due.length) {
        const itemIndex = queueIndex++;
        const entry = due[itemIndex];
        const mode = entry.uninitialized ? 'init' : 'update';
        if (!json) {
          console.log(`[${itemIndex + 1}/${due.length}] ▶ ${entry.name.padEnd(28)} starting ${mode}...`);
        }
        const result = await refreshProjectAsync(
          { name: entry.name, root: entry.root },
          { key, model: config.model, provider: config.provider, timeoutMs: config.timeout_ms }
        );
        completedCount++;
        const index = reports.findIndex((r) => r.root === entry.root);
        reports[index] = { ...reports[index], ...result, credential: from };
        if (!json) {
          const duration = Math.round((Date.now() - (result.startedAt || Date.now())) / 1000);
          const icon = result.action === 'failed' ? '✖' : '✔';
          console.log(`[${completedCount}/${due.length}] ${icon} ${entry.name.padEnd(28)} ${result.action} (${duration}s)${result.reason ? ` — ${result.reason}` : ''}`);
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, due.length) }, () => worker());
    await Promise.all(workers);
  }

  const failed = reports.filter((r) => r.action === 'failed');
  const payload = {
    ok: failed.length === 0,
    applied: apply,
    retention: describeRetention(),
    note: payloadBudgetNote,
    counts: {
      registered: projects.length,
      withPages: reports.filter((r) => r.action !== 'skipped' && !r.uninitialized).length,
      due: due.length,
      uninitialized: reports.filter((r) => r.uninitialized).length,
      refreshed: reports.filter((r) => r.action === 'refreshed' || r.action === 'initialized').length,
      failed: failed.length,
      current: reports.filter((r) => r.action === 'current').length,
    },
    reports,
  };
  if (json) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log(`OpenWiki refresh (${apply ? 'apply' : 'report'}): ${payload.counts.registered} registered, ${payload.counts.due} due (${payload.counts.uninitialized} uninitialized)`);
    for (const r of reports) {
      if (r.action === 'current') continue;
      const age = r.uninitialized ? 'uninitialized' : (r.generatedAt ? `generated ${r.generatedAt.slice(0, 10)}` : 'never generated');
      console.log(`  ${r.action.padEnd(9)} ${r.name.padEnd(28)} ${age}${Number.isFinite(r.commitsSince) && r.commitsSince !== Infinity ? `, ${r.commitsSince} commits since` : ''}${r.reason ? ` — ${r.reason}` : ''}`);
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
  const allVaults = args.includes("--all-vaults") || args.includes("--all");
  const nodeArg = args.find((a) => a.startsWith('--node='));
  const nodeIndex = args.indexOf('--node');
  const node = nodeArg
    ? nodeArg.slice('--node='.length)
    : (nodeIndex >= 0 && args[nodeIndex + 1] && !args[nodeIndex + 1].startsWith('--') ? args[nodeIndex + 1] : null);

  try {
    const res = await discoverAllHubs({ allVaults, node });
    if (json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      if (!res.hubs || res.hubs.length === 0) {
        console.log(`No markdown hubs found (${res.scope || 'workspace'})`);
      } else {
        const prefix = res.isRemote ? `[Node ${res.node}] ` : '';
        console.log(`${prefix}Discovered ${res.hubs.length} OpenWiki Hub(s) (${res.scope || 'workspace'}):`);
        for (const h of res.hubs) {
          const repoTag = h.repoName ? `[${h.repoName}] ` : '';
          console.log(`  - ${repoTag}${h.title}: ${h.path} (${h.lines} lines, ${h.size_bytes} bytes)`);
        }
      }
    }
  } catch (err) {
    if (json) console.log(JSON.stringify({ ok: false, error: err.message }));
    else console.error(`OpenWiki hubs error: ${err.message}`);
    process.exitCode = 1;
  }
}

async function searchCommand(args) {
  const json = args.includes("--json");
  const allVaults = args.includes("--all-vaults") || args.includes("--all");
  const nodeArg = args.find((a) => a.startsWith('--node='));
  const nodeIndex = args.indexOf('--node');
  const node = nodeArg
    ? nodeArg.slice('--node='.length)
    : (nodeIndex >= 0 && args[nodeIndex + 1] && !args[nodeIndex + 1].startsWith('--') ? args[nodeIndex + 1] : null);

  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limitIndex = args.indexOf('--limit');
  const limit = limitArg
    ? parseInt(limitArg.slice('--limit='.length), 10)
    : (limitIndex >= 0 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1], 10) : 20);

  const queryTerms = args.filter((a, idx) => {
    if (a.startsWith('--')) return false;
    if (nodeIndex >= 0 && idx === nodeIndex + 1) return false;
    if (limitIndex >= 0 && idx === limitIndex + 1) return false;
    return true;
  });
  const query = queryTerms.join(' ').trim();

  if (!query) {
    if (json) console.log(JSON.stringify({ ok: false, error: 'Query argument required: openwiki search <query>' }));
    else console.error('OpenWiki search error: query required. Usage: total-recall openwiki search <query> [--all-vaults] [--node <node>]');
    process.exitCode = 1;
    return;
  }

  try {
    const res = await searchWikiHubs(query, { allVaults, node, limit });
    if (json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`\nOpenWiki Evidence Search: "${query}" (${res.count} match${res.count === 1 ? '' : 'es'} across ${res.totalHubsScanned} hubs, ${res.scope})`);
      if (res.results.length === 0) {
        console.log('  No matching evidence passages found.\n');
      } else {
        for (const r of res.results) {
          console.log(`\n  • [${r.repoName}] ${r.title} > ${r.section} (line ${r.line}):`);
          console.log(`    "${r.snippet}"`);
        }
        console.log('');
      }
    }
  } catch (err) {
    if (json) console.log(JSON.stringify({ ok: false, error: err.message }));
    else console.error(`OpenWiki search error: ${err.message}`);
    process.exitCode = 1;
  }
}

async function graphCommand(args) {
  const json = args.includes("--json");
  const allVaults = args.includes("--all-vaults") || args.includes("--all");
  const nodeArg = args.find((a) => a.startsWith('--node='));
  const nodeIndex = args.indexOf('--node');
  const node = nodeArg
    ? nodeArg.slice('--node='.length)
    : (nodeIndex >= 0 && args[nodeIndex + 1] && !args[nodeIndex + 1].startsWith('--') ? args[nodeIndex + 1] : null);

  const formatArg = args.find((a) => a.startsWith('--format='));
  const formatIndex = args.indexOf('--format');
  const format = formatArg
    ? formatArg.slice('--format='.length)
    : (formatIndex >= 0 && args[formatIndex + 1] ? args[formatIndex + 1] : (args.includes('--mermaid') ? 'mermaid' : (args.includes('--dot') ? 'dot' : 'json')));

  try {
    const res = await buildKnowledgeGraph({ allVaults, node, format });
    if (json || format === 'json') {
      console.log(JSON.stringify(res, null, 2));
    } else if (format === 'mermaid') {
      console.log(res.mermaid);
    } else if (format === 'dot') {
      console.log(res.dot);
    }
  } catch (err) {
    if (json) console.log(JSON.stringify({ ok: false, error: err.message }));
    else console.error(`OpenWiki graph error: ${err.message}`);
    process.exitCode = 1;
  }
}

async function tokenCommand(args) {
  const json = args.includes("--json");
  const verb = args.find((a) => !a.startsWith('--')) || 'status';

  try {
    if (verb === 'status') {
      const res = getTokenStatus();
      if (json) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log('\nOpenWiki Token Status (Total Recall Auth Store):');
        for (const [provider, t] of Object.entries(res.tokens)) {
          const icon = t.configured ? '✔' : '✖';
          console.log(`  ${icon} ${provider.padEnd(12)} : ${t.key} (${t.status})`);
        }
        console.log('\nTo set a token: total-recall openwiki token set <openrouter|google> --stdin\n');
      }
      return;
    }

    if (verb === 'set') {
      const [, provider, ...extra] = args.filter(arg => arg !== '--json' && arg !== '--stdin');
      if (!args.includes('--stdin') || !provider || extra.length) {
        throw new Error('Use openwiki token set <provider> --stdin with the credential on standard input');
      }
      const value = fs.readFileSync(0, 'utf8');
      const res = setTokenValue(provider, value);
      if (json) console.log(JSON.stringify(res, null, 2));
      else console.log(`✔ ${res.message}`);
      return;
    }

    throw new Error(`Unknown token action '${verb}'. Supported: status, set`);
  } catch (err) {
    if (json) console.log(JSON.stringify({ ok: false, error: err.message }));
    else console.error(`OpenWiki token error: ${err.message}`);
    process.exitCode = 1;
  }
}

async function lintCommand(args) {
  const json = args.includes("--json");
  const allVaults = args.includes("--all-vaults") || args.includes("--all");
  const nodeArg = args.find((a) => a.startsWith('--node='));
  const nodeIndex = args.indexOf('--node');
  const node = nodeArg
    ? nodeArg.slice('--node='.length)
    : (nodeIndex >= 0 && args[nodeIndex + 1] && !args[nodeIndex + 1].startsWith('--') ? args[nodeIndex + 1] : null);

  try {
    const res = await lintWikiHubs({ allVaults, node });
    if (json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`\nOpenWiki Documentation Health & Hygiene:`);
      console.log(`  Health Score        : ${res.healthScore}%`);
      console.log(`  Total Hubs Scanned  : ${res.totalHubs}`);
      console.log(`  Total Links Tested  : ${res.totalLinks}`);
      console.log(`  Broken Links        : ${res.brokenLinksCount}`);
      console.log(`  Orphaned Hubs       : ${res.orphanCount}`);

      if (res.issues.length > 0) {
        console.log('\nIssues Found:');
        for (const iss of res.issues) {
          console.log(`  ✖ [${iss.type}] in ${path.basename(iss.file)}: ${iss.message}`);
        }
      } else {
        console.log('\n✔ All wiki links and headers verified clean!');
      }
      console.log('');
    }
    if (!res.ok) process.exitCode = 1;
  } catch (err) {
    if (json) console.log(JSON.stringify({ ok: false, error: err.message }));
    else console.error(`OpenWiki lint error: ${err.message}`);
    process.exitCode = 1;
  }
}

async function generateCommand(args) {
  const json = args.includes("--json");
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");
  const repoIndex = args.indexOf('--repo');
  const repoArg = args.find((a) => a.startsWith('--repo='));
  const repo = repoArg
    ? repoArg.slice('--repo='.length)
    : (repoIndex >= 0 && args[repoIndex + 1] && !args[repoIndex + 1].startsWith('--') ? args[repoIndex + 1] : null);

  const nodeArg = args.find((a) => a.startsWith('--node='));
  const nodeIndex = args.indexOf('--node');
  const node = nodeArg
    ? nodeArg.slice('--node='.length)
    : (nodeIndex >= 0 && args[nodeIndex + 1] && !args[nodeIndex + 1].startsWith('--') ? args[nodeIndex + 1] : null);

  try {
    const res = await generateWiki({
      repo,
      force,
      dryRun,
      node,
      onProgress: (msg) => {
        if (!json) console.log(`  ▶ ${msg}`);
      },
    });

    if (json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`\n✔ Generated documentation for ${res.repoName} (${Math.round((res.durationMs || 0)/1000)}s) via ${res.generatorVia}`);
      console.log(`  Output: ${res.outputDir}\n`);
    }
  } catch (err) {
    if (json) console.log(JSON.stringify({ ok: false, error: err.message }));
    else console.error(`OpenWiki generate error: ${err.message}`);
    process.exitCode = 1;
  }
}

import { runOpenWikiIngest } from "./src/ingest.mjs";

async function ingestCommand(args) {
  const json = args.includes('--json');
  try {
    const result = await runOpenWikiIngest(args);
    if (json && !args.some(arg => arg === '--help' || arg === '-h')) console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    if (json) console.log(JSON.stringify({ ok: false, error: error.message }));
    else console.error(`OpenWiki ingest error: ${error.message}`);
    process.exitCode = 1;
  }
}

/**
 * Surveillance command for monitoring the upstream open-source OpenWiki package.
 */
async function watchCommand(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: total-recall openwiki watch [--check-only] [--announce|--no-announce] [--propagate] [--json]');
    return;
  }
  const json = args.includes('--json');
  const checkOnly = args.includes('--check-only');
  const announce = args.includes('--announce') || (!checkOnly && !args.includes('--no-announce'));
  const propagate = args.includes('--propagate');

  const payload = await watchUpstream({ checkOnly, announce, propagate });
  const { status, announcement, propagation } = payload;

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
      console.log(`  Operator Announcement   : Accepted by alert owner`);
    }
    if (status.error) console.log(`  Upstream Check          : ${status.error}`);
    if (announcement?.error) console.log(`  Operator Announcement   : Failed (${announcement.error})`);
    if (propagation) {
      console.log(`  Fleet Propagation       : ${propagation.ok ? 'Completed' : 'Failed'} (${propagation.updatedCount} projects updated)`);
      if (propagation.error) console.log(`  Propagation Error       : ${propagation.error}`);
    }
    console.log('');
  }

  if (!payload.ok) process.exitCode = 1;
}

/**
 * Propagate updated generator across registered repositories.
 */
async function propagateCommand(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
  Usage:
    total-recall openwiki propagate [options]

  Options:
    --repo <name>    Limit propagation to a specific repository
    --force          Force regeneration even if not due
    --dry-run        Preview propagation actions without writing
    --json           Output result as JSON
    --help, -h       Show this help
`);
    return;
  }
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
    console.log(`  Partial Repositories  : ${result.partialCount || 0}`);
    console.log(`  Incomplete Repositories: ${result.incompleteCount || 0}`);
    if (result.error) console.log(`  Error                 : ${result.error}`);
    if (Array.isArray(result.reports)) {
      for (const r of result.reports) {
        console.log(`  • ${r.name}: ${r.action}${r.reason ? ` — ${r.reason}` : ''}`);
      }
    }
    console.log('');
  }

  if (!result.ok) process.exitCode = 1;
}

/**
 * Configure OpenWiki generation parameters and cheap model routing.
 */
async function configCommand(args) {
  const json = args.includes('--json');
  const cleanArgs = args.filter((a) => a !== '--json');
  const verb = cleanArgs[0] || 'show';

  try {
    if (verb === 'show') {
      const config = loadOpenWikiConfig();
      const configPath = resolveConfigPath();
      const payload = { ok: true, path: configPath, config };
      if (json) console.log(JSON.stringify(payload, null, 2));
      else {
        console.log(`\nOpenWiki Configuration (${configPath}):`);
        console.log(`  Provider        : ${config.provider}`);
        console.log(`  Model           : ${config.model}`);
        console.log(`  Fallback Model  : ${config.fallback_model}`);
        console.log(`  Max Tokens      : ${config.max_tokens}`);
        console.log(`  Timeout (ms)    : ${config.timeout_ms}\n`);
      }
      return;
    }

    if (verb === 'get') {
      const key = cleanArgs[1];
      if (!key) {
        throw new Error('Key argument required: openwiki config get <key>');
      }
      if (!ALLOWED_CONFIG_KEYS.includes(key)) {
        throw new Error(`Unknown configuration key '${key}'. Allowed: ${ALLOWED_CONFIG_KEYS.join(', ')}`);
      }
      const config = loadOpenWikiConfig();
      const value = config[key];
      if (json) console.log(JSON.stringify({ ok: true, key, value }));
      else console.log(value);
      return;
    }

    if (verb === 'set') {
      const key = cleanArgs[1];
      const value = cleanArgs[2];
      if (!key || value === undefined) {
        throw new Error('Key and value required: openwiki config set <key> <value>');
      }
      const updated = setOpenWikiConfigValue(key, value);
      const payload = { ok: true, key, value: updated[key], config: updated };
      if (json) console.log(JSON.stringify(payload, null, 2));
      else console.log(`OpenWiki configuration updated: ${key} = ${updated[key]}`);
      return;
    }

    if (verb === 'reset') {
      const reset = resetOpenWikiConfig();
      const payload = { ok: true, message: 'Configuration reset to defaults', config: reset };
      if (json) console.log(JSON.stringify(payload, null, 2));
      else console.log('OpenWiki configuration reset to defaults');
      return;
    }

    throw new Error(`Unknown config action '${verb}'. Supported verbs: show, get, set, reset`);
  } catch (err) {
    if (json) console.log(JSON.stringify({ ok: false, error: err.message }));
    else console.error(`OpenWiki config error: ${err.message}`);
    process.exitCode = 1;
  }
}

async function autoRefreshCommand(args = []) {
  const hasApply = args.includes('--apply');
  const forwardArgs = hasApply ? args : ['--apply', ...args];
  return refreshCommand(forwardArgs);
}

const IMPLEMENTED = {};
IMPLEMENTED.context = async args => {
  if (args.includes('--help') || args.includes('-h')) { console.log('Usage: total-recall openwiki context <task> [--json]'); return; }
  try {
    if (args.some(arg => arg.startsWith('--') && arg !== '--json')) throw new Error('context accepts a task and --json');
    const task = args.filter(arg => arg !== '--json').join(' ').trim();
    if (!task) throw new Error('context requires a task');
    const result = await retrieveContext({ task });
    console.log(args.includes('--json') ? JSON.stringify({ ok: true, ...result }) : result.candidates.map(row => `${row.source.path}:${row.source.startLine}-${row.source.endLine}\n${row.text}`).join('\n\n'));
  } catch (error) { console.log(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1; }
};
IMPLEMENTED.probe = probeCommand;
IMPLEMENTED.hubs = hubsCommand;
IMPLEMENTED.ingest = ingestCommand;
IMPLEMENTED.bootstrap = runBootstrapCommand;
IMPLEMENTED.refresh = refreshCommand;
IMPLEMENTED['auto-refresh'] = autoRefreshCommand;
IMPLEMENTED.autorefresh = autoRefreshCommand;
IMPLEMENTED.watch = watchCommand;
IMPLEMENTED.propagate = propagateCommand;
IMPLEMENTED.config = configCommand;
IMPLEMENTED.search = searchCommand;
IMPLEMENTED.graph = graphCommand;
IMPLEMENTED.token = tokenCommand;
IMPLEMENTED.lint = lintCommand;
IMPLEMENTED.generate = generateCommand;

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
      generatorVersion: bundledGeneratorVersion(),
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
      console.log(`Bundled generator: ${status.generatorVersion || 'unavailable'}`);
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
    hubs [--all-vaults] [--node <node>] [--json]
                              List indexed documentation hubs across workspace, all vaults, or mesh
    search <query> [--all-vaults] [--node <node>] [--limit <n>] [--json]
                              Evidence passage search across knowledge hubs and vaults
    context <task> [--json]    Task evidence with useful linked vicinity, provenance and freshness
    graph [--all-vaults] [--node <node>] [--format json|mermaid|dot] [--json]
                              Extract knowledge graph topology, nodes, and inter-hub links
    generate [--repo <name>] [--force] [--dry-run] [--node <node>] [--json]
                              Targeted on-demand documentation generation
    token [status|set <provider> --stdin] [--json]
                              Check or securely configure Total Recall secrets store keys
    lint [--all-vaults] [--node <node>] [--json]
                              Validate link integrity, dead targets, and orphaned hubs
    ingest <path> [options]   Ingest Markdown files into knowledge graph
    bootstrap --brain <path> [--project-root <path>] [--dry-run] [--json]
                              Create missing plugin-owned documentation pages
    refresh [--repo <name>] [--apply] [--force] [--json]
                              Report which registered projects' generated pages are stale;
                              --apply regenerates stale pages (writes openwiki/ only)
    auto-refresh [--repo <name>] [--force] [--json]
                              Automated daemon trigger to regenerate stale pages across repositories
    config [show|get <key>|set <key> <value>|reset] [--json]
                              Configure generator provider, model, tokens, and timeout
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
