/**
 * Total Recall Active Intelligence Daemon Loop
 *
 * Replaces the 60-second sleep loop with a continuous scheduler-driven
 * execution loop that keeps the local LLM busy at all times.
 *
 * Phases per tick:
 *   1. Ingest new IDE conversation logs
 *   2. Load/refresh task queue from disk
 *   3. Dispatch next task to the appropriate cognitive engine
 *   4. Write results as proposals (never direct mutations)
 *
 * This script is spawned by `total-recall daemon start` and runs until killed.
 */

import path from 'path';
import os from 'os';
import fs from 'fs';
import { execFileSync } from 'node:child_process';
import { loadRuntimeConfig } from './runtime.mjs';
import { createScheduler, updateTaskStatus } from './scheduler.mjs';
import { scanAndIngest } from './session-watcher.mjs';
import { runDreamCycle } from './dream.mjs';
import { logger } from './logger.mjs';
import { updateQueueItem, loadQueue } from './research-queue.mjs';

// ─── Configuration ──────────────────────────────────────────────────────────────

import { agentDir } from './config.mjs';

const AGENT_DIR = agentDir;
const VAULT_DIR = path.join(AGENT_DIR, 'memory-vault');
const SKILLS_DIR = path.join(AGENT_DIR, 'skills');
const DERIVED_DIR = path.join(AGENT_DIR, 'memory-derived');
const CONFLICTS_DIR = path.join(AGENT_DIR, 'memory-inbox', 'conflicts');
const SESSIONS_DIR = path.join(AGENT_DIR, 'sessions');
const QUEUE_DIR = path.join(AGENT_DIR, 'scheduler', 'queue');
const RUNTIME_CONFIG_PATH = path.join(AGENT_DIR, 'config', 'runtime.yml');
const INSTRUCTIONS_FILE = path.join(AGENT_DIR, 'INSTRUCTIONS.md');

// Pause between tasks (ms) — only applies when the LLM is unavailable/offline
// Under normal operation, LLM inference (~5-30s) provides natural throttling
const FALLBACK_SLEEP_MS = 5000;

// How often to run a full dream cycle (every N task ticks)
const DREAM_CYCLE_EVERY_N_TASKS = 20;

function getResearchNodeSlug(task) {
  if (task._research_id) {
    try {
      const items = loadQueue();
      const item = items.find(i => i.id === task._research_id);
      if (item && item.node_slug) return item.node_slug;
    } catch (err) {
      logger.info({
        subsystem: 'daemon-loop',
        message: `Error loading queue for slug lookup: ${err.message}`,
      });
    }
  }
  return null;
}

/**
 * Dispatch a task to the appropriate cognitive engine based on category.
 *
 * Returns a result object: { success, output?, error? }
 */
async function dispatchTask(task, runtimeConfig) {
  const category = task.category;

  try {
    switch (category) {
      case 'conscious-enforcement':
        return await runConsciousTask(task, runtimeConfig);

      case 'system2-deliberation':
        return await runSystem2Task(task, runtimeConfig);

      case 'research-acquisition':
      case 'proactive-research':
      case 'exploration':
        return await runResearchTask(task, runtimeConfig);

      case 'cutoff-audit':
        return await runCutoffAuditTask(task, runtimeConfig);

      case 'memory-maintenance':
        return await runMaintenanceTask(task, runtimeConfig);

      case 'skill-engineering':
        return await runSkillEngineeringTask(task, runtimeConfig);

      default:
        logger.info({
          subsystem: 'daemon-loop',
          message: `No engine for category "${category}" — task ${task.slug} skipped`,
        });
        return { success: false, error: `No engine for category: ${category}` };
    }
  } catch (err) {
    logger.info({
      subsystem: 'daemon-loop',
      message: `Task ${task.slug} failed: ${err.message}`,
    });
    return { success: false, error: err.message };
  }
}

// ─── Conscious Layer Engine ─────────────────────────────────────────────────────

async function runConsciousTask(task, runtimeConfig) {
  // Post-mortem tasks reference a session file
  if (task.slug.includes('post-mortem') && task.target) {
    const { runPostMortem } = await import('./post-mortem.mjs');
    const sessionPath = path.join(SESSIONS_DIR, task.target);
    const inboxDir = path.join(AGENT_DIR, 'memory-inbox', 'pending');
    const result = await runPostMortem(sessionPath, {
      vaultDir: VAULT_DIR,
      inboxDir,
      runtimeConfig,
    });
    return {
      success: !result.error,
      output: `Extracted ${result.patterns.length} patterns, ${result.facts.length} facts, ${result.skill_gaps.length} gaps`,
    };
  }

  // Compliance audit tasks
  if (task.slug.includes('compliance') && task.target) {
    const { runComplianceAudit } = await import('./post-mortem.mjs');
    const sessionPath = path.join(SESSIONS_DIR, task.target);
    const result = await runComplianceAudit(sessionPath, {
      vaultDir: VAULT_DIR,
      runtimeConfig,
    });
    return {
      success: !result.error,
      output: result.compliant ? 'COMPLIANT' : `${result.violations.length} violations found`,
    };
  }

  return { success: true, output: 'No-op conscious task' };
}

// ─── System 2 Layer Engine ──────────────────────────────────────────────────────

// Path where the daemon writes new conclusions for connected IDEs to pick up.
const INTERRUPTS_FILE = path.join(AGENT_DIR, 'interrupts', 'pending.md');

/**
 * Push a System 2 conclusion to all channels simultaneously:
 *   1. MCP SSE — immediate push to all connected IDE MCP clients
 *   2. Interrupt file — picked up by IDE agents on their next turn
 *   3. macOS notification — alerts user regardless of active IDE
 */
async function pushConclusion(conclusions = []) {
  if (!conclusions.length) return;

  const summary = (conclusions[0] || 'New System 2 conclusion ready').slice(0, 120);

  // 1. Interrupt file — agents pick this up on next turn via INSTRUCTIONS.md rule
  const lines = [
    `\n\n---`,
    `<!-- total-recall interrupt: ${new Date().toISOString()} -->`,
    `## \ud83e\udde0 New Insight Available`,
    ...conclusions.map(c => `- ${c}`),
    ``,
    `*Query \`search_memory\` or check vault for full context.*`,
  ];
  const dir = path.dirname(INTERRUPTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(INTERRUPTS_FILE, lines.join('\n'));

  // 3. macOS notification
  try {
    const { sendSystemNotification } = await import('./notifications.mjs');
    await sendSystemNotification('Total Recall', summary, {
      open: INTERRUPTS_FILE,
      sound: 'Hero',
      subtitle: 'New Insight Available',
      group: 'total-recall-insight'
    });
  } catch (err) {
    logger.debug('daemon-loop: pushConclusion notification failed', { err: err.message });
  }
}

async function runSystem2Task(task, runtimeConfig) {
  if (task.slug.startsWith('research-deliberation-')) {
    const { runResearchDeliberationCycle } = await import('./fact-seeker.mjs');
    const nodeSlug = getResearchNodeSlug(task);
    const result = await runResearchDeliberationCycle({
      vaultDir: VAULT_DIR,
      nodeSlug,
      topic: task.target,
      runtimeConfig,
    });
    return result;
  }

  if (task.slug.includes('inference') && task.target) {
    const { runInferenceTask } = await import('./inference-engine.mjs');
    const slugs = task.target.split(',').map(s => s.trim());
    const result = await runInferenceTask(slugs, {
      vaultDir: VAULT_DIR,
      inboxDir: path.join(AGENT_DIR, 'memory-inbox', 'pending'),
      runtimeConfig,
    });

    // Push conclusions to IDEs + macOS notification immediately
    if (result.conclusions?.length) {
      pushConclusion(result.conclusions.map(c =>
        typeof c === 'string' ? c : (c.title || c.conclusion || JSON.stringify(c))
      ));
    }

    return {
      success: !result.error,
      output: `Drew ${result.conclusions?.length || 0} conclusions${result.conclusions?.length ? ' — pushed to interrupts' : ''}`,
    };
  }

  return { success: true, output: 'No-op system2 task' };
}

// ─── Research Layer Engine ──────────────────────────────────────────────────────

async function runResearchTask(task, runtimeConfig) {
  const inboxDir = path.join(AGENT_DIR, 'memory-inbox', 'pending');

  // Self-diagnosis — scan vault, assess coverage, generate research agenda
  if (task.slug.includes('self-diagnosis')) {
    const { runSelfDiagnosis } = await import('./fact-seeker.mjs');
    const result = await runSelfDiagnosis({ vaultDir: VAULT_DIR, runtimeConfig });
    return {
      success: !result.error,
      output: result.error
        ? `Self-diagnosis error: ${result.error}`
        : `Coverage: ${result.overall_coverage_score}, ${result.weak_areas?.length || 0} weak areas, ${result.recommended_immediate_research?.length || 0} topics queued`,
    };
  }

  if (task.slug.startsWith('research-monitoring-')) {
    const { runResearchMonitoringCycle } = await import('./fact-seeker.mjs');
    const nodeSlug = getResearchNodeSlug(task);
    const result = await runResearchMonitoringCycle({
      vaultDir: VAULT_DIR,
      nodeSlug,
      topic: task.target,
      runtimeConfig,
      skillsDir: SKILLS_DIR,
      derivedDir: DERIVED_DIR,
      instructionsFile: INSTRUCTIONS_FILE,
    });
    return result;
  }

  if (task.slug.startsWith('research-expansion-')) {
    const { runResearchExpansionCycle } = await import('./fact-seeker.mjs');
    const nodeSlug = getResearchNodeSlug(task);
    const result = await runResearchExpansionCycle({
      vaultDir: VAULT_DIR,
      nodeSlug,
      topic: task.target,
      runtimeConfig,
    });
    return result;
  }

  // Proactive research — run one acquisition cycle from the agenda
  if (task.slug.startsWith('research-acquisition-') || task.category === 'proactive-research' || task.slug.includes('fact-seeker') || task.slug.includes('knowledge-acquisition')) {
    const { runKnowledgeAcquisitionCycle } = await import('./fact-seeker.mjs');
    const forceTopic = task.target || null;
    const result = await runKnowledgeAcquisitionCycle({
      vaultDir: VAULT_DIR,
      inboxDir,
      queueDir: QUEUE_DIR,
      runtimeConfig,
      forceTopic,
      // Surface paths: high-confidence results bypass inbox and recompile immediately
      skillsDir: SKILLS_DIR,
      derivedDir: DERIVED_DIR,
      instructionsFile: INSTRUCTIONS_FILE,
    });
    if (result.skipped) return { success: true, output: `Knowledge acquisition: ${result.skipped}` };
    const surfaceNote = result.surfaced ? ' [SURFACED IMMEDIATELY]' : ' [staged for validation]';
    return {
      success: true,
      output: `Researched "${result.topic}": ${result.sources?.join(', ')} | confidence: ${result.confidence || 'n/a'} | slug: ${result.factSlug}${surfaceNote}`,
      factSlug: result.factSlug,
    };
  }

  // Conclusion writer — validate pending drafts before promoting to vault
  if (task.slug.includes('validate') || task.category === 'research-acquisition') {
    const { runConclusionWriter } = await import('./conclusion-writer.mjs');
    const result = await runConclusionWriter({
      inboxDir,
      vaultDir: VAULT_DIR,
      quarantineDir: path.join(AGENT_DIR, 'memory-inbox', 'quarantine'),
      runtimeConfig,
    });
    if (result.skipped) return { success: true, output: `Conclusion writer: ${result.skipped}` };
    return {
      success: true,
      output: `Validated ${result.processed} drafts: ${result.approved} approved, ${result.rejected} rejected`,
    };
  }

  // Deep research task (frontier model orchestrated)
  const { handleProactiveResearch } = await import('./research.mjs');
  const result = await handleProactiveResearch(task, { runtimeConfig });
  return { success: !!result, output: result ? 'Deep research complete' : 'Deep research returned no results' };
}


// ─── Maintenance Layer Engine ───────────────────────────────────────────────────

async function runMaintenanceTask(task, runtimeConfig) {
  if (task.slug.startsWith('research-improvement-')) {
    const { runResearchImprovementCycle } = await import('./fact-seeker.mjs');
    const nodeSlug = getResearchNodeSlug(task);
    const result = await runResearchImprovementCycle({
      vaultDir: VAULT_DIR,
      nodeSlug,
      topic: task.target,
      runtimeConfig,
    });
    return result;
  }

  // Stage 8: Advisory Lease Vacuuming
  try {
    const leasesDir = path.join(AGENT_DIR, 'leases');
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
              logger.info({ subsystem: 'daemon-loop', message: `Vacuumed expired lease file: ${fp}` });
            }
          } catch {
            // Delete corrupt lease files
            try { fs.unlinkSync(fp); } catch {}
          }
        }
      }
    }
  } catch (err) {
    logger.info({ subsystem: 'daemon-loop', message: `Lease vacuuming failed: ${err.message}` });
  }

  if (task.slug.includes('clarity-review') && task.target) {
    const { runClarityReview } = await import('./clarity-rewriter.mjs');
    const result = await runClarityReview(task.target, {
      vaultDir: VAULT_DIR,
      inboxDir: path.join(AGENT_DIR, 'memory-inbox', 'pending'),
      runtimeConfig,
    });
    return {
      success: !result.error,
      output: result.rewrote ? 'Rewrite proposal created' : 'No rewrite needed',
    };
  }

  if (task.slug.includes('staleness-check') && task.target) {
    const { runStalenessCheck } = await import('./clarity-rewriter.mjs');
    const result = await runStalenessCheck(task.target, {
      vaultDir: VAULT_DIR,
      queueDir: QUEUE_DIR,
      runtimeConfig,
    });
    return {
      success: !result.error,
      output: `Staleness: ${result.verdict || 'unknown'}`,
    };
  }

  return { success: true, output: 'No-op maintenance task' };
}

// ─── Cutoff Audit Task ───────────────────────────────────────────────────────────

async function runCutoffAuditTask(_task, runtimeConfig) {
  const { runCutoffAudit } = await import('./clarity-rewriter.mjs');
  const result = await runCutoffAudit({
    vaultDir: VAULT_DIR,
    queueDir: QUEUE_DIR,
    runtimeConfig,
  });
  return {
    success: true,
    output: `Cutoff audit: ${result.audited} audited, ${result.flagged} flagged, ${result.critical} critical`,
  };
}

// ─── Skill Engineering Engine ─────────────────────────────────────────────────────
async function runSkillEngineeringTask(task, runtimeConfig) {
  // Skill engineering tasks are flagged for human or frontier model attention
  // The daemon notes them and lets them accumulate for the next session
  logger.info({
    subsystem: 'daemon-loop',
    message: `Skill engineering task pending (requires frontier model): ${task.slug}`,
  });
  return { success: true, output: 'Queued for frontier model attention' };
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
    message: `Active Intelligence Daemon starting. Vault: ${VAULT_DIR}`,
  });

  const runtimeConfig = loadRuntimeConfig(RUNTIME_CONFIG_PATH);
  logger.info({
    subsystem: 'daemon-loop',
    message: `Runtime: ${runtimeConfig.runtime} / ${runtimeConfig.model}`,
  });

  // ─── Startup Health Check ───────────────────────────────────────────────────
  // Detect catastrophic issues BEFORE entering the task loop.
  // Writes emergency alerts that get injected into all IDE instruction files.
  const { runStartupHealthCheck, writeEmergencyAlert, clearEmergencyAlerts } =
    await import('./emergency-alerts.mjs');

  const health = await runStartupHealthCheck(runtimeConfig);
  if (!health.healthy) {
    logger.info({
      subsystem: 'daemon-loop',
      message: `STARTUP HEALTH CHECK FAILED: ${health.issues.join(' | ')}`,
    });
    // Don't exit — continue anyway so the daemon can recover if the model becomes available
    logger.info({
      subsystem: 'daemon-loop',
      message: 'Continuing despite health check failure — will retry tasks and alert on persistent failures.',
    });
  } else {
    logger.info({
      subsystem: 'daemon-loop',
      message: 'Startup health check PASSED — LLM runtime healthy, emergency alerts cleared.',
    });
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

  // Track consecutive LLM failures to detect persistent outages
  let consecutiveLlmFailures = 0;
  const LLM_FAILURE_ALERT_THRESHOLD = 5;
  let llmAlertWritten = false;

  while (running) {
    try {
      // Periodically run the full dream cycle for surface compilation + conflict resolution
      if (taskCount > 0 && taskCount % DREAM_CYCLE_EVERY_N_TASKS === 0) {
        logger.info({ subsystem: 'daemon-loop', message: 'Running scheduled dream cycle...' });
        try {
          await runDreamCycle({
            vaultDir: VAULT_DIR,
            skillsDir: SKILLS_DIR,
            derivedDir: DERIVED_DIR,
            conflictsDir: CONFLICTS_DIR,
            instructionsFile: INSTRUCTIONS_FILE,
          });
        } catch (err) {
          logger.info({ subsystem: 'daemon-loop', message: `Dream cycle error: ${err.message}` });
        }
      }

      // Refresh scheduler from disk on each iteration (picks up new tasks)
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
            message: `Failed to update research queue status to in_progress: ${err.message}`,
          });
        }
      }

      const result = await dispatchTask(task, runtimeConfig);

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
          if (result.success && task._research_phase) {
            const phases = ['acquisition', 'deliberation', 'improvement', 'monitoring', 'expansion'];
            const idx = phases.indexOf(task._research_phase);
            if (idx !== -1) {
              const nextPhase = phases[(idx + 1) % phases.length];
              patch.research_phase = nextPhase;
            }
          }
          updateQueueItem(task._research_id, patch);
        } catch (err) {
          logger.error({
            subsystem: 'daemon-loop',
            message: `Failed to update research queue completion status: ${err.message}`,
          });
        }
      }

      logger.info({
        subsystem: 'daemon-loop',
        message: `Task #${taskCount} done: ${result.output || result.error || 'ok'}`,
      });

      // Track consecutive LLM failures
      if (!result.success && result.error?.includes('Connection failed')) {
        consecutiveLlmFailures++;
        if (consecutiveLlmFailures >= LLM_FAILURE_ALERT_THRESHOLD && !llmAlertWritten) {
          writeEmergencyAlert(
            `LLM runtime is persistently unreachable (${consecutiveLlmFailures} consecutive failures). ` +
            `The daemon is running but CANNOT do any cognitive work. Check if Ollama is running and the model "${runtimeConfig.model}" is pulled.`
          );
          llmAlertWritten = true;
        }
        await new Promise(r => setTimeout(r, FALLBACK_SLEEP_MS));
      } else {
        // Reset failure counter on any success
        if (consecutiveLlmFailures > 0 && result.success) {
          consecutiveLlmFailures = 0;
          if (llmAlertWritten) {
            clearEmergencyAlerts();
            llmAlertWritten = false;
            logger.info({
              subsystem: 'daemon-loop',
              message: 'LLM connection recovered — emergency alerts cleared.',
            });
          }
        }
      }
    } catch (loopErr) {
      // ─── CRASH GUARD ─────────────────────────────────────────────────────
      // Individual task failures must NEVER kill the daemon.
      // Log the error and continue to the next task.
      logger.info({
        subsystem: 'daemon-loop',
        message: `Task loop iteration crashed (non-fatal, continuing): ${loopErr.message}`,
      });
      // Brief pause to avoid tight error loops
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  logger.info({ subsystem: 'daemon-loop', message: 'Active Intelligence Daemon stopped.' });
}

main().catch(async (err) => {
  logger.info({ subsystem: 'daemon-loop', message: `Fatal error: ${err.message}` });

  // Write emergency alert so every IDE agent knows the daemon is dead
  try {
    const { writeEmergencyAlert } = await import('./emergency-alerts.mjs');
    writeEmergencyAlert(
      `The Active Intelligence Daemon has CRASHED with a fatal error: ${err.message}. ` +
      `No background research, inference, or memory maintenance is running. ` +
      `Restart with: node bin/total-recall.mjs daemon start`
    );
  } catch {
    // If even the alert system fails, we still exit
  }

  process.exit(1);
});
