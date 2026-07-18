/**
 * Total Recall Active Intelligence Daemon Loop — v3
 *
 * Durable worker over the open task envelope queue.
 * - Dispatches via executor registry (fail-loud on unknown)
 * - Does NOT invent idle work unless TR_IDLE_TASKS=1
 * - Periodically runs dream (system memory consolidation)
 * - Ingests sessions on boot; recompiles surfaces every N ticks
 * - Auto-syncs all .md files from registered repos into Total Recall
 *
 * Spawned by `total-recall daemon start`.
 */

import path from 'path';
import fs from 'fs';
import { createScheduler, updateTaskStatus, persistTaskToDisk } from './scheduler.mjs';
import { scanAndIngest } from './session-watcher.mjs';
import { syncAllRepos } from './repo-sync.mjs';
import { logger } from './logger.mjs';
import { updateQueueItem } from './research-queue.mjs';
import { agentDir, brainDir } from './config.mjs';
import { runCrons } from './crons.mjs';
import { dispatchTask as registryDispatch } from './task-executors.mjs';
import { buildTaskEnvelope } from './task-envelope.mjs';

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

// Empty-queue sleep (ms) — longer when idle so we don't spin
const TASK_SLEEP_MS = 10000;
const EMPTY_SLEEP_MS = 30000;

// Run a system dream every N empty ticks (memory consolidation without busy-work)
const DREAM_EVERY_N_EMPTY = 20;

function executorContext(runtimeConfig) {
  return {
    brainDir: BRAIN_DIR,
    vaultDir: VAULT_DIR,
    skillsDir: SKILLS_DIR,
    derivedDir: DERIVED_DIR,
    sessionsDir: SESSIONS_DIR,
    queueDir: QUEUE_DIR,
    conflictsDir: CONFLICTS_DIR,
    instructionsFile: INSTRUCTIONS_FILE,
    runtimeConfig,
  };
}

async function dispatchTask(task) {
  try {
    const { loadRuntimeConfig } = await import('./runtime.mjs');
    const runtimeConfig = await loadRuntimeConfig();
    return await registryDispatch(task, executorContext(runtimeConfig));
  } catch (err) {
    logger.info({
      subsystem: 'daemon-loop',
      message: `Task ${task.slug} failed: ${err.message}`,
    });
    return { success: false, error: err.message };
  }
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

// ─── PID Lockfile ───────────────────────────────────────────────────────────────

const PID_FILE = path.join(BRAIN_DIR, 'daemon.pid');

/**
 * Attempt to acquire the PID lockfile. If another daemon is alive, exit.
 * This is process metadata, not application state — uses raw fs, not SSSS.
 */
export function acquirePidLock() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const existingPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (existingPid && !isNaN(existingPid)) {
        try {
          process.kill(existingPid, 0); // Check if process is alive (signal 0 = no-op check)
          logger.error({
            subsystem: 'daemon-loop',
            message: `Another daemon is already running (PID: ${existingPid}). Exiting.`,
          });
          process.exit(1);
        } catch {
          // Process is dead — stale PID file
          logger.info({
            subsystem: 'daemon-loop',
            message: `Stale PID file found (PID: ${existingPid} is dead). Overwriting.`,
          });
        }
      }
    }
  } catch {
    // PID file doesn't exist or can't be read — proceed
  }

  fs.writeFileSync(PID_FILE, String(process.pid), { mode: 0o644 });
  logger.info({ subsystem: 'daemon-loop', message: `PID lockfile acquired: ${PID_FILE} (PID: ${process.pid})` });
}

export function releasePidLock() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const storedPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (storedPid === process.pid) {
        fs.unlinkSync(PID_FILE);
        logger.info({ subsystem: 'daemon-loop', message: 'PID lockfile released.' });
      }
    }
  } catch {
    // Best-effort cleanup
  }
}

// ─── Main Daemon Loop ───────────────────────────────────────────────────────────

let taskCount = 0;
let running = true;
let vaultWatcher = null;

import { releaseLease } from './leader-election.mjs';

process.on('SIGTERM', async () => {
  logger.info({ subsystem: 'daemon-loop', message: 'SIGTERM received — shutting down gracefully' });
  if (vaultWatcher) vaultWatcher.stop();
  await releaseLease();
  releasePidLock();
  running = false;
});

process.on('SIGINT', async () => {
  logger.info({ subsystem: 'daemon-loop', message: 'SIGINT received — shutting down gracefully' });
  if (vaultWatcher) vaultWatcher.stop();
  await releaseLease();
  releasePidLock();
  running = false;
});

process.on('uncaughtException', (err) => {
  logger.error({ subsystem: 'daemon-loop', message: `Uncaught Exception (suppressed to keep daemon alive): ${err.stack || err.message}` });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ subsystem: 'daemon-loop', message: `Unhandled Rejection (suppressed to keep daemon alive): ${reason}` });
});

async function main() {
  // ─── PID Lock: prevent duplicate daemons ───
  acquirePidLock();

  logger.info({
    subsystem: 'daemon-loop',
    message: `Daemon starting (open task envelope). Vault: ${VAULT_DIR} idle=${process.env.TR_IDLE_TASKS === '1' ? 'on' : 'off'}`,
  });

  // Start vault watcher
  try {
    const { startVaultWatcher } = await import('./vault-watcher.mjs');
    vaultWatcher = startVaultWatcher(VAULT_DIR, SKILLS_DIR, DERIVED_DIR, SESSIONS_DIR, INSTRUCTIONS_FILE);
  } catch (err) {
    logger.info({ subsystem: 'daemon-loop', message: `Failed to start vault watcher: ${err.message}` });
  }

  // Start source watcher (auto-regenerates repo-expert on code changes)
  try {
    const { detectProjectBrain } = await import('./config.mjs');
    const project = detectProjectBrain();
    if (project && project.projectRoot) {
      const { startSourceWatcher } = await import('./source-watcher.mjs');
      startSourceWatcher(project.projectRoot, SKILLS_DIR);
    }
  } catch (err) {
    logger.info({ subsystem: 'daemon-loop', message: `Failed to start source watcher: ${err.message}` });
  }

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

  // Initial repo sync — auto-ingest all .md files from registered repos
  try {
    const syncResult = syncAllRepos();
    logger.info({
      subsystem: 'daemon-loop',
      message: `Boot repo-sync: ${syncResult.totalIngested} new files across ${syncResult.repos.length} repos`,
    });
  } catch (err) {
    logger.info({ subsystem: 'daemon-loop', message: `Boot repo-sync failed: ${err.message}` });
  }

  // Initial mesh patch
  try {
    const { patchOwnMeshNode } = await import('./mesh.mjs');
    await patchOwnMeshNode();
    logger.info({ subsystem: 'daemon-loop', message: 'Mesh node patched on boot' });
  } catch (err) {
    logger.info({ subsystem: 'daemon-loop', message: `Mesh node patch failed: ${err.message}` });
  }

  // Deterministic election (lowest mesh IP) — tryAcquire/renew are no-op shims
  // that re-evaluate isLeader(); no node-local lease documents are written.
  const { tryAcquireLease, isLeader, getLeaderInfo, renewLease } = await import('./leader-election.mjs');

  const acquired = await tryAcquireLease();
  if (acquired) {
    logger.info({ subsystem: 'daemon-loop', message: 'Starting as LEADER' });
  } else {
    const info = await getLeaderInfo();
    const leaderStr = info ? info.hostname : 'unknown';
    logger.info({ subsystem: 'daemon-loop', message: `Starting as FOLLOWER (leader: ${leaderStr})` });
    
    // Phase 4C: Startup Sync (follower only)
    try {
      const { syncLoop } = await import('./secrets-sync.mjs');
      // Wait for leader to stabilize
      logger.info({ subsystem: 'daemon-loop', message: 'Waiting 3000ms for leader to stabilize before secrets sync...' });
      await new Promise(r => setTimeout(r, 3000));
      await syncLoop();
    } catch (err) {
      logger.info({ subsystem: 'daemon-loop', message: `Startup secrets sync failed: ${err.message}` });
    }
  }

  let emptyTicks = 0;

  while (running) {
    try {
      const leader = await isLeader();
      if (!leader) {
        // Follower: re-evaluate election in case the prior leader went offline.
        const newlyAcquired = await tryAcquireLease();
        if (newlyAcquired) {
          logger.info({ subsystem: 'daemon-loop', message: 'Became LEADER' });
        } else {
          // As a follower, also check for secrets updates periodically (e.g. every 60s)
          // 60000 / TASK_SLEEP_MS (10000) = 6
          if (taskCount > 0 && taskCount % 6 === 0) {
            try {
              const { syncLoop } = await import('./secrets-sync.mjs');
              await syncLoop();
            } catch (err) {
              logger.info({ subsystem: 'daemon-loop', message: `Secrets sync heartbeat failed: ${err.message}` });
            }
          }
        }
      }

      // Periodically patch own mesh node (heartbeat)
      if (taskCount > 0 && taskCount % (60000 / TASK_SLEEP_MS) === 0) {
        try {
          const { patchOwnMeshNode } = await import('./mesh.mjs');
          await patchOwnMeshNode();
          // renewLease is a no-op shim (re-checks isLeader); kept for API stability.
          if (await isLeader()) {
            await renewLease();
          }
        } catch (err) {
          logger.info({ subsystem: 'daemon-loop', message: `Mesh heartbeat failed: ${err.message}` });
        }
      }

      if (!await isLeader()) {
        await new Promise(r => setTimeout(r, TASK_SLEEP_MS));
        taskCount++;
        continue;
      }

      // Periodically recompile surfaces (LEADER ONLY)
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

        try {
          const { compactAppendLogs } = await import('./append-log.mjs');
          const compactResult = compactAppendLogs();
          if (compactResult.logs_compacted > 0) {
            logger.info({ subsystem: 'daemon-loop', message: `Compacted ${compactResult.logs_compacted} append logs (${compactResult.total_entries} entries)` });
          }
        } catch (err) {
          logger.info({ subsystem: 'daemon-loop', message: `Append log compaction error: ${err.message}` });
        }

        try {
          await runCrons({ vaultDir: VAULT_DIR, skillsDir: SKILLS_DIR, brainDir: BRAIN_DIR });
        } catch (err) {
          logger.error({ subsystem: 'daemon-loop', message: `Cron execution failed: ${err.message}` });
        }

        // Periodic repo sync — pick up any new/changed .md files in registered repos
        try {
          const syncResult = syncAllRepos();
          if (syncResult.totalIngested > 0) {
            logger.info({
              subsystem: 'daemon-loop',
              message: `Periodic repo-sync: ${syncResult.totalIngested} files updated across ${syncResult.repos.length} repos`,
            });
          }
        } catch (err) {
          logger.info({ subsystem: 'daemon-loop', message: `Periodic repo-sync failed: ${err.message}` });
        }
      }

      const scheduler = createScheduler({
        queueDir: QUEUE_DIR,
        vaultDir: VAULT_DIR,
        sessionsDir: SESSIONS_DIR,
      });

      let { task, source } = scheduler.next();

      // Empty queue: optional system dream, then sleep (no busy-work invention)
      if (!task) {
        emptyTicks++;
        if (emptyTicks % DREAM_EVERY_N_EMPTY === 0) {
          const dreamEnv = buildTaskEnvelope({
            intent: 'Scheduled system dream cycle',
            slug: `dream-system-${Date.now().toString(36)}`,
            kind: 'system',
            executor: 'dream',
            category: 'memory-maintenance',
            priority: 70,
            system: true,
            origin: { agent: 'daemon', created_by: 'daemon-system' },
            capabilities: ['vault:read', 'vault:write'],
          });
          task = persistTaskToDisk(dreamEnv, QUEUE_DIR);
          source = 'system';
          logger.info({
            subsystem: 'daemon-loop',
            message: `Empty queue → enqueue system dream (${emptyTicks} empty ticks)`,
          });
        } else {
          logger.info({
            subsystem: 'daemon-loop',
            message: `Queue empty (tick ${emptyTicks}) — sleeping ${EMPTY_SLEEP_MS}ms`,
          });
          await new Promise((r) => setTimeout(r, EMPTY_SLEEP_MS));
          continue;
        }
      } else {
        emptyTicks = 0;
      }

      taskCount++;

      logger.info({
        subsystem: 'daemon-loop',
        message: `Task #${taskCount} [${source}] ${task.category || task.kind}: ${task.slug}`,
      });

      if ((source === 'explicit' || source === 'idle' || source === 'system') && task._filepath) {
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

      if ((source === 'explicit' || source === 'idle' || source === 'system') && task._filepath) {
        try {
          if (result.skippedLLM) {
            updateTaskStatus(task, 'pending', QUEUE_DIR);
          } else if (result.success) {
            updateTaskStatus(task, 'completed', QUEUE_DIR);
          } else {
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
            notes: result.output ? `Phase output: ${result.output}` : (result.error || null),
          };
          if (result.factSlug) {
            patch.node_slug = result.factSlug;
          }
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

      await new Promise(r => setTimeout(r, TASK_SLEEP_MS));

    } catch (loopErr) {
      logger.info({
        subsystem: 'daemon-loop',
        message: `Task loop iteration crashed (non-fatal, continuing): ${loopErr.message}`,
      });
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  logger.info({ subsystem: 'daemon-loop', message: 'Daemon stopped.' });
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
