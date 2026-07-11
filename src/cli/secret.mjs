/**
 * total-recall secret — manage API keys and credentials (not in the memory vault).
 *
 * Usage:
 *   npx total-recall secret set <key> <value> [--provider name] [--scope global|project]
 *   npx total-recall secret get <key>          # prints value (use carefully)
 *   npx total-recall secret list
 *   npx total-recall secret rotate <key> <new-value>
 *   npx total-recall secret delete <key>
 *   npx total-recall secret audit [--limit N]
 *   npx total-recall secret usage [--days N]
 *   npx total-recall secret usage-record --provider x --cost 0.01
 */

import {
  setSecret,
  getSecret,
  listSecretsMeta,
  rotateSecret,
  deleteSecret,
  readSecretAudit,
  recordUsage,
  summarizeUsage,
  summarizeUsageByKey,
  loadBudgetConfig,
  resolveSecretsPath,
  textContainsSecrets,
  getSecretsCatalog,
  updateSecretMeta,
  listRotationDue,
} from '../core/secrets-store.mjs';
import {
  scanEnvSources,
  publicScanResult,
  importEnvSecrets,
  parseEnvText,
  inferProvider,
} from '../core/env-import.mjs';
import {
  exportEnvToProject,
  exportEnvToRegistry,
  buildEnvProjection,
  buildDeploySecretsPayload,
} from '../core/secrets-env-export.mjs';
import {
  rotateSecretAndExport,
  enqueueRotationDueTasks,
  getBrowserRotateAssist,
} from '../core/secrets-rotate.mjs';
import { listProviders, getProvider } from '../core/provider-catalog.mjs';
import { resolveBrainDir, parseLayerFlag } from './agent-dir.mjs';
import fs from 'node:fs';
import path from 'node:path';

function printHelp() {
  console.log(`
  total-recall secret — Secrets store (separate from memory vault)

  Usage: total-recall secret <command> [options]

  Commands:
    set <key> <value>     Store a secret (0600 file; optional AES via TR_SECRETS_PASSWORD)
    get <key>             Print secret value (audited)
    list                  List keys + metadata only (no values)
    rotate <key> <value>  Replace value and mark rotated
    delete <key>          Remove a secret
    audit [--limit N]     Recent set/get/rotate events (no values)
    usage [--days N]      Sum usage.jsonl for last N days (default 1)
    usage-record          Append a usage event (see flags)
    check-surfaces        Fail if any secret value appears in INSTRUCTIONS.md / openwiki
    export-env            Write .env FROM secrets store (SSOT → repo/deploy projection)
      --path <dir>        Target repo root (default: cwd)
      --all-projects      Export to every project-registry path
      --filename .env     Output name (default .env)
      --no-example        Skip .env.example
      --no-global         Only keys bound to this repo (skip unbound)
      --replace-all       Overwrite entire .env (default: merge TR block only)
      --dry-run           Show keys that would be written
    import-env            One-time migrate: scan local .env → store (not the steady-state path)
      --all / --file / --overwrite / --dry-run
    catalog               Full catalog: keys, providers, usage, rotation, cost
    providers             List provider registry (docs/schema/tiers)
    meta <key>            Update metadata (no value change)
      --repo <name>       Bind to exactly ONE product repo (not multi)
      --repos <name>      Same as --repo (single name only; multi rejected)
      --tier <id>         Subscription tier
      --monthly-cost <n>  Planned monthly $ 
      --monthly-cap <n>   Cap $
      --docs <url>        API docs URL
      --rotate-days <n>   Auto-rotation interval
      --auto-rotate       Enable auto-rotate flag
      --notes <text>
      --label <text>
      --project <path>
    rotation-due          List keys overdue for rotation
      --enqueue           Create daemon tasks + browser-use prompts for each due key
    rotate-browser <key>  Print supervised browser-use rotation instructions
    usage                 Cost/events (add --key-ref for per-key)

  rotate options:
    --export-env          After rotate, write .env to bound repos (and cwd if unbound)
    --export-all          After rotate, export-env to all project-registry paths

  set / rotate options:
    --provider <name>     Optional provider tag (e.g. openai, anthropic)
    --scope global|project
    --repo / --repos      Bind secret to repo(s)
    --tier / --monthly-cost / --rotate-days

  usage-record options:
    --provider <name>
    --model <id>
    --input-tokens <n>
    --output-tokens <n>
    --cost <usd>
    --key-ref <secret-name>   name only, never the value

  Env:
    TR_SECRETS_PASSWORD   If set, encrypt secrets.enc with AES-256-GCM

  Never put secrets in remember/vault/openwiki/instruction shims.
`);
}

function parseArgs(args) {
  const out = {
    command: null,
    key: null,
    value: null,
    provider: null,
    scope: 'global',
    limit: 50,
    days: 1,
    model: null,
    input_tokens: 0,
    output_tokens: 0,
    cost: null,
    key_ref: null,
    help: false,
    all: false,
    dryRun: false,
    overwrite: false,
    file: null,
    keys: [],
    repos: [],
    tier: null,
    monthly_cost: null,
    monthly_cap: null,
    docs: null,
    rotate_days: null,
    auto_rotate: false,
    notes: null,
    label: null,
    project: null,
    path: null,
    allProjects: false,
    filename: '.env',
    noExample: false,
    noGlobal: false,
    replaceAll: false,
    exportEnv: false,
    exportAll: false,
    enqueue: false,
  };
  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    out.help = true;
    return out;
  }
  out.command = args[0];
  let i = 1;
  if (
    ['set', 'get', 'rotate', 'delete', 'meta', 'rotate-browser', 'rm'].includes(out.command) &&
    args[i] &&
    !args[i].startsWith('--')
  ) {
    out.key = args[i++];
  }
  if (['set', 'rotate'].includes(out.command) && args[i] && !args[i].startsWith('--')) {
    out.value = args[i++];
  }
  while (i < args.length) {
    const a = args[i];
    switch (a) {
      case '--provider':
        out.provider = args[++i];
        break;
      case '--scope':
        out.scope = args[++i];
        break;
      case '--limit':
        out.limit = parseInt(args[++i], 10) || 50;
        break;
      case '--days':
        out.days = parseInt(args[++i], 10) || 1;
        break;
      case '--model':
        out.model = args[++i];
        break;
      case '--input-tokens':
        out.input_tokens = parseInt(args[++i], 10) || 0;
        break;
      case '--output-tokens':
        out.output_tokens = parseInt(args[++i], 10) || 0;
        break;
      case '--cost':
        out.cost = parseFloat(args[++i]);
        break;
      case '--key-ref':
        out.key_ref = args[++i];
        break;
      case '--all':
        out.all = true;
        break;
      case '--dry-run':
        out.dryRun = true;
        break;
      case '--overwrite':
        out.overwrite = true;
        break;
      case '--file':
        out.file = args[++i];
        break;
      case '--repo':
        out.repos.push(args[++i]);
        break;
      case '--repos':
        out.repos.push(
          ...String(args[++i] || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        );
        break;
      case '--tier':
        out.tier = args[++i];
        break;
      case '--monthly-cost':
        out.monthly_cost = parseFloat(args[++i]);
        break;
      case '--monthly-cap':
        out.monthly_cap = parseFloat(args[++i]);
        break;
      case '--docs':
        out.docs = args[++i];
        break;
      case '--rotate-days':
        out.rotate_days = parseInt(args[++i], 10);
        break;
      case '--auto-rotate':
        out.auto_rotate = true;
        break;
      case '--notes':
        out.notes = args[++i];
        break;
      case '--label':
        out.label = args[++i];
        break;
      case '--project':
        out.project = args[++i];
        break;
      case '--path':
        out.path = args[++i];
        break;
      case '--all-projects':
        out.allProjects = true;
        break;
      case '--filename':
        out.filename = args[++i] || '.env';
        break;
      case '--no-example':
        out.noExample = true;
        break;
      case '--no-global':
        out.noGlobal = true;
        break;
      case '--replace-all':
        out.replaceAll = true;
        break;
      case '--export-env':
        out.exportEnv = true;
        break;
      case '--export-all':
        out.exportAll = true;
        out.exportEnv = true;
        break;
      case '--enqueue':
        out.enqueue = true;
        break;
      case '--help':
      case '-h':
        out.help = true;
        break;
      default:
        if (!a.startsWith('--') && out.command === 'import-env') {
          out.keys.push(a);
        } else if (!a.startsWith('--') && !out.key) out.key = a;
        else if (!a.startsWith('--') && !out.value) out.value = a;
    }
    i++;
  }
  return out;
}

export default async function secretCli(argv) {
  const { layer, remainingArgs } = parseLayerFlag(argv);
  const opts = parseArgs(remainingArgs);
  if (opts.help || !opts.command) {
    printHelp();
    return;
  }

  let brainDir;
  try {
    brainDir = resolveBrainDir(layer);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  try {
    if (opts.command === 'set') {
      if (!opts.key || opts.value == null) {
        console.error('Usage: total-recall secret set <key> <value>');
        process.exit(1);
      }
      await setSecret(brainDir, opts.key, opts.value, {
        provider: opts.provider || inferProvider(opts.key),
        scope: opts.scope,
        repos: opts.repos.length ? opts.repos : undefined,
        subscription_tier: opts.tier,
        monthly_cost_usd: opts.monthly_cost,
        monthly_cap_usd: opts.monthly_cap,
        api_docs_url: opts.docs,
        rotate_every_days: opts.rotate_days,
        auto_rotate: opts.auto_rotate,
        notes: opts.notes,
        label: opts.label,
        project_path: opts.project,
      });
      console.log(`\n  ✅ Secret set: ${opts.key}`);
      console.log(`     store: ${resolveSecretsPath(brainDir)}`);
      console.log(`     (value not printed)\n`);
      return;
    }

    if (opts.command === 'catalog') {
      const cat = await getSecretsCatalog(brainDir);
      console.log(`\n  📦 Secrets catalog — ${cat.store}`);
      console.log(
        `     keys=${cat.summary.total_keys}  providers=${cat.summary.providers_active}  planned/mo=$${cat.summary.monthly_subscription_usd.toFixed(2)}  usage30d=$${cat.summary.usage_30d.cost_usd.toFixed(4)}  rotate_due=${cat.summary.rotation_overdue}\n`,
      );

      // Group: multi-repo errors → one section per product repo → Developer secrets
      const byRepo = new Map();
      const developer = [];
      const multiError = [];
      for (const k of cat.keys) {
        const repos = Array.isArray(k.repos) ? k.repos.filter(Boolean) : [];
        if (repos.length > 1 || k.multi_repo_error) {
          multiError.push(k);
          continue;
        }
        if (!repos.length) {
          developer.push(k);
          continue;
        }
        const r = repos[0];
        if (!byRepo.has(r)) byRepo.set(r, []);
        byRepo.get(r).push(k);
      }
      const sections = [];
      if (multiError.length) sections.push(['⚠️ NEEDS FIX — multi-repo (one key → one repo only)', multiError]);
      for (const [repo, list] of [...byRepo.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        sections.push([repo, list]);
      }
      if (developer.length) sections.push(['Developer secrets (tooling / unbound)', developer]);

      if (multiError.length) {
        console.log(
          `  ❌ ${multiError.length} key(s) bound to multiple repos — fix with:\n` +
            `     secret meta <KEY> --repo <one-repo>\n` +
            `     or clear repos for Developer secrets\n`,
        );
      }

      for (const [repo, list] of sections) {
        console.log(`  ── ${repo}  (${list.length})`);
        for (const k of list.sort((a, b) => a.key.localeCompare(b.key))) {
          const due = k.rotation_overdue
            ? '⚠️ ROTATE'
            : k.next_rotate_due
              ? `due ${k.next_rotate_due.slice(0, 10)}`
              : '';
          const multi =
            k.multi_repo_error || (k.repos?.length > 1)
              ? ` ❌ multi=[${(k.repos || []).join(',')}]`
              : '';
          console.log(
            `    • ${k.key.padEnd(28)} ${(k.provider || '-').padEnd(12)} tier=${(k.subscription_tier || '-').padEnd(8)} $${String(k.monthly_cost_usd ?? '-').padStart(6)}  u30=$${k.usage_30d.cost_usd.toFixed(3)}  ${due}${multi}`,
          );
          if (k.api_docs_url) console.log(`        docs: ${k.api_docs_url}`);
        }
        console.log('');
      }
      return;
    }

    if (opts.command === 'providers') {
      console.log('\n  Provider registry\n');
      for (const p of listProviders()) {
        console.log(`  • ${p.id.padEnd(14)} ${p.name}`);
        console.log(`      docs: ${p.docs_url}`);
        if (p.pricing_url) console.log(`      pricing: ${p.pricing_url}`);
        console.log(`      keys: ${p.key_patterns.join(', ')}`);
        console.log(`      auth: ${p.schema.auth}  ${p.schema.header || ''}`);
        if (p.tiers?.length) {
          console.log(`      tiers: ${p.tiers.map((t) => t.id).join(', ')}`);
        }
        console.log('');
      }
      return;
    }

    if (opts.command === 'meta') {
      if (!opts.key) {
        console.error('Usage: total-recall secret meta <key> [--repo ...] [--tier ...]');
        process.exit(1);
      }
      const patch = {};
      if (opts.repos.length) patch.repos = opts.repos;
      if (opts.tier != null) patch.subscription_tier = opts.tier;
      if (opts.monthly_cost != null) patch.monthly_cost_usd = opts.monthly_cost;
      if (opts.monthly_cap != null) patch.monthly_cap_usd = opts.monthly_cap;
      if (opts.docs) patch.api_docs_url = opts.docs;
      if (opts.rotate_days != null) patch.rotate_every_days = opts.rotate_days;
      if (opts.auto_rotate) patch.auto_rotate = true;
      if (opts.notes) patch.notes = opts.notes;
      if (opts.label) patch.label = opts.label;
      if (opts.project) patch.project_path = opts.project;
      if (opts.provider) patch.provider = opts.provider;
      if (opts.scope) patch.scope = opts.scope;
      // Fill docs from catalog if provider set and no docs
      if (patch.provider && !patch.api_docs_url) {
        const p = getProvider(patch.provider);
        if (p) {
          patch.api_docs_url = p.docs_url;
          if (patch.monthly_cap_usd == null) patch.monthly_cap_usd = p.default_monthly_cap_usd;
        }
      }
      const row = await updateSecretMeta(brainDir, opts.key, patch, { actor: 'cli' });
      console.log(`\n  ✅ Meta updated: ${opts.key}`);
      console.log(`     provider=${row.provider} tier=${row.subscription_tier} repos=${(row.repos || []).join(',') || '-'}`);
      console.log(`     monthly_cost=$${row.monthly_cost_usd ?? '-'} cap=$${row.monthly_cap_usd ?? '-'}`);
      console.log(`     docs=${row.api_docs_url || '-'}`);
      console.log(`     rotate_every=${row.rotate_every_days || '-'}d next=${row.next_rotate_due || '-'}\n`);
      return;
    }

    if (opts.command === 'rotation-due') {
      const due = await listRotationDue(brainDir, { autoOnly: false });
      if (!due.length) {
        console.log('\n  No secrets overdue for rotation.\n');
        return;
      }
      console.log(`\n  ⚠️  ${due.length} secret(s) overdue for rotation\n`);
      for (const k of due) {
        console.log(
          `  • ${k.key}  provider=${k.provider || '-'}  due=${k.next_rotate_due}  auto=${k.auto_rotate ? 'yes' : 'no'}`,
        );
      }
      if (opts.enqueue) {
        const r = await enqueueRotationDueTasks(brainDir, { autoOnly: false });
        console.log(`\n  📋 Enqueued ${r.tasks.filter((t) => t.status === 'created').length} rotation assist task(s)`);
      }
      console.log('\n  Rotate:        npx total-recall secret rotate <key> <new> --export-env');
      console.log('  Browser assist: npx total-recall secret rotate-browser <key>');
      console.log('  Enqueue tasks:  npx total-recall secret rotation-due --enqueue\n');
      return;
    }

    if (opts.command === 'get') {
      if (!opts.key) {
        console.error('Usage: total-recall secret get <key>');
        process.exit(1);
      }
      const r = await getSecret(brainDir, opts.key);
      if (!r.found) {
        console.error(`  Secret not found: ${opts.key}`);
        process.exit(1);
      }
      // Print value only — user explicitly asked
      console.log(r.value);
      return;
    }

    if (opts.command === 'list') {
      const rows = await listSecretsMeta(brainDir);
      if (!rows.length) {
        console.log(`\n  No secrets in ${resolveSecretsPath(brainDir)}\n`);
        return;
      }
      console.log(`\n  Secrets metadata — ${resolveSecretsPath(brainDir)}\n`);
      for (const r of rows) {
        const repos = r.repos?.length ? r.repos.join(',') : '-';
        console.log(
          `  • ${r.key.padEnd(28)} len=${String(r.length).padStart(4)}  ${(r.provider || '-').padEnd(12)} tier=${r.subscription_tier || '-'}  $${r.monthly_cost_usd ?? '-'}  repos=${repos}`,
        );
        if (r.api_docs_url) console.log(`      docs: ${r.api_docs_url}`);
      }
      console.log('');
      return;
    }

    if (opts.command === 'rotate') {
      if (!opts.key || !opts.value) {
        console.error('Usage: total-recall secret rotate <key> <new-value> [--export-env|--export-all]');
        process.exit(1);
      }
      if (opts.exportEnv || opts.exportAll) {
        const r = await rotateSecretAndExport(brainDir, opts.key, opts.value, {
          provider: opts.provider,
          actor: 'cli',
          exportEnv: true,
          exportAllProjects: opts.exportAll,
          exportCwd: true,
          includeGlobal: true,
        });
        console.log(`  ✅ Rotated: ${opts.key}`);
        if (r.next_rotate_due) console.log(`     next due: ${r.next_rotate_due}`);
        const ok = (r.exports || []).filter((e) => e.ok !== false);
        console.log(`     export-env: ${ok.length} target(s)`);
        for (const e of ok) {
          if (e.envPath) console.log(`       → ${e.envPath} (${e.count} keys)`);
        }
        return;
      }
      await rotateSecret(brainDir, opts.key, opts.value, {
        provider: opts.provider,
        scope: opts.scope,
      });
      console.log(`  ✅ Rotated: ${opts.key}`);
      console.log(`     tip: add --export-env to push .env projections after rotate`);
      return;
    }

    if (opts.command === 'rotate-browser') {
      if (!opts.key) {
        console.error('Usage: total-recall secret rotate-browser <key>');
        process.exit(1);
      }
      const assist = await getBrowserRotateAssist(brainDir, opts.key);
      console.log(`\n  🌐 Supervised browser rotation — ${assist.key}\n`);
      if (assist.console_url) console.log(`  Console: ${assist.console_url}`);
      if (assist.docs_url) console.log(`  Docs:    ${assist.docs_url}`);
      console.log(`  Overdue: ${assist.overdue ? 'YES' : 'no'}`);
      console.log('\n' + assist.prompt + '\n');
      return;
    }

    if (opts.command === 'delete' || opts.command === 'rm') {
      if (!opts.key) {
        console.error('Usage: total-recall secret delete <key>');
        process.exit(1);
      }
      const r = await deleteSecret(brainDir, opts.key);
      if (!r.found) {
        console.error(`  Secret not found: ${opts.key}`);
        process.exit(1);
      }
      console.log(`  ✅ Deleted: ${opts.key}`);
      return;
    }

    if (opts.command === 'audit') {
      const events = readSecretAudit(brainDir, { limit: opts.limit });
      if (!events.length) {
        console.log('\n  No secret audit events yet.\n');
        return;
      }
      console.log(`\n  Secret audit (last ${events.length})\n`);
      for (const e of events) {
        console.log(`  ${e.ts}  ${e.action.padEnd(8)}  ${e.key}  ${e.actor || ''}`);
      }
      console.log('');
      return;
    }

    if (opts.command === 'usage') {
      const day = summarizeUsage(brainDir, { days: opts.days });
      const week = summarizeUsage(brainDir, { days: 7 });
      const month = summarizeUsage(brainDir, { days: 30 });
      const by = summarizeUsageByKey(brainDir, { days: 30 });
      const budget = loadBudgetConfig(brainDir);
      console.log(`\n  Usage summary`);
      console.log(`    last ${opts.days}d: events=${day.events} cost=$${day.cost_usd.toFixed(4)} tokens_in=${day.input_tokens} tokens_out=${day.output_tokens}`);
      console.log(`    last 7d:  events=${week.events} cost=$${week.cost_usd.toFixed(4)}`);
      console.log(`    last 30d: events=${month.events} cost=$${month.cost_usd.toFixed(4)}`);
      const dailyCap = budget.config.daily_cap_usd ?? budget.config.dailyCapUsd;
      const weeklyCap = budget.config.weekly_cap_usd ?? budget.config.weeklyCapUsd;
      if (dailyCap != null) {
        console.log(`    budget daily_cap_usd=${dailyCap}  ${day.cost_usd > dailyCap ? '⚠️ OVER' : 'ok'}`);
      }
      if (weeklyCap != null) {
        console.log(`    budget weekly_cap_usd=${weeklyCap}  ${week.cost_usd > weeklyCap ? '⚠️ OVER' : 'ok'}`);
      }
      if (budget.path) console.log(`    budget file: ${budget.path}`);
      const keyEntries = Object.entries(by.by_key).filter(([k]) => k !== '_unattributed');
      if (keyEntries.length) {
        console.log(`\n  By key_ref (30d)`);
        for (const [k, v] of keyEntries.sort((a, b) => b[1].cost_usd - a[1].cost_usd)) {
          console.log(`    ${k.padEnd(28)} events=${v.events}  cost=$${v.cost_usd.toFixed(4)}`);
        }
      }
      const provEntries = Object.entries(by.by_provider);
      if (provEntries.length) {
        console.log(`\n  By provider (30d)`);
        for (const [p, v] of provEntries.sort((a, b) => b[1].cost_usd - a[1].cost_usd)) {
          console.log(`    ${p.padEnd(16)} events=${v.events}  cost=$${v.cost_usd.toFixed(4)}`);
        }
      }
      console.log('');
      return;
    }

    if (opts.command === 'usage-record') {
      const row = recordUsage(brainDir, {
        provider: opts.provider || 'unknown',
        model: opts.model,
        input_tokens: opts.input_tokens,
        output_tokens: opts.output_tokens,
        cost_usd: opts.cost,
        key_ref: opts.key_ref,
        source: 'cli',
      });
      console.log(`  ✅ Usage recorded: ${JSON.stringify(row)}`);
      return;
    }

    if (opts.command === 'export-env' || opts.command === 'sync-env' || opts.command === 'apply-env') {
      const exportOpts = {
        filename: opts.filename || '.env',
        example: !opts.noExample,
        dryRun: opts.dryRun,
        includeGlobal: !opts.noGlobal,
        replaceAll: !!opts.replaceAll,
        keys: opts.keys.length ? opts.keys : undefined,
      };

      if (opts.allProjects) {
        const results = await exportEnvToRegistry(brainDir, exportOpts);
        console.log(`\n  📤 export-env → ${results.length} project(s) from ${resolveSecretsPath(brainDir)}\n`);
        for (const r of results) {
          if (!r.ok) {
            console.log(`  ✗ ${r.name || r.path}: ${r.error}`);
          } else if (r.dryRun) {
            console.log(`  · ${r.name || r.projectSlug}: would write ${r.count} keys → ${r.envPath}`);
          } else {
            console.log(`  ✓ ${r.name || r.projectSlug}: ${r.count} keys → ${r.envPath}`);
          }
        }
        console.log('');
        return;
      }

      const targetPath = opts.path || opts.project || process.cwd();
      const result = await exportEnvToProject(brainDir, targetPath, exportOpts);
      if (result.dryRun) {
        console.log(`\n  📤 dry-run export-env`);
        console.log(`     store: ${result.store}`);
        console.log(`     would write ${result.count} keys → ${result.envPath}`);
        if (result.keys.length) {
          for (const k of result.keys) console.log(`       • ${k}`);
        }
        console.log('');
        return;
      }
      console.log(`\n  ✅ Exported ${result.count} secret(s) → ${result.envPath}`);
      if (result.examplePath) console.log(`     example: ${result.examplePath}`);
      console.log(`     store:  ${result.store}`);
      console.log(`     (values written with mode 0600; not printed)\n`);
      return;
    }

    if (opts.command === 'import-env') {
      const existing = await listSecretsMeta(brainDir);
      const existingSet = new Set(existing.map((e) => e.key));
      let scan = scanEnvSources({ brainDir, includeProcessEnv: true, cwd: process.cwd() });

      if (opts.file) {
        if (!fs.existsSync(opts.file)) {
          console.error(`  File not found: ${opts.file}`);
          process.exit(1);
        }
        const text = fs.readFileSync(opts.file, 'utf8');
        const map = parseEnvText(text);
        // merge file into scan candidates via import pairs path
        const pub = publicScanResult(scan, existingSet);
        console.log(`\n  🔍 Env scan (${pub.count} candidates)\n`);
        for (const c of pub.candidates) {
          console.log(
            `  ${c.already_set ? '·' : '+'} ${c.key.padEnd(32)} ${c.masked.padEnd(28)}  ${c.source_label}`,
          );
        }
        if (Object.keys(map).length) {
          console.log(`\n  Also loading --file ${opts.file} (${Object.keys(map).length} vars)`);
        }
        if (opts.dryRun) {
          console.log('\n  Dry-run — nothing written.\n');
          return;
        }
        const keys = opts.keys.length
          ? opts.keys
          : opts.all
            ? undefined
            : pub.candidates.filter((c) => !c.already_set).map((c) => c.key);
        const result = await importEnvSecrets(brainDir, {
          pairs: map,
          keys: opts.keys.length ? opts.keys : undefined,
          all: opts.all || (!opts.keys.length && !Object.keys(map).length),
          overwrite: opts.overwrite,
          actor: 'cli-import-env',
        });
        // If --file provided, also import matching keys from file pairs
        if (Object.keys(map).length) {
          const fileResult = await importEnvSecrets(brainDir, {
            pairs: map,
            keys: opts.keys.length ? opts.keys : Object.keys(map),
            overwrite: opts.overwrite,
            actor: 'cli-import-env',
          });
          console.log(
            `\n  ✅ Imported ${fileResult.imported_count} from file, skipped ${fileResult.skipped_count}\n`,
          );
          return;
        }
        console.log(
          `\n  ✅ Imported ${result.imported_count}, skipped ${result.skipped_count}, errors ${result.errors.length}\n`,
        );
        return;
      }

      const pub = publicScanResult(scan, existingSet);
      console.log(`\n  🔍 Env scan — ${pub.count} candidate secrets\n`);
      for (const c of pub.candidates) {
        const mark = c.already_set ? '·' : '+';
        console.log(
          `  ${mark} ${c.key.padEnd(32)} ${c.masked.padEnd(28)}  ${c.provider || ''}  ${c.source_label}`,
        );
      }
      if (!pub.count) {
        console.log('  No known API keys found in process.env or common .env paths.\n');
        return;
      }
      if (opts.dryRun || (!opts.all && !opts.keys.length)) {
        console.log(
          '\n  Dry-run / preview. Import with:\n    npx total-recall secret import-env --all\n    npx total-recall secret import-env OPENAI_API_KEY ANTHROPIC_API_KEY\n',
        );
        return;
      }
      const result = await importEnvSecrets(brainDir, {
        keys: opts.keys.length ? opts.keys : undefined,
        all: opts.all || !opts.keys.length,
        overwrite: opts.overwrite,
        actor: 'cli-import-env',
      });
      console.log(`\n  ✅ Imported ${result.imported_count}`);
      if (result.skipped_count) console.log(`     skipped (already set): ${result.skipped_count}`);
      for (const e of result.errors) console.error(`     error ${e.key}: ${e.error}`);
      console.log(`     store: ${resolveSecretsPath(brainDir)}\n`);
      return;
    }

    if (opts.command === 'check-surfaces') {
      const texts = [];
      const candidates = [
        path.join(brainDir, 'INSTRUCTIONS.md'),
        path.join(process.cwd(), 'INSTRUCTIONS.md'),
        path.join(brainDir, 'openwiki'),
      ];
      for (const c of candidates) {
        if (!fs.existsSync(c)) continue;
        if (fs.statSync(c).isDirectory()) {
          for (const f of fs.readdirSync(c)) {
            if (f.endsWith('.md')) {
              texts.push({ file: path.join(c, f), body: fs.readFileSync(path.join(c, f), 'utf8') });
            }
          }
        } else {
          texts.push({ file: c, body: fs.readFileSync(c, 'utf8') });
        }
      }
      let bad = false;
      for (const t of texts) {
        const r = await textContainsSecrets(brainDir, t.body);
        if (r.leak) {
          bad = true;
          console.error(`  ❌ LEAK in ${t.file}: keys ${r.keys.join(', ')}`);
        }
      }
      if (bad) process.exit(1);
      console.log(`  ✅ No secret values found in ${texts.length} surface/openwiki file(s)`);
      return;
    }

    console.error(`Unknown secret command: ${opts.command}`);
    printHelp();
    process.exit(1);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}
