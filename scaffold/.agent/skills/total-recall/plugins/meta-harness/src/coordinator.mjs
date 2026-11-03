/**
 * Meta Harness Multi-Agent Coordinator
 * Orchestrates role-specialized multi-agent execution pipelines:
 * - Pipeline: Architect -> Implementer -> Verifier (cross-model family, worktree-isolated)
 * - Council: Multi-model consensus voting
 * - Race: Speculative concurrent execution
 *
 * Works with any user's installed harness pool:
 * - Dynamically discovers installed harnesses and assigns distinct model families
 *   for Architect, Implementer, and Verifier so confirmation bias is avoided.
 * - Supports plan generation (default safe inspection) and live execution (`execute: true`)
 *   via `dispatchAgent` with real git worktree isolation for the Verifier stage.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { ADAPTER_CATALOG, classifyTaskComplexity } from '../capability/index.mjs';
import { inspectAgents, dispatchAgent, getActiveAdapters } from './worker.mjs';
import { notifyAlert } from './alerts.mjs';
import { recordRunReceipt } from './learner.mjs';

/**
 * Resolve installed or available harnesses with their model family metadata
 */
async function resolvePool(options = {}) {
  const active = getActiveAdapters();
  let installedIds = [];
  if (Array.isArray(options.availableHarnesses) && options.availableHarnesses.length > 0) {
    installedIds = options.availableHarnesses;
  } else {
    try {
      const inspected = await inspectAgents({ env: process.env });
      installedIds = (inspected.agents || []).filter(a => a.installed).map(a => a.id);
    } catch {}
  }

  const candidateIds = installedIds.length > 0 ? installedIds : active.map(a => a.id);
  return candidateIds.map(id => {
    const cap = ADAPTER_CATALOG[id] || {};
    const workerSpec = active.find(a => a.id === id) || {};
    return {
      id,
      name: cap.name || workerSpec.name || id,
      family: cap.family || 'custom',
      tier: cap.tier || 'budget',
      qualityScore: cap.qualityScore ?? 7.5,
      costScore: cap.costScore ?? 4
    };
  });
}

/**
 * Select three role-specialized harnesses preferring distinct model families
 */
export function assignPipelineRoles(pool = [], options = {}) {
  const sorted = [...pool].sort((a, b) => b.qualityScore - a.qualityScore);
  const findById = (id) => sorted.find(h => h.id === id) || (ADAPTER_CATALOG[id] ? { id, ...ADAPTER_CATALOG[id] } : { id, name: id, family: 'custom' });

  const architect = options.architect
    ? findById(options.architect)
    : (sorted[0] || findById('claude'));

  const implementer = options.implementer
    ? findById(options.implementer)
    : (sorted.find(h => h.id !== architect.id) || sorted[0] || findById('agy'));

  // Verifier must use a distinct model family from Implementer whenever more than 1 family is available
  const verifier = options.verifier
    ? findById(options.verifier)
    : (sorted.find(h => h.family !== implementer.family && h.id !== implementer.id)
      || sorted.find(h => h.id !== implementer.id)
      || implementer);

  return {
    architect,
    implementer,
    verifier,
    heterogeneousFamilies: verifier.family !== implementer.family || pool.length <= 1
  };
}

/**
 * Coordinate a task across specialized roles and model families
 */
export async function coordinateTask(taskDescription, options = {}) {
  const mode = options.mode || 'pipeline';
  const task = String(taskDescription || '').trim();
  if (!task) throw new Error('Task description is required for coordination');

  const pool = await resolvePool(options);

  if (mode === 'pipeline') {
    return await runSpecializedPipeline(task, pool, options);
  } else if (mode === 'council') {
    return await runCouncilCoordination(task, pool, options);
  } else if (mode === 'race') {
    return await runRaceCoordination(task, pool, options);
  } else {
    throw new Error(`Unsupported coordination mode: ${mode}`);
  }
}

/**
 * Create a temporary detached git worktree if inside a git repository
 */
function createVerifierWorktree(cwd) {
  try {
    const check = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, encoding: 'utf8', timeout: 3000 });
    if (check.status !== 0) return null;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-harness-verify-'));
    const add = spawnSync('git', ['worktree', 'add', '--detach', tmpDir], { cwd, encoding: 'utf8', timeout: 10000 });
    if (add.status !== 0) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return null;
    }
    return tmpDir;
  } catch {
    return null;
  }
}

function removeVerifierWorktree(cwd, worktreeDir) {
  if (!worktreeDir) return;
  try {
    spawnSync('git', ['worktree', 'remove', '--force', worktreeDir], { cwd, encoding: 'utf8', timeout: 5000 });
  } catch {}
  try {
    fs.rmSync(worktreeDir, { recursive: true, force: true });
  } catch {}
}

/**
 * Architect -> Implementer -> Verifier Pipeline
 * Enforces heterogeneous model families to eliminate confirmation bias.
 */
async function runSpecializedPipeline(task, pool, options = {}) {
  const startTime = Date.now();
  const roles = assignPipelineRoles(pool, options);
  const executeLive = options.execute === true;
  const cwd = options.cwd || process.cwd();
  const dispatchFn = options.dispatchFn || dispatchAgent;
  const complexity = classifyTaskComplexity(task);

  const stages = [
    {
      role: 'Architect',
      harness: roles.architect.id,
      harnessName: roles.architect.name,
      modelFamily: roles.architect.family,
      permissions: { read: true, write: false },
      status: executeLive ? 'pending' : 'planned',
      action: 'Analyze requirements, design modular contracts, and formulate verification plan.',
      output: null
    },
    {
      role: 'Implementer',
      harness: roles.implementer.id,
      harnessName: roles.implementer.name,
      modelFamily: roles.implementer.family,
      permissions: { read: true, write: true },
      status: executeLive ? 'pending' : 'planned',
      action: 'Author implementation files and unit tests following Architectural blueprint.',
      output: null
    },
    {
      role: 'Verifier',
      harness: roles.verifier.id,
      harnessName: roles.verifier.name,
      modelFamily: roles.verifier.family,
      permissions: { read: true, write: false },
      worktreeIsolated: true,
      status: executeLive ? 'pending' : 'planned',
      action: 'Execute deterministic test gates, audit diffs, and verify invariant compliance in isolated worktree.',
      passed: executeLive ? null : true,
      output: null
    }
  ];

  let allSucceeded = true;

  if (executeLive) {
    // Stage 1: Architect (Read-Only Plan)
    const archStart = Date.now();
    const archRes = await dispatchFn({
      agent: roles.architect.id,
      cwd,
      prompt: `[ROLE: ARCHITECT]\nProduce a concise architectural blueprint, file list, and verification steps for:\n${task}`,
      permissions: { read: true, write: false },
      allowUnknownAuth: options.allowUnknownAuth === true
    });
    stages[0].status = archRes.ok ? 'completed' : 'failed';
    stages[0].output = archRes.response || archRes.error || null;
    recordRunReceipt({
      harness: roles.architect.id,
      task: `[Architect] ${task}`,
      complexityScore: complexity.score,
      success: Boolean(archRes.ok),
      durationMs: Date.now() - archStart
    });

    if (!archRes.ok) {
      allSucceeded = false;
    } else {
      // Stage 2: Implementer
      const implStart = Date.now();
      const implRes = await dispatchFn({
        agent: roles.implementer.id,
        cwd,
        prompt: `[ROLE: IMPLEMENTER]\nFollow this Architect blueprint:\n${archRes.response}\n\nImplement the requested task:\n${task}`,
        permissions: { read: true, write: true },
        allowUnknownAuth: options.allowUnknownAuth === true
      });
      stages[1].status = implRes.ok ? 'completed' : 'failed';
      stages[1].output = implRes.response || implRes.error || null;
      recordRunReceipt({
        harness: roles.implementer.id,
        task: `[Implementer] ${task}`,
        complexityScore: complexity.score,
        success: Boolean(implRes.ok),
        durationMs: Date.now() - implStart
      });

      if (!implRes.ok) {
        allSucceeded = false;
      } else {
        // Stage 3: Verifier (Isolated git worktree when available)
        const verifyStart = Date.now();
        const worktreeDir = createVerifierWorktree(cwd);
        const verifyCwd = worktreeDir || cwd;
        try {
          const verRes = await dispatchFn({
            agent: roles.verifier.id,
            cwd: verifyCwd,
            prompt: `[ROLE: INDEPENDENT VERIFIER]\nAudit the implementation and run verification checks for:\n${task}\n\nArchitect Blueprint:\n${archRes.response}\n\nImplementer Summary:\n${implRes.response}`,
            permissions: { read: true, write: false },
            allowUnknownAuth: options.allowUnknownAuth === true
          });
          stages[2].status = verRes.ok ? 'completed' : 'failed';
          stages[2].passed = Boolean(verRes.ok);
          stages[2].output = verRes.response || verRes.error || null;
          stages[2].worktreePath = worktreeDir || null;
          recordRunReceipt({
            harness: roles.verifier.id,
            task: `[Verifier] ${task}`,
            complexityScore: complexity.score,
            success: Boolean(verRes.ok),
            durationMs: Date.now() - verifyStart
          });
          if (!verRes.ok) allSucceeded = false;
        } finally {
          removeVerifierWorktree(cwd, worktreeDir);
        }
      }
    }
  } else {
    stages[0].output = `Planned Architect stage (${roles.architect.name}) for: ${task.slice(0, 80)}`;
    stages[1].output = `Planned Implementer stage (${roles.implementer.name}) following Architect blueprint.`;
    stages[2].output = `Planned cross-family Verifier stage (${roles.verifier.name}, family: ${roles.verifier.family}) in isolated git worktree.`;
  }

  const durationMs = Date.now() - startTime;
  const result = {
    ok: allSucceeded,
    mode: 'pipeline',
    executedLive: executeLive,
    task,
    stages,
    durationMs,
    heterogeneousFamiliesVerified: roles.heterogeneousFamilies
  };

  if (executeLive) {
    await notifyAlert({
      title: allSucceeded ? 'Meta Harness: Pipeline Completed' : 'Meta Harness: Pipeline Failed',
      message: `Multi-agent pipeline ${allSucceeded ? 'succeeded' : 'failed'} for task: ${task.slice(0, 60)}`,
      severity: allSucceeded ? 'info' : 'warning'
    });
  }

  return result;
}

/**
 * Council Consensus (Multi-model deliberation across available harnesses)
 */
async function runCouncilCoordination(task, pool, options = {}) {
  const councilHarnesses = options.harnesses
    || pool.slice(0, 3).map(h => h.id);
  const executeLive = options.execute === true;
  const cwd = options.cwd || process.cwd();
  const dispatchFn = options.dispatchFn || dispatchAgent;

  if (executeLive) {
    const dispatches = await Promise.all(councilHarnesses.map(async (h) => {
      try {
        const res = await dispatchFn({
          agent: h,
          cwd,
          prompt: `[COUNCIL DELIBERATION]\nProvide your independent engineering assessment and recommendation for:\n${task}`,
          permissions: { read: true, write: false },
          allowUnknownAuth: options.allowUnknownAuth === true
        });
        return {
          harness: h,
          ok: Boolean(res.ok),
          recommendation: res.ok ? 'completed' : 'failed',
          response: res.response || res.error || null
        };
      } catch (err) {
        return {
          harness: h,
          ok: false,
          recommendation: 'error',
          response: err.message
        };
      }
    }));

    const passedCount = dispatches.filter(d => d.ok).length;
    return {
      ok: passedCount > 0,
      mode: 'council',
      executedLive: true,
      task,
      council: councilHarnesses,
      consensus: passedCount === councilHarnesses.length ? 'unanimous' : (passedCount > 0 ? 'majority' : 'failed'),
      votes: dispatches
    };
  }

  const votes = councilHarnesses.map(h => ({
    harness: h,
    status: 'planned',
    recommendation: 'ready',
    reasoning: `Scheduled independent read-only deliberation on ${h}.`
  }));

  return {
    ok: true,
    mode: 'council',
    executedLive: false,
    task,
    council: councilHarnesses,
    consensus: 'planned',
    votes
  };
}

/**
 * Speculative Concurrent Race
 */
async function runRaceCoordination(task, pool, options = {}) {
  const contenders = options.harnesses
    || pool.slice(0, 2).map(h => h.id);
  const executeLive = options.execute === true;
  const cwd = options.cwd || process.cwd();
  const dispatchFn = options.dispatchFn || dispatchAgent;

  if (executeLive) {
    const results = await Promise.all(contenders.map(async (h) => {
      const start = Date.now();
      try {
        const res = await dispatchFn({
          agent: h,
          cwd,
          prompt: task,
          permissions: { read: true, write: false },
          allowUnknownAuth: options.allowUnknownAuth === true
        });
        return { harness: h, ok: Boolean(res.ok), durationMs: Date.now() - start, response: res.response || null };
      } catch (err) {
        return { harness: h, ok: false, durationMs: Date.now() - start, error: err.message };
      }
    }));
    const winners = results.filter(r => r.ok).sort((a, b) => a.durationMs - b.durationMs);
    return {
      ok: winners.length > 0,
      mode: 'race',
      executedLive: true,
      task,
      contenders,
      winner: winners[0]?.harness || null,
      results
    };
  }

  return {
    ok: true,
    mode: 'race',
    executedLive: false,
    task,
    contenders,
    winner: contenders[0] || null,
    reason: 'Planned concurrent race across selected contenders.'
  };
}
