import fs from 'fs';
import path from 'path';
import { loadNodes, writeNode, atomicWrite, walkMd } from './vault.mjs';
import { logger } from './logger.mjs';

/**
 * Write a daily dream-cycle summary to memory-vault/daily/YYYY-MM-DD.md.
 * SSSS node natively; Obsidian Daily Notes plugin reads these files directly.
 */
function writeDailyNote(vaultDir, summaryLines) {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const dailyDir = path.join(vaultDir, 'daily');
  if (!fs.existsSync(dailyDir)) fs.mkdirSync(dailyDir, { recursive: true });

  const filePath = path.join(dailyDir, `${today}.md`);

  if (fs.existsSync(filePath)) {
    // Append this run's summary to the existing note
    const existing = fs.readFileSync(filePath, 'utf8');
    const runBlock = `\n## Dream Cycle – ${now}\n\n${summaryLines.map(l => `- ${l}`).join('\n')}\n`;
    atomicWrite(filePath, existing.trimEnd() + runBlock);
    return;
  }

  const frontmatter = [
    '---',
    'type: memory',
    `slug: "daily-${today}"`,
    'category: daily',
    `title: "Daily Note: ${today}"`,
    'status: active',
    'confidence: 1.0',
    'importance: 2',
    `created: "${now}"`,
    `updated: "${now}"`,
    `last_accessed: "${now}"`,
    'source:',
    '  type: dream-cycle',
    `  session_id: "dream-${today}"`,
    '  evidence_count: 1',
    'supersedes: []',
    'superseded_by: null',
    'contradicts: []',
    'tags: [daily, dream-cycle]',
    'related: []',
    'routes_to_skills: []',
    'sentiment_polarity: descriptive',
    'sentiment_target: system',
    'modality: should',
    'subject: system',
    'predicate: ran',
    'object: dream-cycle',
    'decay:',
    '  half_life_days: 30',
    '  access_count: 0',
    'schema_version: 2',
    '---',
    ''
  ].join('\n');

  const body = [
    `# Daily Note: ${today}`,
    '',
    `## Dream Cycle – ${now}`,
    '',
    ...summaryLines.map(l => `- ${l}`),
    ''
  ].join('\n');

  atomicWrite(filePath, frontmatter + body);
}
import { detectConflicts, quarantineConflict } from './steering.mjs';
import { compileSurface } from './surface.mjs';
import { 
  generateMemoryCleanupProposals, 
  generateStaleKnowledgeRefreshProposals,
  evaluateProposalGate
} from './optimizer.mjs';

const DREAM_PROMOTION_THRESHOLD = 0.7;

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
  const agentDir = path.dirname(vaultDir);
  const sessionsDir = path.join(agentDir, 'sessions');

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

  // In a real system, we'd extract candidates from sessions. For now, we simulate.
  const candidates = []; 

  logger.info('dream', 'PHASE 2 — REM (Pattern Recognition)');
  const existingNodes = loadNodes(vaultDir);
  
  if (candidates.length > 0) {
    const { promoted, conflicted } = evaluateCandidates(candidates, existingNodes, conflictsDir);
    logger.info('dream', `Promoted: ${promoted.length} | Conflicts: ${conflicted.length}`);
    for (const node of promoted) {
      writeNode(node, vaultDir);
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
    const proposalsDir = path.join(vaultDir, 'proposals');
    if (!fs.existsSync(proposalsDir)) fs.mkdirSync(proposalsDir, { recursive: true });

    const cleanupProposals = await generateMemoryCleanupProposals(vaultDir);
    const staleProposals = await generateStaleKnowledgeRefreshProposals(vaultDir);
    const allProposals = [...cleanupProposals, ...staleProposals];

    if (allProposals.length > 0) {
      logger.info('dream', `Generated ${allProposals.length} optimization proposals.`);
      for (const p of allProposals) {
        const passed = await evaluateProposalGate(p, null);
        logger.info('dream', `Proposal [${p.category}]: ${p.summary} -> ${passed ? 'ACCEPTED' : 'REJECTED'}`);
        writeNode(p, proposalsDir);
        if (passed) proposalCount++;
      }
    } else {
      logger.info('dream', 'No new proposals generated.');
    }
  } catch (err) {
    logger.error('dream', `Optimizer failed: ${err.message}`);
  }

  // Write daily note summary (native SSSS node; Obsidian Daily Notes reads it directly)
  try {
    const existingNodes = loadNodes(vaultDir);
    writeDailyNote(vaultDir, [
      `Modified vault files scanned: ${modified.length}`,
      `Active nodes: ${existingNodes.filter(n => n.status === 'active').length}`,
      `Proposals accepted: ${proposalCount}`,
    ]);
  } catch (err) {
    logger.error('dream', `Daily note write failed: ${err.message}`);
  }

  return { status: 'success' };
}

// ─── Standalone Daemon Execution ────────────────────────────────────────────────

import { fileURLToPath } from 'url';
import os from 'os';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const AGENT_DIR = path.join(os.homedir(), '.agent');
  const vaultDir = path.join(AGENT_DIR, 'memory-vault');
  const skillsDir = path.join(AGENT_DIR, 'skills');
  const derivedDir = path.join(AGENT_DIR, 'memory-derived');
  const conflictsDir = path.join(AGENT_DIR, 'memory-inbox', 'conflicts');
  const instructionsFile = path.join(AGENT_DIR, 'INSTRUCTIONS.md');

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
