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

// ─── Categories that require LLM (skipped in deterministic mode) ────────────────

const LLM_REQUIRED_CATEGORIES = new Set([
  'system2-deliberation',
  'conscious-enforcement',
  'cutoff-audit',
]);

/**
 * Check if a task requires an LLM to execute.
 * These tasks are skipped — the daemon is deterministic.
 */
function requiresLLM(task) {
  if (LLM_REQUIRED_CATEGORIES.has(task.category)) return true;

  const slug = task.slug;
  if (slug.startsWith('research-deliberation-')) return true;
  if (slug.startsWith('research-improvement-')) return true;
  if (slug.startsWith('research-monitoring-')) return true;
  if (slug.startsWith('research-expansion-')) return true;
  if (slug.includes('self-diagnosis')) return true;
  if (slug.includes('clarity-review')) return true;
  if (slug.includes('staleness-check')) return true;
  if (slug.includes('inference')) return true;
  if (slug.includes('post-mortem')) return true;
  if (slug.includes('compliance')) return true;

  return false;
}

/**
 * Dispatch a task to the appropriate engine.
 * Only deterministic (non-LLM) tasks are executed.
 */
async function dispatchTask(task) {
  const category = task.category;

  try {
    switch (category) {
      case 'memory-maintenance':
        return await runMaintenanceTask(task);

      case 'proactive-research':
      case 'research-acquisition':
        return await runResearchTask(task);

      default:
        // All other categories (research, deliberation, inference, etc.)
        // require LLM and are handled by IDE agents, not the daemon.
        logger.info({
          subsystem: 'daemon-loop',
          message: `Skipping task (not deterministic): ${task.slug} [${category}]`,
        });
        return { success: true, output: 'Skipped — handled by IDE agents' };
    }
  } catch (err) {
    logger.info({
      subsystem: 'daemon-loop',
      message: `Task ${task.slug} failed: ${err.message}`,
    });
    return { success: false, error: err.message };
  }
}

// ─── Research Engine (Web Fetching Only — No LLM Synthesis) ─────────────────────

async function runResearchTask(task) {
  const inboxDir = path.join(BRAIN_DIR, 'memory-inbox', 'pending');

  // Knowledge acquisition — fetch from web, save raw results
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
    });
    if (result.skipped) return { success: true, output: `Knowledge acquisition: ${result.skipped}` };
    const surfaceNote = result.surfaced ? ' [SURFACED]' : ' [staged]';
    return {
      success: true,
      output: `Researched "${result.topic}": ${result.sources?.join(', ')} | confidence: ${result.confidence || 'n/a'} | slug: ${result.factSlug}${surfaceNote}`,
      factSlug: result.factSlug,
    };
  }

  // Conclusion writer — validate pending drafts (deterministic checks)
  if (task.slug.includes('validate') || task.category === 'research-acquisition') {
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
          updateTaskStatus(task, result.success ? 'completed' : 'failed', QUEUE_DIR);
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
            notes: result.output || result.error || null,
          };
          if (result.factSlug) {
            patch.node_slug = result.factSlug;
          }
          // Only advance through acquisition phase — skip LLM phases
          if (result.success && task._research_phase === 'acquisition' && result.factSlug) {
            // Research stays in acquisition — no LLM phases to advance to
            patch.status = 'done';
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
