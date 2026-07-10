/**
 * Total Recall Active Intelligence Daemon Loop — v2 (Deterministic)
 *
 * A deterministic automation engine that runs crons, manages the research
 * queue, ingests sessions, and maintains the skill folder. No local LLM required.
 *
 * Phases per tick:
 *   1. Ingest new IDE conversation logs
 *   2. Load/refresh task queue from disk
 *   3. Dispatch next task (deterministic only — no LLM tasks)
 *   4. Periodically recompile surfaces
 *
 * This script is spawned by `total-recall daemon start` and runs until killed.
 */

import path from 'path';
import fs from 'fs';
import { createScheduler, updateTaskStatus } from './scheduler.mjs';
import { scanAndIngest } from './session-watcher.mjs';
import { logger } from './logger.mjs';
import { updateQueueItem, loadQueue } from './research-queue.mjs';
import { execFileSync } from "node:child_process";
import { agentDir, brainDir } from './config.mjs';
import { runCrons } from './crons.mjs';

const AGENT_DIR = agentDir;
const BRAIN_DIR = brainDir;
const VAULT_DIR = path.join(BRAIN_DIR, 'memory-vault');
const SKILLS_DIR = path.join(AGENT_DIR, 'skills');
const DERIVED_DIR = path.join(BRAIN_DIR, 'memory-derived');
const CONFLICTS_DIR = path.join(BRAIN_DIR, 'memory-inbox', 'conflicts');
const SESSIONS_DIR = path.join(BRAIN_DIR, 'sessions');
const QUEUE_DIR = path.join(BRAIN_DIR, 'scheduler', 'queue');
const INSTRUCTIONS_FILE = path.join(BRAIN_DIR, 'INSTRUCTIONS.md');

// How often to recompile surfaces (every N task ticks)
const RECOMPILE_EVERY_N_TASKS = 20;

// Pause between task iterations (ms)
const TASK_SLEEP_MS = 10000;

// ─── Tasks are no longer skipped to conserve resources. We use CLI agents! ───

async function dispatchTask(task) {
  const category = task.category;

  try {
    const { loadRuntimeConfig } = await import('./runtime.mjs');
    const runtimeConfig = await loadRuntimeConfig();

    // ─── Portfolio Sync ───
    if (task._is_portfolio_sync || task.slug.startsWith('portfolio-sync-')) {
      const { runSync } = await import('./portfolio-sync.mjs');
      await runSync();
      return { success: true, output: 'Portfolio sync completed' };
    }

    // ─── Research & Proactive Tasks (LLM + Fetching) ───
    if (task.slug.startsWith('research-') || category === 'proactive-research' || category === 'research-acquisition') {
      if (task.slug.startsWith('staleness-check-')) {
         const { runStalenessCheck } = await import('./clarity-rewriter.mjs');
         const result = await runStalenessCheck(task.target, { vaultDir: VAULT_DIR, queueDir: QUEUE_DIR, runtimeConfig });
         return { success: true, output: `Staleness check complete: ${result.verdict} (conf: ${result.confidence})` };
      }
      return await runResearchTask(task, runtimeConfig);
    }
    
    // ─── System 2 Inference ───
    if (category === 'system2-deliberation') {
      const { runInferenceTask } = await import('./inference-engine.mjs');
      const slugs = task.target ? task.target.split(',') : [];
      const result = await runInferenceTask(slugs, {
        vaultDir: VAULT_DIR,
        inboxDir: path.join(BRAIN_DIR, 'memory-inbox', 'pending'),
        runtimeConfig
      });
      return { success: true, output: `Inference complete: ${result.conclusions?.length || 0} conclusions` };
    }

    // ─── Cutoff Audit ───
    if (category === 'cutoff-audit' || task.slug.startsWith('cutoff-audit-')) {
      const { runCutoffAudit } = await import('./clarity-rewriter.mjs');
      const result = await runCutoffAudit({ vaultDir: VAULT_DIR, queueDir: QUEUE_DIR, runtimeConfig });
      return { success: true, output: `Cutoff audit complete: ${result.audited} audited, ${result.flagged} flagged, ${result.critical} critical` };
    }

    // ─── Self Diagnosis & Conscious Enforcement ───
    if (category === 'conscious-enforcement' || task.slug.includes('self-diagnosis')) {
      if (task.slug.startsWith('post-mortem-')) {
        const { runPostMortem } = await import('./post-mortem.mjs');
        const sessionPath = path.join(brainDir, 'sessions', task.target);
        const result = await runPostMortem(sessionPath, { vaultDir: VAULT_DIR, inboxDir: path.join(BRAIN_DIR, 'memory-inbox', 'pending'), runtimeConfig });
        return { success: true, output: `Post-mortem complete: ${result.nodesCreated || 0} nodes extracted` };
      }

      if (task.slug.includes('self-diagnosis')) {
        const { runSelfDiagnosis } = await import('./fact-seeker.mjs');
        await runSelfDiagnosis({ vaultDir: VAULT_DIR, runtimeConfig });
        return { success: true, output: `Self-diagnosis complete` };
      }
      return { success: true, output: `Conscious enforcement handled` };
    }

    // ─── Memory Maintenance ───
    if (category === 'memory-maintenance') {
      if (task.slug.startsWith('clarity-review-')) {
        const { runClarityReview } = await import('./clarity-rewriter.mjs');
        const result = await runClarityReview(task.target, { vaultDir: VAULT_DIR, inboxDir: path.join(BRAIN_DIR, 'memory-inbox', 'pending'), runtimeConfig });
        return { success: true, output: `Clarity review complete: rewrote=${result.rewrote}` };
      }
      if (task.slug.startsWith('memory-compaction-')) {
        const { runMemoryCompaction } = await import('./fact-seeker.mjs');
        const result = await runMemoryCompaction({ vaultDir: VAULT_DIR, inboxDir: path.join(BRAIN_DIR, 'memory-inbox', 'pending'), runtimeConfig });
        return { success: true, output: `Memory compaction complete. Consolidated nodes: ${result.consolidatedCount || 0}` };
      }
      return await runMaintenanceTask(task);
    }

    logger.info({
      subsystem: 'daemon-loop',
      message: `Skipping unhandled task category: ${task.slug} [${category}]`,
    });
    return { success: true, output: 'Skipped unhandled task' };
  } catch (err) {
    logger.info({
      subsystem: 'daemon-loop',
      message: `Task ${task.slug} failed: ${err.message}`,
    });
    return { success: false, error: err.message };
  }
}

// ─── Research Engine (Web Fetching Only — No LLM Synthesis) ─────────────────────

async function runResearchTask(task, runtimeConfig) {
  const inboxDir = path.join(BRAIN_DIR, 'memory-inbox', 'pending');

  // Phase 1: Knowledge acquisition
  if (task.slug.startsWith('research-acquisition-') || task.category === 'proactive-research' || task.slug.includes('fact-seeker') || task.slug.includes('knowledge-acquisition')) {
    const { runKnowledgeAcquisitionCycle } = await import('./fact-seeker.mjs');
    const forceTopic = task.target || null;
    const result = await runKnowledgeAcquisitionCycle({
      vaultDir: VAULT_DIR,
      inboxDir,
      queueDir: QUEUE_DIR,
      forceTopic,
      skillsDir: SKILLS_DIR,
      derivedDir: DERIVED_DIR,
      instructionsFile: INSTRUCTIONS_FILE,
      runtimeConfig
    });
    if (result.skipped) return { success: true, output: `Knowledge acquisition: ${result.skipped}` };
    const surfaceNote = result.surfaced ? ' [SURFACED]' : ' [staged]';
    return {
      success: true,
      output: `Researched "${result.topic}": ${result.sources?.join(', ')} | confidence: ${result.confidence || 'n/a'} | slug: ${result.factSlug}${surfaceNote}`,
      factSlug: result.factSlug,
    };
  }

  // Phase 2: Deliberation
  if (task.slug.startsWith('research-deliberation-')) {
    const { runResearchDeliberationCycle } = await import('./fact-seeker.mjs');
    const result = await runResearchDeliberationCycle({
      vaultDir: VAULT_DIR,
      nodeSlug: task._node_slug || 'pending',
      topic: task.title || task.target || 'Unknown Topic',
      runtimeConfig
    });
    return { success: true, output: `Deliberation complete: ${result.slug || 'done'}` };
  }

  // Phase 3: Improvement
  if (task.slug.startsWith('research-improvement-')) {
    const { runResearchImprovementCycle } = await import('./fact-seeker.mjs');
    const result = await runResearchImprovementCycle({
      vaultDir: VAULT_DIR,
      nodeSlug: task._node_slug || 'pending',
      topic: task.title || task.target || 'Unknown Topic',
      runtimeConfig
    });
    return { success: true, output: `Improvement complete` };
  }

  // Phase 4: Monitoring
  if (task.slug.startsWith('research-monitoring-')) {
    const { runResearchMonitoringCycle } = await import('./fact-seeker.mjs');
    const result = await runResearchMonitoringCycle({
      vaultDir: VAULT_DIR,
      nodeSlug: task._node_slug || 'pending',
      topic: task.title || task.target || 'Unknown Topic',
      runtimeConfig,
      skillsDir: SKILLS_DIR,
      derivedDir: DERIVED_DIR,
      instructionsFile: INSTRUCTIONS_FILE
    });
    return { success: true, output: `Monitoring complete` };
  }

  // Phase 5: Expansion
  if (task.slug.startsWith('research-expansion-')) {
    const { runResearchExpansionCycle } = await import('./fact-seeker.mjs');
    const result = await runResearchExpansionCycle({
      vaultDir: VAULT_DIR,
      nodeSlug: task._node_slug || 'pending',
      topic: task.title || task.target || 'Unknown Topic',
      runtimeConfig
    });
    return { success: true, output: `Expansion complete` };
  }

  // Conclusion writer — validate pending drafts (deterministic checks)
  if (task.slug.includes('validate')) {
    const { runConclusionWriter } = await import('./conclusion-writer.mjs');
    const result = await runConclusionWriter({
      inboxDir,
      vaultDir: VAULT_DIR,
      quarantineDir: path.join(BRAIN_DIR, 'memory-inbox', 'quarantine'),
    });
    if (result.skipped) return { success: true, output: `Conclusion writer: ${result.skipped}` };
    return {
      success: true,
      output: `Validated ${result.processed} drafts: ${result.approved} approved, ${result.rejected} rejected`,
    };
  }

  return { success: true, output: 'No-op research task' };
}

// ─── Maintenance Engine (Deterministic Only) ────────────────────────────────────

async function runMaintenanceTask(task) {
  // Lease vacuuming — purely filesystem, no LLM
  try {
    const leasesDir = path.join(BRAIN_DIR, 'leases');
    if (fs.existsSync(leasesDir)) {
      const workspaces = fs.readdirSync(leasesDir);
      for (const ws of workspaces) {
        const wsDir = path.join(leasesDir, ws);
        if (!fs.statSync(wsDir).isDirectory()) continue;
        const files = fs.readdirSync(wsDir);
        for (const file of files) {
          if (!file.endsWith('.lease.json')) continue;
          const fp = path.join(wsDir, file);
          try {
            const lease = JSON.parse(fs.readFileSync(fp, 'utf8'));
            if (new Date(lease.expires_at) < new Date()) {
              fs.unlinkSync(fp);
              logger.info({ subsystem: 'daemon-loop', message: `Vacuumed expired lease: ${fp}` });
            }
          } catch {
            try { fs.unlinkSync(fp); } catch {}
          }
        }
      }
    }
  } catch (err) {
    logger.info({ subsystem: 'daemon-loop', message: `Lease vacuuming failed: ${err.message}` });
  }

  return { success: true, output: 'Maintenance complete' };
}

// ─── Interrupt Writer ───────────────────────────────────────────────────────────

/**
 * Write an interrupt to the SKILL.md file so the agent picks it up on next turn.
 * Replaces the old interrupts/pending.md approach.
 */
export function writeInterrupt(message) {
  const skillMdPath = path.join(SKILLS_DIR, 'total-recall', 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return;

  const content = fs.readFileSync(skillMdPath, 'utf8');
  const marker = '<!-- daemon writes below this line, agent clears after reading -->';
  const idx = content.indexOf(marker);
  if (idx === -1) return;

  const insertPoint = idx + marker.length;
  const timestamp = new Date().toISOString();
  const interrupt = `\n🔔 **[${timestamp}]** ${message}`;

  const updated = content.slice(0, insertPoint) + interrupt + content.slice(insertPoint);
  fs.writeFileSync(skillMdPath, updated);

  logger.info({ subsystem: 'daemon-loop', message: `Interrupt written to SKILL.md: ${message}` });
}

// ─── Main Daemon Loop ───────────────────────────────────────────────────────────

let taskCount = 0;
let running = true;

process.on('SIGTERM', () => {
  logger.info({ subsystem: 'daemon-loop', message: 'SIGTERM received — shutting down gracefully' });
  running = false;
});

process.on('SIGINT', () => {
  logger.info({ subsystem: 'daemon-loop', message: 'SIGINT received — shutting down gracefully' });
  running = false;
});

process.on('uncaughtException', (err) => {
  logger.error({ subsystem: 'daemon-loop', message: `Uncaught Exception (suppressed to keep daemon alive): ${err.stack || err.message}` });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ subsystem: 'daemon-loop', message: `Unhandled Rejection (suppressed to keep daemon alive): ${reason}` });
});

async function main() {
  logger.info({
    subsystem: 'daemon-loop',
    message: `Deterministic Daemon starting. Vault: ${VAULT_DIR}`,
  });

  // Initial session ingest
  try {
    const ingestResult = scanAndIngest(SESSIONS_DIR);
    logger.info({
      subsystem: 'daemon-loop',
      message: `Boot ingest: ${ingestResult.ingested} new sessions`,
    });
  } catch (err) {
    logger.info({ subsystem: 'daemon-loop', message: `Boot ingest failed: ${err.message}` });
  }

  while (running) {
    try {
      // Periodically recompile surfaces
      if (taskCount > 0 && taskCount % RECOMPILE_EVERY_N_TASKS === 0) {
        logger.info({ subsystem: 'daemon-loop', message: 'Running scheduled surface recompile...' });
        try {
          const { compileSurface } = await import('./surface.mjs');
          await compileSurface({
            vaultDir: VAULT_DIR,
            skillsDir: SKILLS_DIR,
            derivedDir: DERIVED_DIR,
            instructionsFile: INSTRUCTIONS_FILE,
          });
        } catch (err) {
          logger.info({ subsystem: 'daemon-loop', message: `Surface recompile error: ${err.message}` });
        }

        // Compact any append logs with accumulated dirty entries
        try {
          const { compactAppendLogs } = await import('./append-log.mjs');
          const compactResult = compactAppendLogs();
          if (compactResult.logs_compacted > 0) {
            logger.info({ subsystem: 'daemon-loop', message: `Compacted ${compactResult.logs_compacted} append logs (${compactResult.total_entries} entries)` });
          }
        } catch (err) {
          logger.info({ subsystem: 'daemon-loop', message: `Append log compaction error: ${err.message}` });
        }

        // Execute background ecosystem CRONs (Code scan, GitHub sync, Obsidian sync)
        try {
          await runCrons({ vaultDir: VAULT_DIR, skillsDir: SKILLS_DIR, brainDir: BRAIN_DIR });
        } catch (err) {
          logger.error({ subsystem: 'daemon-loop', message: `Cron execution failed: ${err.message}` });
        }
      }

      // Refresh scheduler from disk on each iteration
      const scheduler = createScheduler({
        queueDir: QUEUE_DIR,
        vaultDir: VAULT_DIR,
        sessionsDir: SESSIONS_DIR,
      });

      const { task, source } = scheduler.next();
      taskCount++;

      logger.info({
        subsystem: 'daemon-loop',
        message: `Task #${taskCount} [${source}] ${task.category}: ${task.slug}`,
      });

      // Mark in-progress
      if ((source === 'explicit' || source === 'idle') && task._filepath) {
        try {
          updateTaskStatus(task, 'in-progress', QUEUE_DIR);
        } catch (statusErr) {
          logger.info({
            subsystem: 'daemon-loop',
            message: `Failed to mark task in-progress (non-fatal): ${statusErr.message}`,
          });
        }
      }
      if (task._research_id) {
        try {
          updateQueueItem(task._research_id, { status: 'in_progress' });
        } catch (err) {
          logger.error({
            subsystem: 'daemon-loop',
            message: `Failed to update research queue status: ${err.message}`,
          });
        }
      }

      const result = await dispatchTask(task);

      // Mark complete
      if ((source === 'explicit' || source === 'idle') && task._filepath) {
        try {
          if (result.skippedLLM) {
            updateTaskStatus(task, 'pending', QUEUE_DIR);
          } else if (result.success) {
            updateTaskStatus(task, 'completed', QUEUE_DIR);
          } else {
            // Dead Letter Queue / Retry Logic with exponential backoff
            task.retry_count = (task.retry_count || 0) + 1;
            task.last_error = result.error || 'Unknown error';
            if (task.retry_count >= 3) {
              logger.info({ subsystem: 'daemon-loop', message: `Task ${task.slug} failed ${task.retry_count} times. Moving to DLQ (failed). Last error: ${task.last_error}` });
              updateTaskStatus(task, 'failed', QUEUE_DIR, result.error || 'Unknown error');
            } else {
              const backoffMs = Math.min(Math.pow(2, task.retry_count) * 1000, 60000);
              logger.info({ subsystem: 'daemon-loop', message: `Task ${task.slug} failed. Retry ${task.retry_count}/3 after ${backoffMs}ms backoff. Error: ${task.last_error}` });
              updateTaskStatus(task, 'pending', QUEUE_DIR, result.error || 'Unknown error');
              await new Promise(r => setTimeout(r, backoffMs));
            }
          }
        } catch (statusErr) {
          logger.info({
            subsystem: 'daemon-loop',
            message: `Failed to mark task complete (non-fatal): ${statusErr.message}`,
          });
        }
      }
      if (task._research_id) {
        try {
          const patch = {
            status: result.success ? 'pending' : 'failed',
            // Append the output rather than completely overwriting the original rationale
            notes: result.output ? `Phase output: ${result.output}` : (result.error || null),
          };
          if (result.factSlug) {
            patch.node_slug = result.factSlug;
          }
          // If the task was skipped because it requires an LLM, DO NOT complete the research project.
          if (result.skippedLLM) {
            patch.status = 'pending';
          } else if (result.success) {
            if (task._research_phase === 'acquisition' && !result.factSlug) {
              patch.status = 'failed';
              patch.notes = 'No insights found during acquisition.';
            } else if (task._research_phase === 'acquisition') {
              patch.status = 'pending';
              patch.research_phase = 'deliberation';
              patch.completed_at = new Date().toISOString();
            } else if (task._research_phase === 'deliberation') {
              patch.status = 'pending';
              patch.research_phase = 'improvement';
            } else if (task._research_phase === 'improvement') {
              patch.status = 'pending';
              patch.research_phase = 'monitoring';
            } else if (task._research_phase === 'monitoring') {
              patch.status = 'pending';
              patch.research_phase = 'expansion';
            } else if (task._research_phase === 'expansion') {
              patch.status = 'done';
              patch.completed_at = new Date().toISOString();
            }
          }
          updateQueueItem(task._research_id, patch);
        } catch (err) {
          logger.error({
            subsystem: 'daemon-loop',
            message: `Failed to update research queue status: ${err.message}`,
          });
        }
      }

      logger.info({
        subsystem: 'daemon-loop',
        message: `Task #${taskCount} done: ${result.output || result.error || 'ok'}`,
      });

      // Throttle to protect local resources
      await new Promise(r => setTimeout(r, TASK_SLEEP_MS));

    } catch (loopErr) {
      // Individual task failures must NEVER kill the daemon.
      logger.info({
        subsystem: 'daemon-loop',
        message: `Task loop iteration crashed (non-fatal, continuing): ${loopErr.message}`,
      });
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  logger.info({ subsystem: 'daemon-loop', message: 'Deterministic Daemon stopped.' });
}

main().catch(async (err) => {
  logger.info({ subsystem: 'daemon-loop', message: `Fatal error: ${err.message}` });

  try {
    const { writeEmergencyAlert } = await import('./emergency-alerts.mjs');
    writeEmergencyAlert(
      `The Daemon has CRASHED with a fatal error: ${err.message}. ` +
      `No background automation is running. ` +
      `Restart with: node bin/total-recall.mjs daemon start`
    );
  } catch {
    // If even the alert system fails, we still exit
  }

  process.exit(1);
});
