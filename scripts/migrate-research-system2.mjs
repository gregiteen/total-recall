#!/usr/bin/env node
/**
 * One-off migration for RESEARCH_SYSTEM2 (docs/projects/in-progress/RESEARCH_SYSTEM2).
 *
 * Retires the state the removed self-spawning research left behind:
 *   1. Queue items parked in the removed `expansion` / `monitoring` phases →
 *      `done` (the report exists) or `failed` (no node). Pre-gate items get
 *      origin 'legacy': they were queued by a person or by a generator that no
 *      longer exists, and there is no way to tell which. Legacy research still
 *      reaches chat by relevance, but is never pinned into instructions.
 *   2. Pending scheduler tasks created by the expansion phase → cancelled.
 *   3. Pending agenda topics the pipeline added to itself (follow-up gaps and
 *      deep-research re-adds) → cancelled. The agenda is a coverage ledger now.
 *
 * Dry run by default. `--apply` writes, after copying each file to
 * `<file>.bak-system2-<timestamp>`. `--brain <dir>` targets another brain.
 *
 *   node scripts/migrate-research-system2.mjs            # show what would change
 *   node scripts/migrate-research-system2.mjs --apply    # do it
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import matter from 'gray-matter';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const brainArg = args.indexOf('--brain');
const brainDir = brainArg !== -1 ? path.resolve(args[brainArg + 1])
  : (process.env.TR_BRAIN || path.join(os.homedir(), '.agent', 'skills', 'total-recall'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const now = new Date().toISOString();

const REMOVED_PHASES = new Set(['expansion', 'monitoring']);
const SELF_SPAWNED_AGENDA = (source) => /^follow-up:/.test(source || '') || source === 'deep-research-task' || source === 'self-diagnosis';

function backup(file) {
  if (apply && fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak-system2-${stamp}`);
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function writeJsonl(file, rows) {
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

// 1. Research queue
const queueFile = path.join(brainDir, 'research-queue.jsonl');
const queue = readJsonl(queueFile);
const queueChanges = { done: 0, failed: 0, originTagged: 0 };
if (queue) {
  for (const item of queue) {
    // Also corrects this script's first run (2026-09-22), which tagged them 'user'.
    const untagged = !item.origin || (item.origin === 'user' && !item.requested_via);
    if (untagged) { item.origin = 'legacy'; item.requested_via = null; queueChanges.originTagged++; }
    if (item.attempts === undefined) item.attempts = 0;
    if (item.status !== 'pending' || !REMOVED_PHASES.has(item.research_phase)) continue;
    item.updated_at = now;
    if (item.node_slug && item.node_slug !== 'pending') {
      item.status = 'done';
      item.completed_at = item.completed_at || now;
      item.notes = `Finished at ${item.research_phase} (phase removed by RESEARCH_SYSTEM2).`;
      queueChanges.done++;
    } else {
      item.status = 'failed';
      item.notes = `Parked in removed ${item.research_phase} phase with no report (RESEARCH_SYSTEM2).`;
      queueChanges.failed++;
    }
    item.research_phase = 'improvement';
  }
  if (apply) { backup(queueFile); writeJsonl(queueFile, queue); }
}

// 2. Scheduler tasks spawned by expansion
const queueDir = path.join(brainDir, 'scheduler', 'queue');
let tasksCancelled = 0;
if (fs.existsSync(queueDir)) {
  for (const name of fs.readdirSync(queueDir)) {
    if (!name.endsWith('.md')) continue;
    const file = path.join(queueDir, name);
    const parsed = matter(fs.readFileSync(file, 'utf8'));
    const { data } = parsed;
    const spawned = data.created_by === 'fact-seeker-expansion' || data.created_by === 'fact-seeker-deliberation';
    if (!spawned || data.status !== 'pending') continue;
    tasksCancelled++;
    if (apply) {
      backup(file);
      data.status = 'cancelled';
      data.cancel_reason = 'RESEARCH_SYSTEM2: research no longer spawns research';
      data.updated = now;
      fs.writeFileSync(file, matter.stringify(parsed.content, data), 'utf8');
    }
  }
}

// 3. Agenda
const agendaFile = path.join(brainDir, 'research-agenda.jsonl');
const agenda = readJsonl(agendaFile);
let agendaCancelled = 0;
if (agenda) {
  for (const t of agenda) {
    if (t.status !== 'pending' || !SELF_SPAWNED_AGENDA(t.source)) continue;
    t.status = 'cancelled';
    t.cancel_reason = 'RESEARCH_SYSTEM2: autonomous spawning removed';
    agendaCancelled++;
  }
  if (apply) { backup(agendaFile); writeJsonl(agendaFile, agenda); }
}

console.log(`${apply ? 'Applied' : 'Dry run'} — brain: ${brainDir}`);
console.log(`  queue:     ${queueChanges.done} parked items → done, ${queueChanges.failed} → failed, ${queueChanges.originTagged} pre-gate items tagged origin=legacy`);
console.log(`  scheduler: ${tasksCancelled} self-spawned pending tasks → cancelled`);
console.log(`  agenda:    ${agendaCancelled} self-added pending topics → cancelled`);
if (!apply) console.log('\nRe-run with --apply to write (files are backed up first).');
