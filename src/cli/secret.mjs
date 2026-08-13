/**
 * total-recall secret — manage API keys and credentials (not in the memory vault).
 *
 * Usage:
 *   npx total-recall secret set <key> <value> [--provider name] [--scope global|project]
 *   npx total-recall secret get <key>          # prints value (use carefully)
 *   npx total-recall secret list
 *   npx total-recall secret rotate <key>       # prompts for the value
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
  getSharedValueHealth,
  loadSecrets,
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
import {
  loadRemoteTargets,
  addRemoteTarget,
  removeRemoteTarget,
  deployEnvToRemote,
  deployKeyToRemotes,
} from '../core/secrets-remote-deploy.mjs';
import { listProviders, getProvider } from '../core/provider-catalog.mjs';
import { resolveBrainDir, parseLayerFlag } from './agent-dir.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Reads a secret value from stdin (fd 0) so it never has to appear as a CLI
// argument — CLI args land in shell history, `ps aux`, and any transcript
// that echoes the command. Trims exactly one trailing newline (what a
// pasted/piped value normally carries), not all whitespace, so a value that
// legitimately starts or ends with a space round-trips intact.
function readStdinValue() {
  const raw = fs.readFileSync(0, 'utf8');
  return raw.endsWith('\n') ? raw.slice(0, -1) : raw;
}

/**
 * Read the OS clipboard. Keeps a pasted credential inside this process rather
 * than routing it through argv, shell history, or an agent transcript.
 *
 * @returns {string}
 */
function readSystemClipboard() {
  const cmds =
    process.platform === 'darwin'
      ? [['pbpaste', []]]
      : process.platform === 'win32'
        ? [['powershell', ['-NoProfile', '-Command', 'Get-Clipboard']]]
        : [
            ['wl-paste', ['--no-newline']],
            ['xclip', ['-selection', 'clipboard', '-o']],
            ['xsel', ['--clipboard', '--output']],
          ];
  for (const [cmd, args] of cmds) {
    try {
      return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      // try the next clipboard tool
    }
  }
  return '';
}

/**
 * Read a credential without echoing it and without it ever becoming an argv
 * element. `argv` is world-readable via `ps`, lands in shell history, and is
 * captured verbatim by any agent driving this CLI. Falls back to reading one
 * line from stdin when the input is piped rather than a terminal.
 *
 * @param {string} label
 * @returns {Promise<string>}
 */
function readSecretValue(label) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY) {
      resolve(readStdinValue());
      return;
    }
    process.stdout.write(label);
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    let buf = '';
    const onData = (ch) => {
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        input.setRawMode(false);
        input.pause();
        input.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(buf.trim());
      } else if (ch === '\u0003') {
        input.setRawMode(false);
        process.stdout.write('\n');
        process.exit(130);
      } else if (ch === '\u007f' || ch === '\b') {
        buf = buf.slice(0, -1);
      } else {
        buf += ch;
      }
    };
    input.on('data', onData);
  });
}

function printHelp() {
  console.log(`
  total-recall secret — Secrets store (separate from memory vault)

  Usage: total-recall secret <command> [options]

  Commands:
    set <key> [value]     Store a secret (0600 file; optional AES via TR_SECRETS_PASSWORD)
                           --stdin reads the value from fd0 instead of argv,
                           so it never lands in shell history/ps/a transcript
    generate <key>        Generate a random secret for outside integrations
    get <key>             Print secret value (audited)
    list                  List keys + metadata only (no values)
    rotate <key>          Replace value and mark rotated. Prompts for the value;
                           --stdin reads fd0, --from-clipboard reads the OS
                           clipboard (use the browser you are already signed
                           into). The value never appears in argv or output.
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
      --remote <name>     Also push the SSOT projection to a configured remote
                           target over SSH (see 'secret remote') instead of
                           (or in addition to) a local file
      --dry-run           Show keys that would be written
    remote <cmd>          Manage remote (production) deploy targets — generic,
                           per-repo config, no host/path ever hardcoded in TR
      add <name>           --host <h> --path </remote/dir> [--user root]
                            [--port 22] [--filename .env] [--restart-cmd "..."]
      list                 Show configured targets (no secret values)
      remove <name>        Delete a target
      deploy <name>        Push the SSOT projection to that target now
                            [--dry-run] [--keys k1,k2]
    import-env            One-time migrate: scan local .env → store (not the steady-state path)
      --all / --file / --overwrite / --dry-run
    catalog               Full catalog: keys, providers, usage, rotation, cost, tracking
    providers             List provider registry (docs/schema/tiers)
    account-sync [key]    Live-probe vendor account/usage/subscription APIs
      --all               Sync every set secret (default if no key)
      --strict            partial (no $ API) → ERROR (default)
      --no-strict         Allow partial status
      --use-ai            AI-classify unknown keys (slow)
      --exempt            Mark key tracking_exempt (with optional --monthly-cost)
    tracking-health       Fail (exit 1) if any set secret is untracked
    shared                List credential values reused across keys/apps (exit 1 if any)
      --shared-ok         Mark key as intentional share (waive) — use with meta
    meta <key>            Update metadata (no value change)
      --tracking-exempt   Waive live account API requirement
      --no-tracking-exempt
      --shared-ok         Allow this key to share its value with other secret names
      --no-shared-ok
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
    --headscale-url <https-url>
    rotation-due          List keys overdue for rotation
      --enqueue           Create daemon tasks + browser-use prompts for each due key
    rotate-browser <key>  Drive the provider console in TR's browser and rotate
      --print-only        Only print instructions (legacy behaviour)
      --headless          Allow headless for verified recipes
    rotate-auto <key>     Rotate by whatever method the key's class supports
    rotation-status       Rotation coverage for every key in the vault
      --json              Machine-readable output
    browser-logout        Delete TR's persistent browser profile (all sessions)
    usage                 Cost/events (add --key-ref for per-key)

  rotate options:
    --export-env          After rotate, write .env to bound repos (and cwd if unbound)
    --export-all          After rotate, export-env to all project-registry paths
    --remote <name>       After rotate, also push to a configured remote target
                           (production, etc.) over SSH — see 'secret remote'

  set / rotate options:
    --provider <name>     Optional provider tag (e.g. openai, anthropic)
    --scope global|project
    --repo / --repos      Bind secret to repo(s)
    --tier / --monthly-cost / --rotate-days
    --headscale-url <https-url>  Headscale control-plane URL metadata

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
    headscale_url: null,
    path: null,
    allProjects: false,
    filename: '.env',
    noExample: false,
    noGlobal: false,
    replaceAll: false,
    exportEnv: false,
    exportAll: false,
    enqueue: false,
    bytes: 32,
    format: 'base64url',
    strict: true,
    use_ai: false,
    exempt: false,
    tracking_exempt: null,
    shared_ok: null,
    subcommand: null,
    remote: null,
    remoteHost: null,
    remoteUser: 'root',
    remotePort: 22,
    restartCmd: null,
    stdin: false,
  };
  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    out.help = true;
    return out;
  }
  out.command = args[0];
  let i = 1;
  if (out.command === 'remote') {
    if (args[i] && !args[i].startsWith('--')) out.subcommand = args[i++];
    if (['add', 'remove', 'rm', 'deploy'].includes(out.subcommand) && args[i] && !args[i].startsWith('--')) {
      out.key = args[i++]; // reused as the remote target name
    }
  }
  if (
    [
      'set',
      'get',
      'rotate',
      'delete',
      'meta',
      'rotate-browser',
      'rotate-auto',
      'rm',
      'generate',
      'account-sync',
    ].includes(out.command) &&
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
      case '--remote':
        out.remote = args[++i];
        break;
      case '--host':
        out.remoteHost = args[++i];
        break;
      case '--user':
        out.remoteUser = args[++i] || 'root';
        break;
      case '--port':
        out.remotePort = parseInt(args[++i], 10) || 22;
        break;
      case '--restart-cmd':
        out.restartCmd = args[++i];
        break;
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
      case '--headscale-url':
        out.headscale_url = args[++i];
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
      case '--from-clipboard':
        out.fromClipboard = true;
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
      case '--print-only':
        out.printOnly = true;
        break;
      case '--headless':
        out.headless = true;
        break;
      case '--json':
        out.json = true;
        break;
      case '--bytes':
        out.bytes = parseInt(args[++i], 10) || 32;
        break;
      case '--format':
        out.format = args[++i] || 'base64url';
        break;
      case '--strict':
        out.strict = true;
        break;
      case '--no-strict':
        out.strict = false;
        break;
      case '--use-ai':
        out.use_ai = true;
        break;
      case '--exempt':
        out.exempt = true;
        break;
      case '--tracking-exempt':
        out.tracking_exempt = true;
        break;
      case '--no-tracking-exempt':
        out.tracking_exempt = false;
        break;
      case '--shared-ok':
        out.shared_ok = true;
        break;
      case '--no-shared-ok':
        out.shared_ok = false;
        break;
      case '--stdin':
        out.stdin = true;
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

  if (opts.stdin) {
    if (!['set', 'rotate'].includes(opts.command)) {
      console.error('❌ --stdin is only valid with `set` or `rotate`');
      process.exit(1);
    }
    if (!opts.key) {
      console.error(`Usage: total-recall secret ${opts.command} <key> --stdin`);
      process.exit(1);
    }
    opts.value = readStdinValue();
    if (!opts.value) {
      console.error('❌ --stdin read an empty value');
      process.exit(1);
    }
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
        headscale_url: opts.headscale_url,
      });
      console.log(`\n  ✅ Secret set: ${opts.key}`);
      console.log(`     store: ${resolveSecretsPath(brainDir)}`);
      console.log(`     (value not printed)\n`);
      return;
    }

    if (opts.command === 'generate') {
      if (!opts.key) {
        console.error('Usage: total-recall secret generate <key> [--bytes 32] [--format hex|base64|base64url]');
        process.exit(1);
      }
      const crypto = await import('node:crypto');
      const val = crypto.randomBytes(opts.bytes).toString(opts.format);
      await setSecret(brainDir, opts.key, val, {
        provider: opts.provider || inferProvider(opts.key),
        scope: opts.scope,
        repos: opts.repos.length ? opts.repos : undefined,
        project_path: opts.project,
        notes: opts.notes || 'Generated by CLI for outside integration',
      });
      console.log(`\n  ✅ Secret generated: ${opts.key}`);
      console.log(`     Value: ${val}`);
      console.log(`     store: ${resolveSecretsPath(brainDir)}\n`);
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

    if (opts.command === 'account-sync' || opts.command === 'sync-accounts') {
      const {
        syncSecretAccount,
        syncAllSecretAccounts,
        getTrackingHealth,
      } = await import('../core/provider-account-sync.mjs');
      const syncOpts = {
        strict: opts.strict !== false,
        use_ai: !!opts.use_ai,
        force_exempt: !!opts.exempt,
      };
      if (opts.key) {
        if (opts.exempt) {
          await updateSecretMeta(
            brainDir,
            opts.key,
            {
              tracking_exempt: true,
              monthly_cost_usd: opts.monthly_cost ?? undefined,
            },
            { actor: 'cli' },
          );
        }
        const r = await syncSecretAccount(brainDir, opts.key, syncOpts);
        const icon =
          r.tracking_status === 'ok' ? '✅' : r.tracking_status === 'exempt' ? '⏭' : '❌';
        console.log(`\n  ${icon} ${r.key}  status=${r.tracking_status}  provider=${r.provider || '-'}`);
        if (r.probe) console.log(`     probe: ${r.probe}`);
        if (r.error) console.log(`     error: ${r.error}`);
        if (r.account) console.log(`     account: ${JSON.stringify(r.account)}`);
        if (r.usage) console.log(`     usage: ${JSON.stringify(r.usage)}`);
        if (r.subscription) console.log(`     subscription: ${JSON.stringify(r.subscription)}`);
        console.log('');
        if (r.tracking_status === 'error') process.exit(1);
        return;
      }
      console.log('\n  🔄 Live provider account/usage sync (all set secrets)…\n');
      const report = await syncAllSecretAccounts(brainDir, syncOpts);
      console.log(`  total=${report.total}  ok/exempt=${report.ok}  errors=${report.errors}`);
      console.log(`  ${report.healthy ? '✅' : '❌'} ${report.message}`);
      if (report.error_keys?.length) {
        console.log('\n  Untracked / failed:');
        for (const e of report.error_keys.slice(0, 50)) {
          console.log(`    • ${e.key}: ${e.error}`);
        }
        if (report.error_keys.length > 50) {
          console.log(`    … and ${report.error_keys.length - 50} more`);
        }
      }
      const health = await getTrackingHealth(brainDir);
      console.log(
        `\n  tracking-health: healthy=${health.healthy} ok=${health.ok} exempt=${health.exempt} errors=${health.errors}\n`,
      );
      if (!report.healthy) process.exit(1);
      return;
    }

    if (opts.command === 'tracking-health' || opts.command === 'tracking') {
      const { getTrackingHealth } = await import('../core/provider-account-sync.mjs');
      const health = await getTrackingHealth(brainDir);
      console.log(`\n  ${health.healthy ? '✅' : '❌'} ${health.message}`);
      console.log(`     ok=${health.ok}  exempt=${health.exempt}  errors=${health.errors}`);
      if (health.error_keys?.length) {
        console.log('');
        for (const e of health.error_keys) {
          console.log(`    • ${e.key.padEnd(28)} ${(e.provider || '-').padEnd(14)} ${e.error}`);
        }
      }
      const shared = await getSharedValueHealth(brainDir);
      console.log(`\n  ${shared.healthy ? '✅' : '❌'} ${shared.message}`);
      if (shared.errors?.length) {
        for (const e of shared.errors) {
          console.log(`    • fp=${e.fingerprint} apps=[${e.apps.join(', ')}]`);
          console.log(`      keys: ${e.keys.join(', ')}`);
        }
      }
      console.log('');
      if (!health.healthy || !shared.healthy) process.exit(1);
      return;
    }

    if (opts.command === 'shared' || opts.command === 'shared-values' || opts.command === 'duplicates') {
      const shared = await getSharedValueHealth(brainDir);
      console.log(`\n  ${shared.healthy ? '✅' : '❌'} ${shared.message}`);
      console.log(
        `     groups=${shared.groups.length}  error_groups=${shared.error_groups}  multi_app=${shared.multi_app_groups}  keys_in_error=${shared.shared_keys}`,
      );
      if (shared.groups.length) {
        console.log('');
        for (const g of shared.groups) {
          const icon = g.severity === 'error' ? '❌' : '⏭';
          console.log(
            `  ${icon} fingerprint ${g.fingerprint}  ×${g.count}  apps=[${g.apps.join(', ')}]`,
          );
          for (const m of g.members) {
            console.log(
              `      • ${m.key.padEnd(36)} app=${String(m.app).padEnd(16)} provider=${m.provider || '-'}  ${m.masked || ''}`,
            );
          }
          if (g.error) console.log(`      → ${g.error}`);
          console.log(
            `      fix: rotate each key to a unique value, then: secret rotate <key> <new> --export-env`,
          );
          console.log(
            `      waive (rare): secret meta <key> --shared-ok   # only if intentional mirror`,
          );
          console.log('');
        }
      } else {
        console.log('\n  No shared credential values detected.\n');
      }
      if (!shared.healthy) process.exit(1);
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
      if (opts.tracking_exempt != null) {
        patch.tracking_exempt = opts.tracking_exempt;
        if (opts.tracking_exempt) patch.tracking_status = 'exempt';
      }
      if (opts.shared_ok != null) patch.shared_value_ok = opts.shared_ok;
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
        const tr = r.tracking_status || 'never';
        const trIcon = tr === 'ok' ? '✅' : tr === 'exempt' ? '⏭' : '❌';
        const share = r.shared_value ? ' 🔗SHARED' : '';
        console.log(
          `  • ${r.key.padEnd(28)} len=${String(r.length).padStart(4)}  ${(r.provider || '-').padEnd(12)} ${trIcon}${tr.padEnd(7)} tier=${r.subscription_tier || '-'}  $${r.monthly_cost_usd ?? '-'}  repos=${repos}${share}`,
        );
        if (r.api_docs_url) console.log(`      docs: ${r.api_docs_url}`);
        if (r.tracking_error && tr === 'error') console.log(`      tracking: ${r.tracking_error}`);
        if (r.shared_value_error) {
          console.log(`      shared: ${r.shared_value_error}`);
          if (r.shared_with?.length) {
            console.log(
              `      same value as: ${r.shared_with.map((s) => `${s.key}(${s.app})`).join(', ')}`,
            );
          }
        }
      }
      console.log('');
      return;
    }

    if (opts.command === 'remote') {
      if (!opts.subcommand) {
        console.error(
          'Usage: total-recall secret remote <add|list|remove|deploy> [...]\n' +
            '  add <name> --host <h> --path </remote/dir> [--user root] [--port 22] [--filename .env] [--restart-cmd "..."]\n' +
            '  list\n' +
            '  remove <name>\n' +
            '  deploy <name> [--dry-run] [--keys k1,k2]',
        );
        process.exit(1);
      }

      if (opts.subcommand === 'add') {
        if (!opts.key || !opts.remoteHost || !opts.path) {
          console.error(
            'Usage: total-recall secret remote add <name> --host <host> --path </remote/dir> [--user root] [--port 22] [--filename .env] [--restart-cmd "..."]',
          );
          process.exit(1);
        }
        const { path: targetsPath } = addRemoteTarget(brainDir, {
          name: opts.key,
          host: opts.remoteHost,
          user: opts.remoteUser,
          port: opts.remotePort,
          remotePath: opts.path,
          filename: opts.filename || '.env',
          restartCommand: opts.restartCmd || null,
          keys: opts.keys.length ? opts.keys : undefined,
        });
        console.log(`\n  ✅ Remote target added: ${opts.key}`);
        console.log(`     ${opts.remoteUser}@${opts.remoteHost}:${opts.path}/${opts.filename || '.env'}`);
        if (opts.restartCmd) console.log(`     restart: ${opts.restartCmd}`);
        console.log(`     config: ${targetsPath}\n`);
        return;
      }

      if (opts.subcommand === 'list') {
        const targets = loadRemoteTargets(brainDir);
        if (!targets.length) {
          console.log(`\n  No remote targets configured for this repo.\n`);
          return;
        }
        console.log(`\n  Remote deploy targets\n`);
        for (const t of targets) {
          console.log(
            `  • ${t.name.padEnd(20)} ${t.user}@${t.host}:${t.port}  ${t.remotePath}/${t.filename}`,
          );
          if (t.restartCommand) console.log(`      restart: ${t.restartCommand}`);
          if (t.keys?.length) console.log(`      keys: ${t.keys.join(', ')}`);
        }
        console.log('');
        return;
      }

      if (opts.subcommand === 'remove' || opts.subcommand === 'rm') {
        if (!opts.key) {
          console.error('Usage: total-recall secret remote remove <name>');
          process.exit(1);
        }
        const r = removeRemoteTarget(brainDir, opts.key);
        console.log(r.removed ? `  ✅ Removed remote target: ${opts.key}` : `  Remote target not found: ${opts.key}`);
        return;
      }

      if (opts.subcommand === 'deploy') {
        if (!opts.key) {
          console.error('Usage: total-recall secret remote deploy <name> [--dry-run] [--keys k1,k2]');
          process.exit(1);
        }
        const r = await deployEnvToRemote(brainDir, opts.key, {
          dryRun: opts.dryRun,
          keys: opts.keys.length ? opts.keys : undefined,
        });
        if (r.dryRun) {
          console.log(`\n  📤 dry-run remote deploy → ${r.target} (${r.host})`);
          console.log(`     would write ${r.count} keys → ${r.remoteFile}\n`);
          return;
        }
        console.log(`\n  ✅ Deployed ${r.count} secret(s) → ${r.target} (${r.host}:${r.remoteFile})`);
        if (r.restarted) console.log(`     restart: ok`);
        else if (r.restartOutput) console.log(`     restart: FAILED — ${r.restartOutput.slice(0, 300)}`);
        console.log(`     (values written with mode 0600 remotely; not printed)\n`);
        return;
      }

      console.error(`Unknown remote subcommand: ${opts.subcommand}`);
      process.exit(1);
    }

    if (opts.command === 'rotate') {
      if (!opts.key) {
        console.error('Usage: total-recall secret rotate <key> [--export-env|--export-all|--remote <name>]');
        console.error('       The new value is read from a prompt or stdin — never from argv.');
        process.exit(1);
      }
      // A credential passed as an argument is disclosed the moment it is typed:
      // argv is readable by any user via `ps`, is saved to shell history, and is
      // captured verbatim by any agent driving this CLI. Read it from a hidden
      // prompt (or stdin when piped) so it stays in this process's memory.
      if (!opts.value && opts.fromClipboard) {
        // Read the OS clipboard inside this process. This lets the operator use
        // the browser they are already signed into — copy the new credential
        // there, and the value travels clipboard -> Node -> secrets.enc without
        // ever passing through argv, a terminal echo, or an agent transcript.
        opts.value = readSystemClipboard();
        if (!opts.value) {
          console.error('Error: clipboard is empty — copy the new credential first.');
          process.exit(1);
        }
        console.log(`  📋 Read ${opts.value.length} chars from the clipboard (value not shown).`);
      }
      if (!opts.value) {
        opts.value = await readSecretValue(`New value for ${opts.key}: `);
      } else if (!opts.fromClipboard) {
        console.error(
          `\n  ⚠️  WARNING: the value was passed as a command-line argument.\n` +
            `     It is now in your shell history and was visible to any user\n` +
            `     running \`ps\` on this machine. Treat it as already disclosed\n` +
            `     and rotate again using the prompt: total-recall secret rotate ${opts.key}\n`,
        );
      }
      if (!opts.value) {
        console.error('Error: empty value — aborting rotation.');
        process.exit(1);
      }
      if (opts.remote) {
        await rotateSecret(brainDir, opts.key, opts.value, { provider: opts.provider, scope: opts.scope });
        console.log(`  ✅ Rotated: ${opts.key}`);
        const r = await deployEnvToRemote(brainDir, opts.remote, {});
        console.log(`  ✅ Deployed to remote target: ${r.target} (${r.host}:${r.remoteFile}, ${r.count} keys)`);
        if (r.restarted) console.log(`     restart: ok`);
        else if (r.restartOutput) console.log(`     restart: FAILED — ${r.restartOutput.slice(0, 300)}`);
        if (opts.exportEnv || opts.exportAll) {
          const localR = await rotateSecretAndExport(brainDir, opts.key, opts.value, {
            provider: opts.provider,
            actor: 'cli',
            exportEnv: true,
            exportAllProjects: opts.exportAll,
            exportCwd: true,
            includeGlobal: true,
          });
          const ok = (localR.exports || []).filter((e) => e.ok !== false);
          console.log(`     local export-env: ${ok.length} target(s)`);
        }
        return;
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

    if (opts.command === 'rotate-browser' || opts.command === 'rotate-auto') {
      if (!opts.key) {
        console.error(`Usage: total-recall secret ${opts.command} <key>`);
        process.exit(1);
      }

      if (opts.printOnly) {
        const assist = await getBrowserRotateAssist(brainDir, opts.key);
        console.log(`\n  🌐 Supervised browser rotation — ${assist.key}\n`);
        if (assist.console_url) console.log(`  Console: ${assist.console_url}`);
        if (assist.docs_url) console.log(`  Docs:    ${assist.docs_url}`);
        console.log(`  Overdue: ${assist.overdue ? 'YES' : 'no'}`);
        console.log('\n' + assist.prompt + '\n');
        return;
      }

      const { rotateViaBrowser, rotateAuto } = await import('../core/secrets-rotate.mjs');
      const run = opts.command === 'rotate-auto' ? rotateAuto : rotateViaBrowser;
      console.log(`\n  🔐 Rotating ${opts.key}…\n`);
      const r = await run(brainDir, opts.key, {
        headless: !!opts.headless,
        exportEnv: opts.exportEnv !== false,
        onStatus: (m) => console.log(`     · ${m}`),
      });

      if (!r.ok) {
        console.error(`\n  ❌ ${r.error}`);
        if (r.console_url) console.error(`     Console: ${r.console_url}`);
        process.exit(1);
      }
      console.log(`\n  ✅ Rotated ${r.key}` + (r.method ? ` via ${r.method}` : ''));
      if (r.verified === true) console.log('     verified against provider API');
      if (r.supervised) console.log('     (supervised — recipe not yet auto-verified)');
      if (r.exports?.length) console.log(`     exported to ${r.exports.length} project(s)`);
      if (r.revoke_hint) console.log(`\n  ⚠️  ${r.revoke_hint}`);
      return;
    }

    if (opts.command === 'rotation-status') {
      const { planAll, summarizePlans } = await import('../core/rotation-capability.mjs');
      const all = await loadSecrets(brainDir);
      const keys = Object.keys(all || {}).filter((k) => k !== 'meta');
      const plans = planAll(keys, all.meta || {});
      const sum = summarizePlans(plans);

      if (opts.json) {
        console.log(JSON.stringify({ summary: sum, plans }, null, 2));
        return;
      }

      console.log(`\n  🔄 Rotation coverage — ${sum.automatable}/${sum.total} automatable\n`);
      for (const [cls, n] of Object.entries(sum.byClass)) {
        console.log(`     ${cls.padEnd(18)} ${n}`);
      }
      const manual = plans.filter((p) => !p.automatable && p.class !== 'non_secret');
      if (manual.length) {
        console.log(`\n  Needs a human (${manual.length}):`);
        for (const p of manual) console.log(`     ${p.key.padEnd(34)} ${p.reason}`);
      }
      console.log('');
      return;
    }

    if (opts.command === 'browser-logout') {
      const { clearProfile } = await import('../core/browser-session.mjs');
      const r = clearProfile(brainDir);
      console.log(r.removed ? `  ✅ Cleared browser profile: ${r.path}` : `  (no profile at ${r.path})`);
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

      if (opts.remote) {
        const r = await deployEnvToRemote(brainDir, opts.remote, {
          dryRun: opts.dryRun,
          keys: opts.keys.length ? opts.keys : undefined,
        });
        if (r.dryRun) {
          console.log(`\n  📤 dry-run remote export → ${r.target} (${r.host})`);
          console.log(`     would write ${r.count} keys → ${r.remoteFile}\n`);
        } else {
          console.log(`\n  ✅ Exported ${r.count} secret(s) → ${r.target} (${r.host}:${r.remoteFile})`);
          if (r.restarted) console.log(`     restart: ok`);
          else if (r.restartOutput) console.log(`     restart: FAILED — ${r.restartOutput.slice(0, 300)}`);
          console.log(`     (values written with mode 0600 remotely; not printed)\n`);
        }
        if (!opts.path && !opts.allProjects) return; // --remote alone doesn't also touch local disk
      }

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
      const agentRoot = path.dirname(path.dirname(brainDir)); // …/skills/total-recall → …/.agent (or similar)
      const candidates = [
        path.join(process.cwd(), 'INSTRUCTIONS.md'),
        path.join(process.cwd(), 'AGENTS.md'),
        path.join(agentRoot, 'INSTRUCTIONS.md'),
        path.join(brainDir, 'INSTRUCTIONS.md'), // legacy
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
