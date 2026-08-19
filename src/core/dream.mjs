import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import matter from 'gray-matter';
import { writeNode, walkMd } from './vault.mjs';
import { updateNodeInPlace } from './validated-write.mjs';
import { getNodes } from './vault-cache.mjs';
import { logger } from './logger.mjs';
import { agentDir, brainDir } from './config.mjs';
import { loadQueue } from './research-queue.mjs';

/**
 * Write a daily dream-cycle summary to memory-vault/daily/YYYY-MM-DD.md.
 * SSSS node natively; Obsidian Daily Notes plugin reads these files directly.
 */
async function writeDailyNote(vaultDir, summaryLines) {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const filePath = path.join(vaultDir, 'daily', `${today}.md`);
  const runBlock = [
    `## Dream Cycle \u2013 ${now}`,
    '',
    ...summaryLines.map((l) => `- ${l}`),
  ].join('\n');

  // Append to an existing note rather than replacing it: several dream cycles
  // can run in one day and each one's summary is worth keeping.
  if (fs.existsSync(filePath)) {
    return updateNodeInPlace(filePath, (data, body) => {
      data.updated = now;
      data.last_accessed = now;
      return { data, body: `${body.trimEnd()}\n\n${runBlock}\n` };
    }, { vaultDir, agentRole: 'system' });
  }

  // The frontmatter here used to be a hand-assembled YAML string, which is why
  // every daily note predates SSSS 0.9 universal frontmatter: a literal block
  // cannot pick up new required fields. prepareNodeForContract fills them.
  return writeNode({
    type: 'memory',
    slug: `daily-${today}`,
    category: 'daily',
    title: `Daily Note: ${today}`,
    description: `Dream-cycle summary for ${today}.`,
    status: 'active',
    confidence: 1.0,
    importance: 2,
    created: now,
    updated: now,
    last_accessed: now,
    source: { type: 'dream-cycle', session_id: `dream-${today}`, evidence_count: 1 },
    supersedes: [],
    superseded_by: null,
    contradicts: [],
    tags: ['daily', 'dream-cycle'],
    related: [],
    routes_to_skills: [],
    sentiment_polarity: 'descriptive',
    sentiment_target: 'system',
    modality: 'should',
    subject: 'system',
    predicate: 'ran',
    object: 'dream-cycle',
    decay: { half_life_days: 30, access_count: 0 },
    schema_version: 2,
    body: [`# Daily Note: ${today}`, '', runBlock, ''].join('\n'),
  }, vaultDir, { path: `daily/${today}.md`, agentRole: 'system' });
}
import { detectConflicts, quarantineConflict } from './steering.mjs';
import { compileSurface } from './surface.mjs';

/**
 * Delete only proposals that have reached a terminal state.
 *
 * The old code ran proposals through the same blind 3-day age prune as log
 * files, so every un-actioned proposal was destroyed before anyone could act on
 * it — which is a large part of why the feature looked harmless for so long: the
 * queue emptied itself. An open proposal is pending work and is never pruned by
 * age, and neither is a `rejected` tombstone; only `applied` and `superseded`
 * tickets expire.
 */
export function pruneResolvedProposals(proposalsDir, maxAgeMs, now = Date.now()) {
  if (!fs.existsSync(proposalsDir)) return 0;
  // `rejected` is deliberately NOT pruned by age: it is a tombstone that stops
  // the generator re-filing the same rejected proposal every cycle. Deleting it
  // reopens that leak on a 3-day timer. Only genuinely finished work expires.
  const resolved = new Set(['applied', 'superseded']);
  let removed = 0;
  let files;
  try {
    files = fs.readdirSync(proposalsDir).filter(f => f.endsWith('.md'));
  } catch {
    return 0;
  }
  for (const file of files) {
    const full = path.join(proposalsDir, file);
    try {
      if (now - fs.statSync(full).mtimeMs <= maxAgeMs) continue;
      const { data } = matter(fs.readFileSync(full, 'utf8'));
      // Unparseable or status-less files are left alone: deleting a proposal we
      // cannot read is exactly the silent data loss this function exists to stop.
      if (!resolved.has(data.status)) continue;
      fs.unlinkSync(full);
      removed++;
    } catch (err) {
      logger.debug('dream: skipping proposal during prune', { file, err: err.message });
    }
  }
  return removed;
}

/**
 * Phase 5: Automatic Storage & Memory Pruning.
 * Keeps the VFS local directories clean of old logs, draft files,
 * expired proposals, and temporary IDE session transcripts.
 */
export function autoPruneStorage(brainDir, vaultDir, conflictsDir) {
  const logsDir = path.join(brainDir, 'logs');
  const proposalsDir = path.join(vaultDir, 'proposals');
  const inboxDir = path.join(brainDir, 'memory-inbox');

  const logMaxAgeMs = 3 * 24 * 60 * 60 * 1000;      // Keep logs and proposals for 3 days
  const draftMaxAgeMs = 24 * 60 * 60 * 1000;        // Aggressively clear background drafts (like RLHF files) after 24 hours
  const now = Date.now();

  // Retrieve node slugs of active research projects so we never prune their drafts in progress
  const activeResearchSlugs = new Set();
  try {
    const queue = loadQueue();
    for (const item of queue) {
      if (item.status === 'pending' || item.status === 'in_progress') {
        if (item.node_slug) {
          activeResearchSlugs.add(item.node_slug);
        }
      }
    }
  } catch (err) {
    logger.warn('dream', `Failed to load active research queue during pruning: ${err.message}`);
  }

  const pruneDir = (dir, maxAge) => {
    if (!fs.existsSync(dir)) return;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          // Exempt active research drafts from pruning
          const baseName = path.basename(file, '.md');
          if (activeResearchSlugs.has(baseName)) {
            continue;
          }
          if (now - stat.mtimeMs > maxAge) {
            fs.unlinkSync(fullPath);
          }
        } else if (stat.isDirectory()) {
          pruneDir(fullPath, maxAge);
          if (fs.readdirSync(fullPath).length === 0) {
            fs.rmdirSync(fullPath);
          }
        }
      }
    } catch {}
  };

  pruneDir(logsDir, logMaxAgeMs);
  pruneResolvedProposals(proposalsDir, logMaxAgeMs, now);
  pruneDir(inboxDir, draftMaxAgeMs); // Keeps the local dev inbox fully clean of automatic research noise
  if (conflictsDir) pruneDir(conflictsDir, draftMaxAgeMs);

  // Prune scheduler tasks queue: move completed/failed ones to archive, delete archives older than logMaxAgeMs
  const tasksQueueDir = path.join(brainDir, 'scheduler', 'queue');
  const tasksArchiveDir = path.join(tasksQueueDir, 'archive');
  if (fs.existsSync(tasksQueueDir)) {
    try {
      if (!fs.existsSync(tasksArchiveDir)) {
        fs.mkdirSync(tasksArchiveDir, { recursive: true });
      }
      const files = fs.readdirSync(tasksQueueDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const fullPath = path.join(tasksQueueDir, file);
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const { data } = matter(raw);
          if (data.status === 'completed' || data.status === 'failed') {
            fs.renameSync(fullPath, path.join(tasksArchiveDir, file));
          }
        } catch (e) {
          // ignore parsing/permission errors for individual files
        }
      }

      const archiveFiles = fs.readdirSync(tasksArchiveDir);
      for (const file of archiveFiles) {
        if (!file.endsWith('.md')) continue;
        const fullPath = path.join(tasksArchiveDir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (now - stat.mtimeMs > logMaxAgeMs) {
            fs.unlinkSync(fullPath);
          }
        } catch (e) {
          // ignore
        }
      }
    } catch (err) {
      logger.warn('dream', `Failed to prune scheduler tasks: ${err.message}`);
    }
  }

  // Automatically prune transient planning files in every active/historical conversation folder,
  // while permanently preserving the conversations/threads themselves (.system_generated)
  try {
    const homeDir = process.env._TR_TEST_HOME_DIR || os.homedir();
    const agAppDir = path.join(homeDir, '.gemini', 'antigravity');
    const agBrainDir = path.join(agAppDir, 'brain');
    if (fs.existsSync(agBrainDir)) {
      const convs = fs.readdirSync(agBrainDir);
      for (const convId of convs) {
        const convPath = path.join(agBrainDir, convId);
        const convStat = fs.statSync(convPath);
        if (convStat.isDirectory()) {
          const rootFiles = fs.readdirSync(convPath);
          for (const item of rootFiles) {
            const itemPath = path.join(convPath, item);
            const itemStat = fs.statSync(itemPath);
            if (itemStat.isFile()) {
              const isTransientFile = item.endsWith('.md') || item.endsWith('.json');
              if (isTransientFile && now - itemStat.mtimeMs > draftMaxAgeMs) {
                fs.unlinkSync(itemPath);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    logger.warn('dream', `Failed to prune Antigravity transient conversation folders: ${err.message}`);
  }
}

import { 
  generateMemoryCleanupProposals,
  generateStaleKnowledgeRefreshProposals,
  evaluateProposalGate,
  dedupeProposals,
  refreshStaleKnowledge
} from './optimizer.mjs';
import { applyAcceptedProposals } from './proposal-applier.mjs';

const DREAM_PROMOTION_THRESHOLD = 0.7;

// Master switch for the stale-knowledge-refresh *ticket generator* (see PHASE 4).
// Disabled 2026-08-01 and superseded: staleness is now handled by
// refreshStaleKnowledge(), which enqueues research the daemon can actually
// perform instead of filing one .md per stale node every cycle (16,401 unread
// tickets at its peak). There is no reason to turn this back on.
const ENABLE_STALE_KNOWLEDGE_REFRESH = false;

/**
 * Phase 1: Light Sleep. Scan for modifications.
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
 * Load REM candidates from memory-inbox (pending + capture drafts).
 */
export function loadCandidatesFromInbox(brainDirPath) {
  const candidates = [];
  const roots = [
    path.join(brainDirPath, 'memory-inbox', 'pending'),
    path.join(brainDirPath, 'memory-inbox', 'capture'),
  ];

  for (const dir of roots) {
    if (!fs.existsSync(dir)) continue;
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf8');
        const { data, content } = matter(raw);
        if (!data || (!data.slug && !data.title && !String(content || '').trim())) continue;
        const status = data.status || 'draft';
        if (status === 'archived' || status === 'active') continue;
        candidates.push({
          ...data,
          slug: data.slug || path.basename(file, '.md'),
          category: data.category || 'facts',
          title: data.title || data.slug || file,
          status: 'draft',
          confidence: data.confidence ?? 0.55,
          importance: data.importance ?? 2,
          evidence_count: data.evidence_count || data.source?.evidence_count || 1,
          body: content,
          _inbox_path: path.join(dir, file),
        });
      } catch (err) {
        logger.warn('dream', `Inbox candidate skip ${file}: ${err.message}`);
      }
    }
  }
  return candidates;
}

/**
 * Lightweight session → candidate extraction (deterministic heuristics).
 * User lines that signal durable preferences/rules become draft candidates.
 */
export function loadCandidatesFromSessions(sessionsDir, { maxFiles = 8, maxCandidates = 20 } = {}) {
  const candidates = [];
  if (!fs.existsSync(sessionsDir)) return candidates;

  const signal =
    /\b(always|never|prefer|remember|must not|must|invariant|don't|do not|from now on)\b/i;

  let files = [];
  try {
    files = fs
      .readdirSync(sessionsDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => ({
        name: f,
        mtime: fs.statSync(path.join(sessionsDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, maxFiles);
  } catch {
    return candidates;
  }

  for (const file of files) {
    let lines;
    try {
      lines = fs.readFileSync(path.join(sessionsDir, file.name), 'utf8').split('\n').filter(Boolean);
    } catch {
      continue;
    }
    for (const line of lines) {
      if (candidates.length >= maxCandidates) return candidates;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const content = entry.content || entry.text || '';
      if (!content || content.length < 24 || content.length > 2000) continue;
      if (entry.type === 'tool_call') continue;
      const role = entry.role;
      if (role && role !== 'user' && role !== 'human') continue;
      if (!signal.test(content)) continue;

      const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 10);
      candidates.push({
        slug: `session-extract-${hash}`,
        category: 'preferences',
        title: content.slice(0, 80).replace(/\s+/g, ' '),
        status: 'draft',
        confidence: 0.55,
        importance: 3,
        evidence_count: 1,
        modality: /must not|never|don't|do not/i.test(content) ? 'must_not' : 'should',
        subject: 'user',
        predicate: 'prefers',
        object: 'behavior',
        tags: ['session-extract', 'dream-rem'],
        source: {
          type: 'session',
          session_id: path.basename(file.name, '.jsonl'),
          evidence_count: 1,
        },
        body: content,
      });
    }
  }
  return candidates;
}

/**
 * Collect all REM candidates (inbox + sessions). Dedupe by slug.
 */
export function collectRemCandidates({ brainDirPath, sessionsDir }) {
  const bySlug = new Map();
  for (const c of loadCandidatesFromInbox(brainDirPath)) {
    bySlug.set(c.slug, c);
  }
  for (const c of loadCandidatesFromSessions(sessionsDir)) {
    if (!bySlug.has(c.slug)) bySlug.set(c.slug, c);
  }
  return [...bySlug.values()];
}

/**
 * Phase 2: REM Sleep. Score nodes, check conflicts, promote/decay.
 */
export function evaluateCandidates(candidates, existingNodes, conflictsDir) {
  const promoted = [];
  const allConflicts = [];

  for (const candidate of candidates) {
    const conflicts = detectConflicts(candidate, existingNodes);

    if (conflicts.length > 0) {
      for (const c of conflicts) {
        quarantineConflict(c, conflictsDir);
      }
      allConflicts.push(...conflicts);
      continue;
    }

    const score = (candidate.evidence_count || 1) * 0.2 + (candidate.importance || 1) * 0.1;
    if (score >= DREAM_PROMOTION_THRESHOLD || candidate.confidence >= 0.8) {
      const node = {
        ...candidate,
        status: 'active',
        confidence: Math.min(1.0, (candidate.confidence || 0.5) + 0.1),
      };
      promoted.push(node);
      existingNodes.push(node);
    }
  }

  return { promoted, conflicted: allConflicts };
}

/**
 * Main Dream Cycle execution.
 */
export async function runDreamCycle({
  vaultDir, skillsDir, derivedDir, conflictsDir, instructionsFile
}) {
  const sessionsDir = path.join(brainDir, 'sessions');

  logger.info('dream', 'PHASE 0 — Session Ingestion (IDE Conversation Logs)');
  try {
    const { scanAndIngest } = await import('./session-watcher.mjs');
    const ingestResult = scanAndIngest(sessionsDir);
    logger.info('dream', `Ingested: ${ingestResult.ingested} new sessions`);
  } catch (err) {
    logger.warn('dream', `Session ingestion skipped: ${err.message}`);
  }

  logger.info('dream', 'PHASE 1 — Light Sleep (Scan)');
  const modified = scanModifiedVault(vaultDir);
  logger.info('dream', `Modified vault files: ${modified.length}`);

  const candidates = collectRemCandidates({
    brainDirPath: brainDir,
    sessionsDir,
  });
  logger.info('dream', `REM candidates collected: ${candidates.length}`);

  logger.info('dream', 'PHASE 2 — REM (Pattern Recognition)');
  const existingNodes = getNodes(vaultDir);
  const existingSlugs = new Set(existingNodes.map((n) => n.slug));
  // Skip candidates already active in vault
  const fresh = candidates.filter((c) => !existingSlugs.has(c.slug) || c.status === 'draft');

  let promotedCount = 0;
  let conflictedCount = 0;
  if (fresh.length > 0) {
    const { promoted, conflicted } = evaluateCandidates(fresh, existingNodes, conflictsDir);
    promotedCount = promoted.length;
    conflictedCount = conflicted.length;
    logger.info('dream', `Promoted: ${promoted.length} | Conflicts: ${conflicted.length}`);
    for (const node of promoted) {
      try {
        // Strip inbox-only fields before vault write
        const { body, _inbox_path, ...nodeFields } = node;
        const toWrite = {
          ...nodeFields,
          status: 'active',
          content: body || nodeFields.content,
        };
        await writeNode(toWrite, vaultDir);
        if (_inbox_path && fs.existsSync(_inbox_path)) {
          try {
            fs.unlinkSync(_inbox_path);
          } catch {}
        }
      } catch (err) {
        logger.warn('dream', `Promote write failed for ${node.slug}: ${err.message}`);
      }
    }
  } else {
    logger.info('dream', 'No new candidates to evaluate.');
  }

  logger.info('dream', 'PHASE 3 — Deep Sleep (Recompile Surface)');
  try {
    await compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile });
    logger.info('dream', 'Surface recompiled successfully');
  } catch (err) {
    logger.error('dream', `Deep Sleep compile failed: ${err.message}`);
  }

  logger.info('dream', 'PHASE 4 — Lucid Dreaming (Optimizer Proposals)');
  let proposalCount = 0;
  try {
    const cleanupProposals = await generateMemoryCleanupProposals(vaultDir);

    // Stale-knowledge-refresh generation is DISABLED. It filed one ticket per
    // high-importance node untouched for 30 days — ~600 of them — and nothing
    // in this system ever reads or applies a proposal, so every one was write-
    // only noise. Flip to true to re-enable; the dedupe gate below keeps it
    // bounded at one open ticket per target if you do.
    const staleProposals = ENABLE_STALE_KNOWLEDGE_REFRESH
      ? await generateStaleKnowledgeRefreshProposals(vaultDir)
      : [];

    // The generators are pure functions of vault state, so every cycle produces
    // the SAME proposals as the last one — a node stale on Monday is still stale
    // on Tuesday. Without this gate each cycle re-filed all of them under fresh
    // random slugs; the global vault accumulated 16,401 proposals for 594 real
    // targets (~28 copies each, ~5k/day) until proposals were 95% of the vault.
    const { kept: allProposals, suppressed } = dedupeProposals(
      [...cleanupProposals, ...staleProposals],
      vaultDir,
    );
    if (suppressed > 0) {
      logger.info('dream', `Suppressed ${suppressed} duplicate proposals (already open on disk).`);
    }

    if (allProposals.length > 0) {
      logger.info('dream', `Generated ${allProposals.length} optimization proposals.`);
      for (const p of allProposals) {
        // Pass vaultDir so the gate can verify the proposal against live state
        // rather than grading the optimizer's own rationale string.
        const passed = await evaluateProposalGate(p, null, vaultDir);
        logger.info('dream', `Proposal [${p.category}]: ${p.summary} -> ${p.status.toUpperCase()}`);
        // Contract write under vault root → proposals/<slug>.md
        await writeNode(p, vaultDir);
        if (passed) proposalCount++;
      }
    } else {
      logger.info('dream', 'No new proposals generated.');
    }

    // Consume what the gate accepted. Without this the whole phase is write-only:
    // proposals accumulated for months and the 3-day pruner deleted every one.
    const applied = await applyAcceptedProposals(vaultDir, { actor: 'dream' });
    if (applied.applied || applied.superseded || applied.failed) {
      logger.info('dream', `Applied ${applied.applied} proposals (${applied.superseded} superseded, ${applied.failed} failed).`);
    }
  } catch (err) {
    logger.error('dream', `Optimizer failed: ${err.message}`);
  }

  // Staleness is handled here rather than as proposals: the research daemon can
  // actually re-verify a stale node and commit the result, whereas a proposal
  // could only ask someone to. Rate-limited so the backlog drains over cycles.
  try {
    const { enqueued, stale } = await refreshStaleKnowledge(vaultDir);
    if (stale > 0) {
      logger.info('dream', `Staleness sweep: ${stale} stale nodes, ${enqueued.length} queued for research this cycle.`);
    }
  } catch (err) {
    logger.error('dream', `Staleness sweep failed: ${err.message}`);
  }

  // Write daily note summary (native SSSS node; Obsidian Daily Notes reads it directly)
  try {
    const existingNodes = getNodes(vaultDir);
    await writeDailyNote(vaultDir, [
      `Modified vault files scanned: ${modified.length}`,
      `REM candidates: ${candidates.length} (promoted ${promotedCount}, conflicted ${conflictedCount})`,
      `Active nodes: ${existingNodes.filter(n => n.status === 'active').length}`,
      `Proposals accepted: ${proposalCount}`,
    ]);
  } catch (err) {
    logger.error('dream', `Daily note write failed: ${err.message}`);
  }

  logger.info('dream', 'PHASE 5 — Automatic Storage & Memory Pruning');
  try {
    autoPruneStorage(brainDir, vaultDir, conflictsDir);
    logger.info('dream', 'Automated VFS storage pruning completed successfully');
  } catch (err) {
    logger.error('dream', `Storage pruning failed: ${err.message}`);
  }

  return { status: 'success' };
}

// ─── Standalone Daemon Execution ────────────────────────────────────────────────

import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const vaultDir = path.join(brainDir, 'memory-vault');
  const skillsDir = path.join(agentDir, 'skills');
  const derivedDir = path.join(brainDir, 'memory-derived');
  const conflictsDir = path.join(brainDir, 'memory-inbox', 'conflicts');
  const instructionsFile = path.join(agentDir, 'INSTRUCTIONS.md');

  logger.info('dream', 'Total Recall Dream Cycle Daemon Started');

  async function daemonLoop() {
    while (true) {
      try {
        await runDreamCycle({
          vaultDir, skillsDir, derivedDir, conflictsDir, instructionsFile
        });
      } catch (err) {
        logger.error('dream', 'Dream cycle iteration failed', { err: err.message });
      }
      // Sleep for 60 seconds before next cycle
      await new Promise(resolve => setTimeout(resolve, 60000));
    }
  }

  daemonLoop();
}
