/**
 * src/cli/research.mjs
 *
 * Dedicated CLI subcommand for managing ongoing research projects.
 * Usage:
 *   npx total-recall research list
 *   npx total-recall research add "<topic>" [--priority high|medium|low] [--notes "..."]
 *   npx total-recall research status
 *   npx total-recall research show <id-or-topic>
 *   npx total-recall research report <id-or-topic>
 *   npx total-recall research cancel <id>
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveBrainDir, parseLayerFlag } from './agent-dir.mjs';
import {
  listQueue,
  addToQueue,
  removeFromQueue,
  loadQueue
} from '../core/research-queue.mjs';

// ANSI escape helpers
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const grey = (s) => `\x1b[90m${s}\x1b[0m`;
const boldCyan = (s) => `\x1b[1m\x1b[36m${s}\x1b[0m`;
const boldGreen = (s) => `\x1b[1m\x1b[32m${s}\x1b[0m`;
const boldYellow = (s) => `\x1b[1m\x1b[33m${s}\x1b[0m`;
const boldRed = (s) => `\x1b[1m\x1b[31m${s}\x1b[0m`;

function getStatusBadge(status) {
  switch (status) {
    case 'in_progress':
      return boldCyan('[IN PROGRESS 🧪]');
    case 'pending':
      return boldYellow('[PENDING ⏳]');
    case 'done':
      return boldGreen('[COMPLETED ✅]');
    case 'failed':
      return boldRed('[FAILED ❌]');
    default:
      return bold(`[${status.toUpperCase()}]`);
  }
}

function getPhaseLabel(phase) {
  switch (phase) {
    case 'acquisition': return 'Acquisition (1/5)';
    case 'deliberation': return 'Deliberation (2/5)';
    case 'improvement': return 'Refinement & Clarity (3/5)';
    case 'monitoring': return 'Sources & Feeds (4/5)';
    case 'expansion': return 'Tangent Expansion (5/5)';
    default: return phase || 'unknown';
  }
}

function timeSince(dateString) {
  if (!dateString) return 'unknown';
  const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function printHeader() {
  console.log(grey('┌─────────────────────────────────────────────────────────────┐'));
  console.log(grey('│ ') + boldCyan('Total Recall — Active Autonomous Research Engine') + grey('           │'));
  console.log(grey('└─────────────────────────────────────────────────────────────┘'));
}

function printUsage() {
  console.log(`
  Usage: total-recall research <command> [options]

  Commands:
    list [--status <pending|in_progress|done|failed>] [--query <text>]
                         List all research projects with status & phase (default)
    add "<topic>" [--priority low|medium|high] [--notes "<text>"]
                         Queue a new research topic
    status               Summary counts of all research projects
    show <id-or-topic>   Show the current summary, conclusions, & directions
    report <id-or-topic> Read the full research report from the vault
    cancel <id>          Cancel and remove a research project

  Options:
    --help, -h           Show this help manual
`);
}

function findProject(idOrTopic, resolvedBrainDir) {
  const queue = loadQueue(resolvedBrainDir);
  // Try ID prefix match first
  let match = queue.find(p => p.id.startsWith(idOrTopic));
  if (!match) {
    // Try case-insensitive topic match
    const q = idOrTopic.toLowerCase();
    match = queue.find(p => p.topic.toLowerCase().includes(q));
  }
  return match;
}

function getReportContent(nodeSlug, resolvedBrainDir) {
  if (!nodeSlug) return null;
  const vaultFile = path.join(resolvedBrainDir, 'memory-vault', 'facts', `${nodeSlug}.md`);
  const inboxFile = path.join(resolvedBrainDir, 'memory-inbox', 'pending', `${nodeSlug}.md`);

  if (fs.existsSync(vaultFile)) {
    return { path: vaultFile, content: fs.readFileSync(vaultFile, 'utf8'), promoted: true };
  } else if (fs.existsSync(inboxFile)) {
    return { path: inboxFile, content: fs.readFileSync(inboxFile, 'utf8'), promoted: false };
  }
  return null;
}

// ─── Command Handlers ────────────────────────────────────────────────────────

function handleList(args, resolvedBrainDir) {
  let status = 'all';
  let query = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--status') status = args[++i];
    else if (args[i] === '--query') query = args[++i];
  }

  const { items, total } = listQueue({ status, query, brainDir: resolvedBrainDir });

  printHeader();
  if (items.length === 0) {
    console.log(`  No research projects found matching status: ${bold(status)}`);
    console.log();
    return;
  }

  console.log(`  Displaying ${bold(items.length)} of ${bold(total)} research projects:`);
  console.log();

  for (const item of items) {
    const badge = getStatusBadge(item.status);
    const phase = getPhaseLabel(item.research_phase);
    console.log(`  ${badge}  ${bold(item.topic)}`);
    console.log(`      ${grey('ID:')} ${item.id.slice(0, 8)}... | ${grey('Phase:')} ${cyan(phase)} | ${grey('Updated:')} ${timeSince(item.updated_at)}`);
    if (item.summary?.conclusions && item.summary.conclusions.length > 0 && item.summary.conclusions[0] !== 'Initial facts gathered and indexed in the knowledge base.') {
      console.log(`      ${grey('↳')} ${item.summary.conclusions[0].slice(0, 100)}...`);
    }
    console.log();
  }
}

function handleAdd(args, resolvedBrainDir) {
  const topic = args[0];
  if (!topic || topic.startsWith('--')) {
    console.error(red('  Error: topic string is required.'));
    printUsage();
    process.exit(1);
  }

  let priority = 'medium';
  let notes = '';

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--priority') priority = args[++i];
    else if (args[i] === '--notes') notes = args[++i];
  }

  try {
    const item = addToQueue({ topic, priority, notes, brainDir: resolvedBrainDir });
    console.log();
    console.log(`  ${green('✅ Successfully enqueued research project:')}`);
    console.log(`  ${bold('Topic:')}    "${item.topic}"`);
    console.log(`  ${bold('ID:')}       ${item.id}`);
    console.log(`  ${bold('Priority:')} ${item.priority}`);
    console.log();
  } catch (err) {
    console.error(red(`  Error: ${err.message}`));
    process.exit(1);
  }
}

function handleStatus(resolvedBrainDir) {
  const queue = loadQueue(resolvedBrainDir);
  const counts = { pending: 0, in_progress: 0, done: 0, failed: 0 };
  const phaseCounts = { acquisition: 0, deliberation: 0, improvement: 0, monitoring: 0, expansion: 0 };

  for (const item of queue) {
    if (counts[item.status] !== undefined) counts[item.status]++;
    const phase = item.research_phase || 'acquisition';
    if (phaseCounts[phase] !== undefined) phaseCounts[phase]++;
  }

  printHeader();
  console.log(`  ${bold('Overall Project Statistics:')}`);
  console.log(`    🧪 ${boldCyan('In Progress:')}  ${counts.in_progress}`);
  console.log(`    ⏳ ${boldYellow('Pending:')}      ${counts.pending}`);
  console.log(`    ✅ ${boldGreen('Completed:')}    ${counts.done}`);
  console.log(`    ❌ ${boldRed('Failed:')}       ${counts.failed}`);
  console.log();
  console.log(`  ${bold('Active Phase Breakdown:')}`);
  console.log(`    1. ${grey('Acquisition:')}         ${phaseCounts.acquisition} enqueued`);
  console.log(`    2. ${grey('Deliberation:')}        ${phaseCounts.deliberation} enqueued`);
  console.log(`    3. ${grey('Refinement & Clarity:')} ${phaseCounts.improvement} enqueued`);
  console.log(`    4. ${grey('Sources & Feeds:')}      ${phaseCounts.monitoring} enqueued`);
  console.log(`    5. ${grey('Tangent Expansion:')}    ${phaseCounts.expansion} enqueued`);
  console.log();
}

function handleShow(args, resolvedBrainDir) {
  const query = args[0];
  if (!query) {
    console.error(red('  Error: project ID or topic string required.'));
    printUsage();
    process.exit(1);
  }

  const project = findProject(query, resolvedBrainDir);
  if (!project) {
    console.error(red(`  Error: no research project found for query: "${query}"`));
    process.exit(1);
  }

  printHeader();
  console.log(`  ${bold('Research Topic:')}  ${boldCyan(`"${project.topic}"`)}`);
  console.log(`  ${grey('ID:')}              ${project.id}`);
  console.log(`  ${grey('Status:')}          ${getStatusBadge(project.status)}`);
  console.log(`  ${grey('Active Phase:')}    ${cyan(getPhaseLabel(project.research_phase))}`);
  console.log(`  ${grey('Last Updated:')}    ${timeSince(project.updated_at)} (${new Date(project.updated_at).toLocaleString()})`);
  console.log();

  const summary = project.summary;
  if (!summary) {
    console.log(`  ${boldYellow('⚠️  No summary available yet for this project.')}`);
    console.log();
    return;
  }

  console.log(grey('  ───────────────────────────────────────────────────────────'));
  console.log(`  ${bold('🔑 Key Conclusions & Insights')}`);
  if (summary.conclusions && summary.conclusions.length > 0) {
    for (const c of summary.conclusions) {
      console.log(`    ✨ ${c}`);
    }
  } else {
    console.log(`    ${grey('(Pending phase completion to extract insights)')}`);
  }
  console.log();

  console.log(`  ${bold('🚀 Ongoing Directions & Gaps')}`);
  if (summary.ongoing_directions && summary.ongoing_directions.length > 0) {
    for (const d of summary.ongoing_directions) {
      console.log(`    ↳ ${d}`);
    }
  } else {
    console.log(`    ${grey('(Pending phase completion to extract future directions)')}`);
  }
  console.log();

  if (project.node_slug) {
    console.log(grey('  ───────────────────────────────────────────────────────────'));
    console.log(`  ${bold('Full Report Details:')}`);
    console.log(`    ${grey('Vault Node Slug:')}   [[${project.node_slug}]]`);
    console.log(`    ${grey('Status in Vault:')}  ${project.summary?.node_status === 'active' ? green('Promoted (Active Fact)') : yellow('Staged (Pending Validation)')}`);
    console.log(`    ${grey('Sources Consulted:')} ${summary.sources_count || 0} unique references`);
    console.log();
    console.log(`  ${grey('To read the full raw markdown report, run:')}`);
    console.log(`    ${boldCyan(`npx total-recall research report ${project.id.slice(0, 8)}`)}`);
  }
  console.log();
}

function handleReport(args, resolvedBrainDir) {
  const query = args[0];
  if (!query) {
    console.error(red('  Error: project ID or topic string required.'));
    printUsage();
    process.exit(1);
  }

  const project = findProject(query, resolvedBrainDir);
  if (!project) {
    console.error(red(`  Error: no research project found for query: "${query}"`));
    process.exit(1);
  }

  if (!project.node_slug) {
    console.error(red(`  Error: research project "${project.topic}" has not produced a report slug yet. Let the daemon run its acquisition cycle.`));
    process.exit(1);
  }

  const report = getReportContent(project.node_slug, resolvedBrainDir);
  if (!report) {
    console.error(red(`  Error: report file not found for slug [[${project.node_slug}]].`));
    process.exit(1);
  }

  console.log(grey('┌─────────────────────────────────────────────────────────────┐'));
  console.log(grey('│ ') + boldCyan(`Report: [[${project.node_slug}]]`) + grey(' '.repeat(Math.max(0, 43 - project.node_slug.length))) + grey('│'));
  console.log(grey('│ ') + grey(`Location: ${report.path}`) + grey(' '.repeat(Math.max(0, 48 - report.path.length))) + grey('│'));
  console.log(grey('│ ') + (report.promoted ? boldGreen('PROMOTED ACTIVE FACT') : boldYellow('PENDING VALIDATION DRAFT')) + grey(' '.repeat(report.promoted ? 38 : 34)) + grey('│'));
  console.log(grey('└─────────────────────────────────────────────────────────────┘'));
  console.log();
  console.log(report.content);
  console.log();
}

function handleCancel(args, resolvedBrainDir) {
  const id = args[0];
  if (!id) {
    console.error(red('  Error: project ID is required.'));
    printUsage();
    process.exit(1);
  }

  try {
    const result = removeFromQueue(id, resolvedBrainDir);
    console.log();
    console.log(`  ${green('✅ Successfully cancelled and removed research project:')}`);
    console.log(`  ${bold('Topic:')} "${result.topic}"`);
    console.log(`  ${bold('ID:')}    ${result.id}`);
    console.log();
  } catch (err) {
    console.error(red(`  Error: ${err.message}`));
    process.exit(1);
  }
}

// ─── CLI Entrypoint ──────────────────────────────────────────────────────────

export default async function research(args) {
  // Parse layer flag from args
  const { layer, remainingArgs } = parseLayerFlag(args);
  const resolvedBrainDir = resolveBrainDir(layer);
  const cmd = remainingArgs[0] || 'list';

  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    printHeader();
    printUsage();
    return;
  }

  const subArgs = remainingArgs.slice(1);

  switch (cmd) {
    case 'list':
      handleList(subArgs, resolvedBrainDir);
      break;
    case 'add':
      handleAdd(subArgs, resolvedBrainDir);
      break;
    case 'status':
      handleStatus(resolvedBrainDir);
      break;
    case 'show':
      handleShow(subArgs, resolvedBrainDir);
      break;
    case 'report':
      handleReport(subArgs, resolvedBrainDir);
      break;
    case 'cancel':
      handleCancel(subArgs, resolvedBrainDir);
      break;
    default:
      const matched = findProject(cmd, resolvedBrainDir);
      if (matched) {
        handleShow([cmd, ...subArgs], resolvedBrainDir);
      } else {
        console.error(red(`  Error: unknown research subcommand: "${cmd}"`));
        printUsage();
        process.exit(1);
      }
  }
}
