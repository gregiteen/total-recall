/**
 * total-recall task — enqueue / list / show / cancel daemon tasks.
 *
 * Agents use this to set durable work for the daemon (open envelope).
 *
 * Usage:
 *   npx total-recall task add "<intent>" [options]
 *   npx total-recall task list [--status pending|all|completed|failed|cancelled]
 *   npx total-recall task show <slug>
 *   npx total-recall task cancel <slug>
 *   npx total-recall task executors
 */

import path from 'node:path';
import {
  addTask,
  listTasks,
  getTask,
  cancelTask,
  resolveQueueDir,
} from '../core/task-envelope.mjs';
import { listExecutorIds } from '../core/task-executors.mjs';
import { resolveBrainDir, parseLayerFlag } from './agent-dir.mjs';

function printHelp() {
  console.log(`
  total-recall task — Daemon task queue (open envelope)

  Usage: total-recall task <command> [options]

  Commands:
    add "<intent>"     Enqueue a task for the daemon
    list               List tasks (default: pending + in-progress)
    show <slug>        Show one task
    cancel <slug>      Cancel a pending/in-progress task
    executors          List registered executor ids

  add options:
    --kind <k>         memory | research | maintenance | system | custom (default: custom)
    --executor <id>    dream | custom | research | session-ingest | surface-compile | prune
    --priority <p>     high | normal | low | absolute | 0-100 (default: normal)
    --cap <list>       Comma-separated capabilities (default: vault:read)
                       Use vault:write to draft results into memory-inbox
    --payload <json>   JSON object string for structured inputs
    --land <where>     inbox | log | vault (default: inbox)
    --agent <name>     Origin agent id (default: cli)
    --slug <slug>      Custom task slug
    --body <text>      Longer body (defaults to intent)

  list options:
    --status <s>       pending | completed | failed | cancelled | all

  Examples:
    npx total-recall task add "Extract decisions from last session" --cap vault:write --priority high
    npx total-recall task add "Run dream cycle" --executor dream --kind system --priority high
    npx total-recall task list
    npx total-recall task cancel task-custom-abc123

  Policy:
    shell / net:post capabilities are denied by default.
    Proactive idle fill is off unless TR_IDLE_TASKS=1.
`);
}

function parseArgs(args) {
  const out = {
    command: null,
    intent: null,
    slug: null,
    kind: 'custom',
    executor: null,
    priority: 'normal',
    cap: 'vault:read',
    payload: null,
    land: 'inbox',
    agent: 'cli',
    body: null,
    status: 'pending',
    help: false,
    rest: [],
  };

  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    out.help = true;
    return out;
  }

  out.command = args[0];
  let i = 1;

  // positional after command
  if (out.command === 'add' && args[i] && !args[i].startsWith('--')) {
    out.intent = args[i++];
  } else if (
    (out.command === 'show' || out.command === 'cancel') &&
    args[i] &&
    !args[i].startsWith('--')
  ) {
    out.slug = args[i++];
  }

  while (i < args.length) {
    const a = args[i];
    switch (a) {
      case '--help':
      case '-h':
        out.help = true;
        break;
      case '--kind':
        out.kind = args[++i];
        break;
      case '--executor':
        out.executor = args[++i];
        break;
      case '--priority':
      case '-p':
        out.priority = args[++i];
        break;
      case '--cap':
      case '--capabilities':
        out.cap = args[++i];
        break;
      case '--payload':
        out.payload = args[++i];
        break;
      case '--land':
        out.land = args[++i];
        break;
      case '--agent':
        out.agent = args[++i];
        break;
      case '--slug':
        out.slug = args[++i];
        break;
      case '--body':
        out.body = args[++i];
        break;
      case '--status':
        out.status = args[++i];
        break;
      default:
        if (!a.startsWith('--') && !out.intent && out.command === 'add') {
          out.intent = a;
        } else if (!a.startsWith('--') && !out.slug) {
          out.slug = a;
        } else {
          out.rest.push(a);
        }
    }
    i++;
  }

  return out;
}

export default async function taskCli(argv) {
  const { layer, remainingArgs } = parseLayerFlag(argv);
  const opts = parseArgs(remainingArgs);

  if (opts.help || !opts.command) {
    printHelp();
    return;
  }

  const brainDir = resolveBrainDir(layer);
  const queueDir = resolveQueueDir(brainDir);

  if (opts.command === 'executors') {
    console.log('\n  Registered executors:\n');
    for (const id of listExecutorIds()) {
      console.log(`    • ${id}`);
    }
    console.log('');
    return;
  }

  if (opts.command === 'list') {
    const tasks = listTasks(queueDir, { status: opts.status });
    if (!tasks.length) {
      console.log(`\n  No tasks (status=${opts.status}) in ${queueDir}\n`);
      return;
    }
    console.log(`\n  Tasks (${opts.status}) — ${queueDir}\n`);
    for (const t of tasks) {
      const caps = (t.capabilities || []).join(',') || '-';
      console.log(
        `  [${t.status}] p${t.priority} ${t.slug}\n` +
          `      kind=${t.kind || '-'} exec=${t.executor || t.category || '-'} caps=${caps}\n` +
          `      ${(t.intent || t.reason || '').slice(0, 100)}`,
      );
    }
    console.log('');
    return;
  }

  if (opts.command === 'show') {
    if (!opts.slug) {
      console.error('  Error: show requires <slug>');
      process.exitCode = 1;
      return;
    }
    const t = getTask(queueDir, opts.slug);
    if (!t) {
      console.error(`  Task not found: ${opts.slug}`);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(t, null, 2));
    return;
  }

  if (opts.command === 'cancel') {
    if (!opts.slug) {
      console.error('  Error: cancel requires <slug>');
      process.exitCode = 1;
      return;
    }
    const result = cancelTask(queueDir, opts.slug);
    if (!result.success) {
      console.error(`  ${result.error}`);
      process.exitCode = 1;
      return;
    }
    console.log(`  Cancelled: ${opts.slug}`);
    return;
  }

  if (opts.command === 'add') {
    if (!opts.intent && !opts.body) {
      console.error('  Error: add requires "<intent>"');
      process.exitCode = 1;
      return;
    }

    let payload = {};
    if (opts.payload) {
      try {
        payload = JSON.parse(opts.payload);
      } catch (err) {
        console.error(`  Invalid --payload JSON: ${err.message}`);
        process.exitCode = 1;
        return;
      }
    }

    const capabilities = String(opts.cap)
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    // vault:write convenience when landing to inbox
    if (opts.land === 'inbox' && !capabilities.includes('vault:write') && opts.kind === 'custom') {
      // keep default read-only unless user asked vault:write — intentional
    }

    try {
      const task = addTask(
        {
          intent: opts.intent,
          body: opts.body || opts.intent,
          kind: opts.kind,
          executor: opts.executor,
          priority: opts.priority,
          capabilities,
          payload,
          slug: opts.slug || undefined,
          origin: { agent: opts.agent, created_by: opts.agent },
          result: { land: opts.land },
          system: opts.kind === 'system',
        },
        queueDir,
      );
      console.log(`\n  ✅ Enqueued: ${task.slug}`);
      console.log(`     queue: ${path.relative(process.cwd(), queueDir) || queueDir}`);
      console.log(`     kind=${task.kind} priority=${task.priority} caps=${task.capabilities.join(',')}`);
      console.log(`     Run daemon: npx total-recall daemon start\n`);
    } catch (err) {
      console.error(`  Error: ${err.message}`);
      process.exitCode = 1;
    }
    return;
  }

  console.error(`  Unknown task command: ${opts.command}`);
  printHelp();
  process.exitCode = 1;
}
