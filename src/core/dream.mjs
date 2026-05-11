/**
 * dream.mjs — SSSS Dream Cycle Daemon (Total Recall)
 *
 * Three-phase Dream Cycle:
 *   Phase 1 — Light Sleep: Scan vault modifications + new session logs → candidate nodes
 *   Phase 2 — REM: Conflict detection, dream scoring, promotion/decay
 *   Phase 3 — Deep Sleep: Recompile surface, rebuild indexes
 *   Phase 4 — Recover: Restore from backup on error
 *
 * Runs on a cron schedule (03:00 UTC nightly) or can be triggered manually.
 * Zero workspace-specific references. Configured by caller-supplied paths.
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const matter = require('gray-matter');

import { loadNodes, writeNode, atomicWrite, walkMd } from './vault.mjs';
import { detectConflicts, writeConflictFile, appendConflictIndex } from './steering.mjs';
import { compileSurface } from './surface.mjs';
import {
  DREAM_PROMOTION_THRESHOLD,
  DECAY_INACTIVE_DAYS,
  DECAY_CONFIDENCE_DELTA,
  PROMOTION_CONFIDENCE_BOOST,
  CONFIDENCE_MAX,
  CONFIDENCE_DEPRECATION_THRESHOLD,
  DREAM_CRON_SCHEDULE,
} from '../constants/schema.js';

// ─── HALF-LIFE DECAY ─────────────────────────────────────────────────────────────

/**
 * Compute effective confidence after time-based half-life decay.
 * @param {import('../types/memory.js').MemoryNode} node
 * @returns {number} Effective confidence (0..1)
 */
export function applyHalfLifeDecay(node) {
  const halfLifeDays = node.decay?.half_life_days ?? 180;
  const lastAccessed = new Date(node.last_accessed ?? node.updated ?? node.created);
  const daysSince = (Date.now() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
  const decayFactor = Math.pow(0.5, daysSince / halfLifeDays);
  return node.confidence * decayFactor;
}

// ─── PHASE 1 — LIGHT SLEEP ──────────────────────────────────────────────────────

/**
 * Scan the vault for .md files modified since a given timestamp.
 * @param {string} vaultDir
 * @param {number} sinceHours - Hours to look back (default: 24)
 * @returns {string[]} Modified file paths
 */
export function scanModifiedVault(vaultDir, sinceHours = 24) {
  const cutoff = Date.now() - sinceHours * 60 * 60 * 1000;
  return walkMd(vaultDir).filter(fp => {
    try {
      return fs.statSync(fp).mtimeMs >= cutoff;
    } catch {
      return false;
    }
  });
}

/**
 * Scan session JSONL files for new entries since the last dream cycle.
 * @param {string} sessionsDir
 * @param {string} lastCycleTimestamp - ISO 8601 timestamp
 * @returns {import('../types/memory.js').SessionEntry[]}
 */
export function scanNewSessions(sessionsDir, lastCycleTimestamp) {
  if (!fs.existsSync(sessionsDir)) return [];

  const cutoff = new Date(lastCycleTimestamp).getTime();
  const entries = [];

  for (const file of fs.readdirSync(sessionsDir)) {
    if (!file.endsWith('.jsonl')) continue;
    const filePath = path.join(sessionsDir, file);
    const stat = fs.statSync(filePath);
    if (stat.mtimeMs < cutoff) continue;

    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (new Date(entry.ts).getTime() >= cutoff) {
          entries.push(entry);
        }
      } catch {
        // Skip malformed lines
      }
    }
  }

  return entries;
}

/**
 * Extract candidate memory nodes from session entries.
 * Looks for branch_summary entries with patterns suggesting new rules.
 * @param {import('../types/memory.js').SessionEntry[]} sessions
 * @returns {Partial<import('../types/memory.js').MemoryNode>[]}
 */
export function extractCandidates(sessions) {
  const candidates = [];
  const now = new Date().toISOString();

  for (const entry of sessions) {
    if (entry.type !== 'branch_summary' && entry.type !== 'observation') continue;
    if (!entry.content || entry.content.length < 20) continue;

    // Very simple heuristic: branch summaries with resolved/learned/discovered patterns
    const lower = entry.content.toLowerCase();
    const isCandidate =
      lower.includes('resolved') ||
      lower.includes('learned') ||
      lower.includes('discovered') ||
      lower.includes('pattern') ||
      lower.includes('never') ||
      lower.includes('always') ||
      lower.includes('prefer') ||
      lower.includes('fixed');

    if (!isCandidate) continue;

    // Build a minimal candidate node
    const slug = `session-${entry.id}-${Date.now().toString(36)}`;
    candidates.push({
      type: 'memory',
      slug,
      category: 'patterns',
      schema_version: 2,
      title: entry.content.slice(0, 80).replace(/\n/g, ' '),
      status: 'draft',
      confidence: 0.5,
      importance: 2,
      created: entry.ts ?? now,
      updated: now,
      last_accessed: now,
      source: {
        type: 'mined',
        session_id: entry.id,
        evidence_count: 1,
      },
      supersedes: [],
      superseded_by: null,
      contradicts: [],
      tags: [],
      related: [],
      routes_to_skills: [],
      sentiment_polarity: 'descriptive',
      sentiment_target: '',
      modality: 'should',
      subject: 'agent',
      predicate: slug.replace(/-/g, '_'),
      object: '',
      decay: { half_life_days: 30, access_count: 0 },
      body: entry.content,
    });
  }

  return candidates;
}

// ─── PHASE 2 — REM ──────────────────────────────────────────────────────────────

/**
 * Compute a dream score for a candidate node.
 * Higher score → more likely to be promoted to active.
 *
 * @param {{ evidence_count?: number, importance?: number, created?: string }} candidate
 * @param {{ evidence_count: number, recency_factor: number, importance: number }} weights
 * @returns {number} 0..1
 */
export function dreamScore(candidate, weights = {}) {
  const evidenceCount = candidate.source?.evidence_count ?? 1;
  const importance = candidate.importance ?? 2;
  const createdAt = new Date(candidate.created ?? Date.now()).getTime();
  const recencyFactor = Math.max(0, 1 - (Date.now() - createdAt) / (7 * 24 * 60 * 60 * 1000)); // decay over 7 days

  return (
    0.4 * Math.min(1, evidenceCount / 5) +
    0.3 * recencyFactor +
    0.3 * (importance / 5)
  );
}

/**
 * Evaluate candidate nodes against existing vault nodes.
 * Runs conflict detection, dream scoring, promotion, and decay.
 *
 * @param {Partial<import('../types/memory.js').MemoryNode>[]} candidates
 * @param {import('../types/memory.js').MemoryNode[]} existingNodes
 * @param {string} conflictsDir
 * @param {string} derivedDir
 * @returns {{ promoted: import('../types/memory.js').MemoryNode[], conflicted: import('../types/memory.js').ConflictRecord[] }}
 */
export function evaluateCandidates(candidates, existingNodes, conflictsDir, derivedDir) {
  const promoted = [];
  const allConflicts = [];

  for (const candidate of candidates) {
    const conflicts = detectConflicts(candidate, existingNodes);

    if (conflicts.length > 0) {
      for (const c of conflicts) {
        writeConflictFile(c, conflictsDir);
        if (derivedDir) appendConflictIndex(c, derivedDir);
      }
      allConflicts.push(...conflicts);
      continue; // Block promotion
    }

    const score = dreamScore(candidate);
    if (score >= DREAM_PROMOTION_THRESHOLD) {
      const node = {
        ...candidate,
        status: 'active',
        confidence: Math.min(CONFIDENCE_MAX, (candidate.confidence ?? 0.5) + PROMOTION_CONFIDENCE_BOOST),
      };
      promoted.push(node);
      existingNodes.push(node); // Add to existing so subsequent candidates see it
    }
  }

  return { promoted, conflicted: allConflicts };
}

/**
 * Apply passive confidence decay to stale nodes.
 * Mutates nodes in place (caller must re-write to vault).
 *
 * @param {import('../types/memory.js').MemoryNode[]} nodes
 * @returns {import('../types/memory.js').MemoryNode[]} Mutated nodes (those that changed)
 */
export function decayStaleNodes(nodes) {
  const changed = [];
  const cutoffMs = DECAY_INACTIVE_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const node of nodes) {
    if (node.status !== 'active') continue;
    if (node.priority === 'absolute') continue; // Never decay absolute invariants

    const lastAccessed = new Date(node.last_accessed ?? node.updated ?? node.created).getTime();
    const isStale = now - lastAccessed > cutoffMs;
    const isLowImportance = (node.importance ?? 3) < 3;

    if (isStale && isLowImportance) {
      node.confidence = Math.max(0, (node.confidence ?? 0.5) - DECAY_CONFIDENCE_DELTA);
      node.updated = new Date().toISOString();

      if (node.confidence < CONFIDENCE_DEPRECATION_THRESHOLD) {
        node.status = 'deprecated';
      }

      changed.push(node);
    }
  }

  return changed;
}

// ─── BACKUP & RESTORE ────────────────────────────────────────────────────────────

/**
 * Create a timestamped backup of skills and derived indexes.
 * @param {string} skillsDir
 * @param {string} derivedDir
 * @param {string} backupsDir
 * @returns {string} Backup directory path
 */
export function createBackup(skillsDir, derivedDir, backupsDir) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupsDir, timestamp);

  if (fs.existsSync(skillsDir)) {
    fs.cpSync(skillsDir, path.join(backupPath, 'skills'), { recursive: true });
  }
  if (fs.existsSync(derivedDir)) {
    fs.cpSync(derivedDir, path.join(backupPath, 'memory-derived'), { recursive: true });
  }

  return backupPath;
}

/**
 * Restore skills and derived indexes from a backup.
 * @param {string} backupDir
 * @param {string} skillsDir
 * @param {string} derivedDir
 */
export function restoreFromBackup(backupDir, skillsDir, derivedDir) {
  const backupSkills = path.join(backupDir, 'skills');
  const backupDerived = path.join(backupDir, 'memory-derived');

  if (fs.existsSync(backupSkills)) {
    fs.cpSync(backupSkills, skillsDir, { recursive: true, force: true });
  }
  if (fs.existsSync(backupDerived)) {
    fs.cpSync(backupDerived, derivedDir, { recursive: true, force: true });
  }
}

// ─── DREAM CYCLE ORCHESTRATOR ────────────────────────────────────────────────────

/**
 * Append a DreamReport entry to dream-report.jsonl.
 * @param {Partial<import('../types/memory.js').DreamReport>} report
 * @param {string} derivedDir
 */
function appendDreamReport(report, derivedDir) {
  const reportPath = path.join(derivedDir, 'dream-report.jsonl');
  fs.mkdirSync(derivedDir, { recursive: true });
  fs.appendFileSync(reportPath, JSON.stringify({ ...report, timestamp: new Date().toISOString() }) + '\n');
}

/**
 * Run the full Dream Cycle.
 *
 * @param {{
 *   vaultDir: string,
 *   skillsDir: string,
 *   derivedDir: string,
 *   sessionsDir: string,
 *   conflictsDir: string,
 *   backupsDir: string,
 *   instructionsFile: string,
 *   db?: import('better-sqlite3').Database | null,
 *   dryRun?: boolean,
 * }} paths
 * @returns {Promise<import('../types/memory.js').DreamReport>}
 */
export async function runDreamCycle(paths) {
  const {
    vaultDir, skillsDir, derivedDir, sessionsDir, conflictsDir,
    backupsDir, instructionsFile, db = null, dryRun = false,
  } = paths;

  const startMs = Date.now();
  const report = {
    phase: 'light-sleep',
    nodes_processed: 0,
    conflicts_found: 0,
    nodes_decayed: 0,
    nodes_promoted: 0,
    errors: [],
    duration_ms: 0,
  };

  // ── PHASE 0: Backup ──────────────────────────────────────────────────────────
  let backupPath = null;
  if (!dryRun) {
    try {
      fs.mkdirSync(backupsDir, { recursive: true });
      backupPath = createBackup(skillsDir, derivedDir, backupsDir);
      console.log(`  💾 Backup: ${backupPath}`);
    } catch (err) {
      report.errors.push(`backup: ${err.message}`);
      console.warn(`  ⚠️  Backup failed: ${err.message}`);
    }
  }

  // ── PHASE 1: LIGHT SLEEP ────────────────────────────────────────────────────
  console.log('\n🌙 PHASE 1 — Light Sleep (Scan & Ingest)');
  report.phase = 'light-sleep';

  const modifiedFiles = scanModifiedVault(vaultDir);
  console.log(`   Modified vault files: ${modifiedFiles.length}`);

  // Load last dream timestamp
  const dreamReportPath = path.join(derivedDir, 'dream-report.jsonl');
  let lastCycleTs = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if (fs.existsSync(dreamReportPath)) {
    const lines = fs.readFileSync(dreamReportPath, 'utf-8').trim().split('\n').filter(Boolean);
    if (lines.length > 0) {
      try {
        const last = JSON.parse(lines[lines.length - 1]);
        lastCycleTs = last.timestamp ?? lastCycleTs;
      } catch { /* use default */ }
    }
  }

  const newSessions = scanNewSessions(sessionsDir, lastCycleTs);
  const candidates = extractCandidates(newSessions);
  console.log(`   New session entries: ${newSessions.length} → ${candidates.length} candidates`);

  // Write candidates to scratchpad
  const scratchpadPath = path.join(derivedDir, 'scratchpad.yml');
  if (!dryRun && candidates.length > 0) {
    const yaml = candidates.map(c => `- slug: ${c.slug}\n  title: "${c.title}"\n  confidence: ${c.confidence}`).join('\n');
    atomicWrite(scratchpadPath, `# Dream Cycle Scratchpad\n# Generated: ${new Date().toISOString()}\npending_nodes:\n${yaml}\n`);
  }

  // ── PHASE 2: REM ─────────────────────────────────────────────────────────────
  console.log('\n💫 PHASE 2 — REM (Pattern Recognition)');
  report.phase = 'rem';

  const existingNodes = loadNodes(vaultDir);
  report.nodes_processed = existingNodes.length + candidates.length;

  let promoted = [];
  let conflicted = [];

  try {
    if (candidates.length > 0 && !dryRun) {
      ({ promoted, conflicted } = evaluateCandidates(candidates, existingNodes, conflictsDir, derivedDir));
      report.nodes_promoted = promoted.length;
      report.conflicts_found = conflicted.length;
      console.log(`   Promoted: ${promoted.length} | Conflicts: ${conflicted.length}`);

      // Write promoted nodes to vault
      for (const node of promoted) {
        writeNode(node, vaultDir);
      }
    }

    // Phase 2b: Decay stale nodes
    const decayed = decayStaleNodes(existingNodes);
    report.nodes_decayed = decayed.length;
    console.log(`   Decayed: ${decayed.length}`);

    if (!dryRun) {
      for (const node of decayed) {
        writeNode(node, vaultDir);
      }
    }
  } catch (err) {
    report.errors.push(`rem: ${err.message}`);
    console.error(`  ❌ REM error: ${err.message}`);

    // Phase 4: Recover
    if (backupPath) {
      console.log('  🔄 Recovering from backup...');
      report.phase = 'recover';
      restoreFromBackup(backupPath, skillsDir, derivedDir);
    }

    report.duration_ms = Date.now() - startMs;
    if (!dryRun) appendDreamReport(report, derivedDir);
    return report;
  }

  // ── PHASE 3: DEEP SLEEP ──────────────────────────────────────────────────────
  console.log('\n🌊 PHASE 3 — Deep Sleep (Recompile)');
  report.phase = 'deep-sleep';

  if (!dryRun) {
    try {
      await compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile, db });
      console.log('   ✅ Surface recompiled');
    } catch (err) {
      report.errors.push(`deep-sleep: ${err.message}`);
      console.error(`  ❌ Deep sleep error: ${err.message}`);

      // Phase 4: Recover
      if (backupPath) {
        console.log('  🔄 Recovering from backup...');
        report.phase = 'recover';
        restoreFromBackup(backupPath, skillsDir, derivedDir);
      }
    }
  } else {
    console.log('   [dry-run] Skipping compileSurface');
  }

  // ── FINALIZE ─────────────────────────────────────────────────────────────────
  report.duration_ms = Date.now() - startMs;
  console.log(`\n✅ Dream Cycle complete in ${report.duration_ms}ms`);

  if (!dryRun) appendDreamReport(report, derivedDir);

  return report;
}

// ─── DAEMON (cron + file watcher) ────────────────────────────────────────────────

/**
 * Start the Dream Cycle daemon.
 * Wires up:
 *   - chokidar file watcher on vaultDir for real-time conflict checks
 *   - node-cron schedule for nightly full dream cycles
 *
 * @param {{
 *   vaultDir: string,
 *   skillsDir: string,
 *   derivedDir: string,
 *   sessionsDir: string,
 *   conflictsDir: string,
 *   backupsDir: string,
 *   instructionsFile: string,
 *   db?: import('better-sqlite3').Database | null,
 *   schedule?: string,
 * }} config
 */
export async function startDaemon(config) {
  const schedule = config.schedule ?? DREAM_CRON_SCHEDULE;
  let chokidar, nodeCron;

  try {
    chokidar = (await import('chokidar')).default;
  } catch {
    console.warn('⚠️  chokidar not installed — file watching disabled. Run: npm install chokidar');
  }

  try {
    nodeCron = await import('node-cron');
  } catch {
    console.warn('⚠️  node-cron not installed — scheduled dream cycle disabled. Run: npm install node-cron');
  }

  // Real-time conflict check on new vault files
  if (chokidar) {
    const watcher = chokidar.watch(config.vaultDir, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 300 },
    });

    watcher.on('add', async (filePath) => {
      if (!filePath.endsWith('.md')) return;
      console.log(`🔍 Vault change detected: ${path.basename(filePath)}`);

      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const matter = (await import('gray-matter')).default;
        const { data: meta, content: body } = matter(raw);
        if (meta.type !== 'memory' || meta.status === 'draft') return;

        const existingNodes = loadNodes(config.vaultDir);
        const conflicts = detectConflicts({ ...meta, body }, existingNodes);

        if (conflicts.length > 0) {
          console.log(`⚠️  Conflict detected for ${meta.slug}: ${conflicts.length} conflict(s)`);
          for (const c of conflicts) {
            writeConflictFile(c, config.conflictsDir);
          }
          // Set node back to draft
          const { setStatus } = await import('./vault.mjs');
          setStatus(config.vaultDir, meta.slug, 'draft');
        }
      } catch (err) {
        console.error(`  ❌ Conflict check failed: ${err.message}`);
      }
    });

    console.log(`👀 Watching vault for changes: ${config.vaultDir}`);
  }

  // Nightly Dream Cycle
  if (nodeCron?.default?.validate(schedule)) {
    nodeCron.default.schedule(schedule, async () => {
      console.log(`\n🌙 [${new Date().toISOString()}] Starting scheduled Dream Cycle`);
      try {
        await runDreamCycle(config);
      } catch (err) {
        console.error(`  ❌ Dream Cycle failed: ${err.message}`);
      }
    });
    console.log(`⏰ Dream Cycle scheduled: ${schedule} (UTC)`);
  }

  console.log('🧠 Total Recall Dream Daemon running.');
}
