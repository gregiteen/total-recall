/**
 * Executor registry for daemon tasks.
 *
 * resolveExecutor(task) → { id, run }
 * Unknown executor → fail loudly (never silent success skip).
 */

import fs from 'fs';
import path from 'path';
import { normalizeTask, FORBIDDEN_CAPABILITIES } from './task-envelope.mjs';
import { logger } from './logger.mjs';
import { atomicWrite, safeStringify } from './vault.mjs';

/**
 * @typedef {object} ExecutorContext
 * @property {string} brainDir
 * @property {string} vaultDir
 * @property {string} skillsDir
 * @property {string} derivedDir
 * @property {string} sessionsDir
 * @property {string} queueDir
 * @property {string} conflictsDir
 * @property {string} instructionsFile
 * @property {object} [runtimeConfig]
 */

function policyCheck(task) {
  const caps = task.capabilities || [];
  const hit = caps.filter((c) => FORBIDDEN_CAPABILITIES.includes(c));
  if (hit.length) {
    return {
      ok: false,
      error: `Policy denied capabilities: ${hit.join(', ')}`,
    };
  }
  return { ok: true };
}

// ─── Built-in executors ─────────────────────────────────────────────────────────

async function runDream(task, ctx) {
  const { runDreamCycle } = await import('./dream.mjs');
  const result = await runDreamCycle({
    vaultDir: ctx.vaultDir,
    skillsDir: ctx.skillsDir,
    derivedDir: ctx.derivedDir,
    conflictsDir: ctx.conflictsDir,
    instructionsFile: ctx.instructionsFile,
    runtimeConfig: ctx.runtimeConfig,
  });
  if (result?.status !== 'success') return { success: false, error: result?.errors?.join('; ') || 'unsupported', executor: 'dream' };
  return { success: true, output: 'Dream cycle complete', executor: 'dream' };
}

async function runCustom(task, ctx) {
  const land = task.result?.land || 'inbox';
  const intent = task.intent || task.body || task.reason || task.slug;
  const caps = task.capabilities || [];

  if (land === 'log' || !caps.includes('vault:write')) {
    logger.info({
      subsystem: 'task-executors',
      message: `Custom task (log only): ${task.slug} — ${intent}`,
    });
    return {
      success: false,
      error: 'unsupported',
      executor: 'custom',
    };
  }

  // vault:write → draft in memory-inbox/pending for dream promotion
  const inboxDir = path.join(ctx.brainDir, 'memory-inbox', 'pending');
  if (!fs.existsSync(inboxDir)) fs.mkdirSync(inboxDir, { recursive: true });

  const now = new Date().toISOString();
  const draftSlug = `draft-task-${task.slug}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
  const draft = {
    type: 'memory',
    slug: draftSlug,
    category: 'facts',
    title: `Task result: ${task.slug}`,
    status: 'draft',
    confidence: 0.5,
    importance: 2,
    tags: ['daemon-task', 'custom', ...(task.payload?.tags || [])],
    modality: 'descriptive',
    subject: 'agent',
    predicate: 'completed_task',
    object: task.slug,
    schema_version: 2,
    source: {
      type: 'daemon-task',
      session_id: task.origin?.session_id || task.slug,
      evidence_count: 1,
    },
    created: now,
    updated: now,
    last_accessed: now,
    decay: { half_life_days: 30, access_count: 0 },
    sentiment_polarity: 'descriptive',
    sentiment_target: 'system',
  };

  const body = [
    `# ${draft.title}`,
    '',
    `**Intent:** ${intent}`,
    '',
    task.body && task.body !== intent ? task.body : '',
    '',
    task.payload && Object.keys(task.payload).length
      ? `## Payload\n\n\`\`\`json\n${JSON.stringify(task.payload, null, 2)}\n\`\`\``
      : '',
    '',
    `_Origin: ${task.origin?.agent || task.created_by || 'unknown'} @ ${task.origin?.created_at || now}_`,
  ]
    .filter(Boolean)
    .join('\n');

  atomicWrite(path.join(inboxDir, `${draftSlug}.md`), safeStringify(body, draft));

  return {
    success: true,
    output: `Custom task drafted to memory-inbox/pending/${draftSlug}.md`,
    executor: 'custom',
    draftSlug,
  };
}

async function runLegacyDispatch(task, ctx) {
  // Deferred import to keep registry load light; legacy path mirrors prior daemon-loop.
  return runLegacyCategoryDispatch(task, ctx);
}

/**
 * Legacy category handlers (research, system2, post-mortem, etc.).
 * Kept so existing queue files keep working while open envelope is the new API.
 */
async function runLegacyCategoryDispatch(task, ctx) {
  const category = task.category;
  const VAULT_DIR = ctx.vaultDir;
  const BRAIN_DIR = ctx.brainDir;
  const QUEUE_DIR = ctx.queueDir;
  const SKILLS_DIR = ctx.skillsDir;
  const DERIVED_DIR = ctx.derivedDir;
  const INSTRUCTIONS_FILE = ctx.instructionsFile;

  let runtimeConfig = ctx.runtimeConfig;
  if (!runtimeConfig) {
    try {
      const { loadRuntimeConfig } = await import('./runtime.mjs');
      runtimeConfig = await loadRuntimeConfig();
    } catch {
      runtimeConfig = {};
    }
  }

  if (
    task._is_remote_vault_sync ||
    String(task.slug || '').startsWith('remote-vault-sync-')
  ) {
    if (process.env.TR_REMOTE_VAULT_SYNC !== '1') {
      return {
        success: false,
        error: 'Remote vault sync off by default (set TR_REMOTE_VAULT_SYNC=1 to enable)',
        executor: 'remote-vault-sync',
      };
    }
    const { runSync } = await import('./remote-vault-sync.mjs');
    await runSync();
    return { success: true, output: 'Remote vault sync completed', executor: 'remote-vault-sync' };
  }

  if (
    String(task.slug || '').startsWith('research-') ||
    category === 'proactive-research' ||
    category === 'research-acquisition'
  ) {
    return runResearchLegacy(task, { ...ctx, runtimeConfig });
  }

  if (category === 'system2-deliberation') {
    if (process.env.TR_POWER_EXECUTORS !== '1' && !task._research_id) {
      return {
        success: false,
        error: 'system2-deliberation requires TR_POWER_EXECUTORS=1 (or research-queue phase)',
        executor: 'system2',
      };
    }
    const { runInferenceTask } = await import('./inference-engine.mjs');
    const slugs = task.target ? String(task.target).split(',') : [];
    const result = await runInferenceTask(slugs, {
      vaultDir: VAULT_DIR,
      inboxDir: path.join(BRAIN_DIR, 'memory-inbox', 'pending'),
      runtimeConfig,
    });
    return {
      success: true,
      output: `Inference complete: ${result.conclusions?.length || 0} conclusions`,
      executor: 'system2',
    };
  }

  if (category === 'cutoff-audit' || String(task.slug || '').startsWith('cutoff-audit-')) {
    if (process.env.TR_POWER_EXECUTORS !== '1') {
      return {
        success: false,
        error: 'cutoff-audit requires TR_POWER_EXECUTORS=1',
        executor: 'cutoff-audit',
      };
    }
    const { runCutoffAudit } = await import('./clarity-rewriter.mjs');
    const result = await runCutoffAudit({ vaultDir: VAULT_DIR, queueDir: QUEUE_DIR, runtimeConfig });
    return {
      success: true,
      output: `Cutoff audit: ${result.audited} audited, ${result.flagged} flagged`,
      executor: 'cutoff-audit',
    };
  }

  if (category === 'conscious-enforcement' || String(task.slug || '').includes('self-diagnosis')) {
    if (String(task.slug || '').startsWith('post-mortem-')) {
      const { runPostMortem } = await import('./post-mortem.mjs');
      const sessionPath = path.join(ctx.sessionsDir, task.target);
      const result = await runPostMortem(sessionPath, {
        vaultDir: VAULT_DIR,
        inboxDir: path.join(BRAIN_DIR, 'memory-inbox', 'pending'),
        runtimeConfig,
      });
      return {
        success: true,
        output: `Post-mortem: ${result.nodesCreated || 0} nodes`,
        executor: 'post-mortem',
      };
    }
    if (process.env.TR_POWER_EXECUTORS !== '1') {
      return {
        success: false,
        error: 'self-diagnosis / conscious-enforcement requires TR_POWER_EXECUTORS=1',
        executor: 'conscious',
      };
    }
    const { runSelfDiagnosis } = await import('./fact-seeker.mjs');
    await runSelfDiagnosis({ vaultDir: VAULT_DIR, runtimeConfig });
    return { success: true, output: 'Self-diagnosis complete', executor: 'conscious' };
  }

  if (category === 'memory-maintenance') {
    if (String(task.slug || '').startsWith('clarity-review-')) {
      const { runClarityReview } = await import('./clarity-rewriter.mjs');
      const result = await runClarityReview(task.target, {
        vaultDir: VAULT_DIR,
        inboxDir: path.join(BRAIN_DIR, 'memory-inbox', 'pending'),
        runtimeConfig,
      });
      return {
        success: true,
        output: `Clarity review: rewrote=${result.rewrote}`,
        executor: 'clarity',
      };
    }
    if (String(task.slug || '').startsWith('memory-compaction-')) {
      const { runMemoryCompaction } = await import('./fact-seeker.mjs');
      const result = await runMemoryCompaction({
        vaultDir: VAULT_DIR,
        inboxDir: path.join(BRAIN_DIR, 'memory-inbox', 'pending'),
        runtimeConfig,
      });
      return {
        success: true,
        output: `Compaction: ${result.consolidatedCount || 0} nodes`,
        executor: 'compaction',
      };
    }
    // generic maintenance: lease vacuum
    try {
      const leasesDir = path.join(BRAIN_DIR, 'leases');
      if (fs.existsSync(leasesDir)) {
        for (const ws of fs.readdirSync(leasesDir)) {
          const wsDir = path.join(leasesDir, ws);
          if (!fs.statSync(wsDir).isDirectory()) continue;
          for (const file of fs.readdirSync(wsDir)) {
            if (!file.endsWith('.lease.json')) continue;
            const fp = path.join(wsDir, file);
            try {
              const lease = JSON.parse(fs.readFileSync(fp, 'utf8'));
              if (new Date(lease.expires_at) < new Date()) fs.unlinkSync(fp);
            } catch {
              try {
                fs.unlinkSync(fp);
              } catch {}
            }
          }
        }
      }
    } catch {}
    return { success: true, output: 'Maintenance complete', executor: 'maintenance' };
  }

  if (category === 'self-evaluation' || category === 'skill-engineering') {
    return {
      success: false,
      error: 'unsupported',
      executor: category,
    };
  }

  // Unknown — fail loud
  return {
    success: false,
    error: 'unsupported',
    executor: 'unknown',
  };
}

async function runResearchLegacy(task, ctx) {
  const VAULT_DIR = ctx.vaultDir;
  const BRAIN_DIR = ctx.brainDir;
  const QUEUE_DIR = ctx.queueDir;
  const SKILLS_DIR = ctx.skillsDir;
  const DERIVED_DIR = ctx.derivedDir;
  const INSTRUCTIONS_FILE = ctx.instructionsFile;
  const runtimeConfig = ctx.runtimeConfig || {};
  const inboxDir = path.join(BRAIN_DIR, 'memory-inbox', 'pending');

  if (String(task.slug || '').startsWith('staleness-check-')) {
    const { runStalenessCheck } = await import('./clarity-rewriter.mjs');
    const result = await runStalenessCheck(task.target, {
      vaultDir: VAULT_DIR,
      queueDir: QUEUE_DIR,
      runtimeConfig,
    });
    return {
      success: true,
      output: `Staleness: ${result.verdict} (conf: ${result.confidence})`,
      executor: 'research',
    };
  }

  if (
    String(task.slug || '').startsWith('research-acquisition-') ||
    task.category === 'proactive-research' ||
    String(task.slug || '').includes('fact-seeker') ||
    String(task.slug || '').includes('knowledge-acquisition')
  ) {
    // Research needs a topic somebody chose. A task without one used to pull
    // "the next agenda topic" — which is how self-spawned tangents got
    // researched — so it is now a no-op (RESEARCH_SYSTEM2).
    const topic = String(task.target || '').trim();
    if (!topic || topic === 'global') {
      return { success: false, error: 'unsupported', executor: 'research' };
    }

    // Prefer deep multi-source research when this came from the research queue
    const deep =
      String(task.slug || '').startsWith('research-acquisition-') ||
      task.created_by === 'research-queue' ||
      task._research_id;

    if (deep) {
      try {
        const { handleProactiveResearch } = await import('./research.mjs');
        const deepResult = await handleProactiveResearch(
          {
            target: task.target || task.title || 'Unknown',
            body: task.body || task.reason || '',
          },
          { runtimeConfig },
        );
        const draftSlug =
          deepResult?.factSlug ||
          findLatestResearchDraftSlug(inboxDir, task.target);
        if (draftSlug) {
          return {
            success: true,
            output: `Deep researched "${task.target}" → ${draftSlug} (${deepResult?.sources || 0} sources)`,
            factSlug: draftSlug,
            executor: 'research',
          };
        }
        logger.info({
          subsystem: 'task-executors',
          message: 'Deep research returned no draft slug — falling back to knowledge acquisition',
        });
      } catch (err) {
        logger.info({
          subsystem: 'task-executors',
          message: `Deep research failed (${err.message}) — falling back to knowledge acquisition`,
        });
      }
    }

    const { runKnowledgeAcquisitionCycle } = await import('./fact-seeker.mjs');
    const result = await runKnowledgeAcquisitionCycle({
      vaultDir: VAULT_DIR,
      inboxDir,
      queueDir: QUEUE_DIR,
      forceTopic: task.target || null,
      skillsDir: SKILLS_DIR,
      derivedDir: DERIVED_DIR,
      instructionsFile: INSTRUCTIONS_FILE,
      runtimeConfig,
    });
    // CRITICAL: skipped/no-results is NOT success — otherwise phases advance empty forever
    if (result.skipped) {
      return {
        success: false,
        error: `Knowledge acquisition skipped: ${result.skipped}${result.errors?.length ? ` (${result.errors.map((e) => e.error || e.source).join('; ')})` : ''}`,
        executor: 'research',
      };
    }
    if (!result.factSlug) {
      return {
        success: false,
        error: `Knowledge acquisition produced no memory node for "${result.topic || task.target}"`,
        executor: 'research',
      };
    }
    return {
      success: true,
      output: `Researched "${result.topic}": confidence ${result.confidence || 'n/a'} slug=${result.factSlug}`,
      factSlug: result.factSlug,
      executor: 'research',
    };
  }

  // Later phases require a real node from acquisition — never no-op success
  const requireNode = (label) => {
    const slug = task._node_slug;
    if (!slug || slug === 'pending') {
      return {
        success: false,
        error: `${label} requires node_slug from acquisition (got ${slug || 'null'}). Reset phase to acquisition.`,
        executor: 'research',
      };
    }
    return null;
  };

  if (String(task.slug || '').startsWith('research-deliberation-')) {
    const missing = requireNode('Deliberation');
    if (missing) return missing;
    const { runResearchDeliberationCycle } = await import('./fact-seeker.mjs');
    const result = await runResearchDeliberationCycle({
      vaultDir: VAULT_DIR,
      nodeSlug: task._node_slug,
      topic: task.title || task.target || 'Unknown Topic',
      runtimeConfig,
    });
    if (result?.success === false) {
      return { success: false, error: result.error || 'Deliberation failed', executor: 'research' };
    }
    return {
      success: true,
      output: result?.output || 'Deliberation complete',
      factSlug: result?.factSlug || task._node_slug,
      executor: 'research',
    };
  }

  if (String(task.slug || '').startsWith('research-improvement-')) {
    const missing = requireNode('Improvement');
    if (missing) return missing;
    const { runResearchImprovementCycle } = await import('./fact-seeker.mjs');
    const result = await runResearchImprovementCycle({
      vaultDir: VAULT_DIR,
      nodeSlug: task._node_slug,
      topic: task.title || task.target || 'Unknown Topic',
      runtimeConfig,
    });
    if (result?.success === false) {
      return { success: false, error: result.error || 'Improvement failed', executor: 'research' };
    }
    return {
      success: true,
      output: result?.output || 'Improvement complete',
      factSlug: result?.factSlug || task._node_slug,
      executor: 'research',
    };
  }

  if (String(task.slug || '').includes('validate')) {
    const { runConclusionWriter } = await import('./conclusion-writer.mjs');
    const result = await runConclusionWriter({
      inboxDir,
      vaultDir: VAULT_DIR,
      quarantineDir: path.join(BRAIN_DIR, 'memory-inbox', 'quarantine'),
    });
    if (result.skipped) {
      return { success: false, error: 'unsupported', executor: 'research' };
    }
    return {
      success: true,
      output: `Validated ${result.processed}: ${result.approved} approved`,
      executor: 'research',
    };
  }

  return {
    success: false,
    error: 'unsupported',
    executor: 'research',
  };
}

/**
 * Locate the newest consolidated research draft for a topic in memory-inbox/pending.
 */
function findLatestResearchDraftSlug(inboxDir, topic) {
  try {
    if (!fs.existsSync(inboxDir)) return null;
    const needle = String(topic || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    const files = fs
      .readdirSync(inboxDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const full = path.join(inboxDir, f);
        const st = fs.statSync(full);
        return { slug: f.replace(/\.md$/, ''), mtime: st.mtimeMs, name: f.toLowerCase() };
      })
      .sort((a, b) => b.mtime - a.mtime);
    if (!files.length) return null;
    if (needle) {
      const hit = files.find(
        (f) =>
          f.name.includes(needle) ||
          f.name.includes('research') ||
          f.name.includes('deep-research') ||
          f.name.includes('consolidated'),
      );
      if (hit) return hit.slug;
    }
    // Prefer research-looking drafts, else newest
    const researchish = files.find((f) => /research|fact-|deep-/.test(f.name));
    return (researchish || files[0]).slug;
  } catch {
    return null;
  }
}

// ─── Registry ───────────────────────────────────────────────────────────────────

const EXECUTORS = {
  dream: { id: 'dream', run: runDream },
  custom: { id: 'custom', run: runCustom },
  research: { id: 'research', run: runResearchLegacy },
  legacy: { id: 'legacy', run: runLegacyDispatch },
};

/**
 * Resolve which executor runs this task.
 */
export function resolveExecutor(task) {
  const t = normalizeTask(task);

  // An explicit unsupported executor must never fall through to kind/category.
  if (t.executor) return typeof t.executor === 'string' && Object.hasOwn(EXECUTORS, t.executor) ? EXECUTORS[t.executor] : null;

  // System / named slugs
  if (t.slug === 'dream' || String(t.slug || '').startsWith('dream-') || t.executor === 'dream') {
    return EXECUTORS.dream;
  }
  // Known legacy categories still registered
  const legacyCategories = new Set([
    'conscious-enforcement',
    'system2-deliberation',
    'cutoff-audit',
    'memory-maintenance',
    'research-acquisition',
    'proactive-research',
    'skill-engineering',
    'self-evaluation',
  ]);

  if (legacyCategories.has(t.category) || t._research_id || t._is_remote_vault_sync) {
    return EXECUTORS.legacy;
  }

  if (t.category === 'custom' || (t.kind === 'custom' && !t.category)) return EXECUTORS.custom;

  if (t.kind === 'research') return EXECUTORS.research;
  if (t.kind === 'system' || t.kind === 'maintenance' || t.kind === 'memory') {
    return EXECUTORS.legacy;
  }

  // Truly unknown
  return null;
}

/**
 * Dispatch a task through the registry. Never silently succeeds on unknown.
 */
export async function dispatchTask(task, ctx) {
  const normalized = normalizeTask(task);

  const policy = policyCheck(normalized);
  if (!policy.ok) {
    return { success: false, error: policy.error, executor: 'policy' };
  }

  const executor = resolveExecutor(normalized);
  if (!executor) {
    const msg =
      `Unknown task executor for slug=${normalized.slug} ` +
      `category=${normalized.category} kind=${normalized.kind} executor=${normalized.executor}`;
    logger.info({ subsystem: 'task-executors', message: msg });
    return { success: false, error: 'unsupported', executor: 'unknown' };
  }

  try {
    const result = await executor.run(normalized, ctx);
    if (!result || typeof result.success !== 'boolean') return { success: false, error: 'unsupported', executor: executor.id };
    return { ...result, executor: result.executor || executor.id };
  } catch (err) {
    return {
      success: false,
      error: err.message || String(err),
      executor: executor.id,
    };
  }
}

export function listExecutorIds() {
  return Object.keys(EXECUTORS);
}
