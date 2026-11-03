/**
 * Meta Harness Capability Brick
 * Zero-dependency, host-free pure ES module for agent routing,
 * complexity classification, adapter discovery, gate cascades, and SSSS receipts.
 * Works identically in any standalone app, edge device, workstation, or cloud environment.
 */

export const ADAPTER_CATALOG = {
  agy: {
    id: 'agy',
    name: 'Google Antigravity CLI',
    bin: 'agy',
    family: 'google',
    tier: 'frontier',
    billingModel: 'subscription',
    speed: 'fast',
    costScore: 6,
    qualityScore: 9.2,
    contextLimit: 1048576,
    modalities: ['text', 'code', 'image', 'audio', 'video'],
    features: ['subagents', 'mcp', 'headless', 'worktrees', 'live_api'],
    flags: { prompt: '-p', nonInteractive: '--mode accept-edits', planMode: '--mode plan', output: '--output-format json' }
  },
  claude: {
    id: 'claude',
    name: 'Anthropic Claude Code',
    bin: 'claude',
    family: 'anthropic',
    tier: 'frontier',
    billingModel: 'subscription',
    speed: 'balanced',
    costScore: 8,
    qualityScore: 9.5,
    contextLimit: 200000,
    modalities: ['text', 'code'],
    features: ['subagents', 'mcp', 'headless', 'compact', 'plan_mode'],
    flags: { prompt: '-p', nonInteractive: '--permission-mode acceptEdits', planMode: '--permission-mode plan', output: '--output-format json' }
  },
  codex: {
    id: 'codex',
    name: 'OpenAI Codex CLI',
    bin: 'codex',
    family: 'openai',
    tier: 'frontier',
    billingModel: 'subscription',
    speed: 'balanced',
    costScore: 8,
    qualityScore: 9.3,
    contextLimit: 128000,
    modalities: ['text', 'code'],
    features: ['mcp', 'headless', 'streaming'],
    flags: { prompt: 'exec', nonInteractive: '--sandbox workspace-write', planMode: '--sandbox read-only', output: '--json' }
  },
  grok: {
    id: 'grok',
    name: 'xAI Grok CLI',
    bin: 'grok',
    family: 'xai',
    tier: 'frontier',
    billingModel: 'subscription',
    speed: 'fast',
    costScore: 6,
    qualityScore: 8.8,
    contextLimit: 131072,
    modalities: ['text', 'code', 'image'],
    features: ['headless', 'search_live'],
    flags: { prompt: '-p', nonInteractive: '--yes', output: '--output-format json' }
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama Local Runtime',
    bin: 'ollama',
    family: 'local-open-weights',
    tier: 'local',
    billingModel: 'local',
    speed: 'ultra-fast',
    costScore: 0,
    qualityScore: 7.5,
    contextLimit: 32768,
    modalities: ['text', 'code'],
    features: ['offline', 'zero_cost', 'pipe_stdin', 'gpu_accelerated'],
    flags: { prompt: 'run', nonInteractive: '', output: '' }
  },
  hermes: {
    id: 'hermes',
    name: 'Hermes Agent Runtime',
    bin: 'hermes',
    family: 'nous-open-weights',
    tier: 'local',
    billingModel: 'local',
    speed: 'fast',
    costScore: 1,
    qualityScore: 8.2,
    contextLimit: 65536,
    modalities: ['text', 'code'],
    features: ['gateway', 'mesh_dispatch', 'tool_calling'],
    flags: { prompt: 'chat', nonInteractive: '--oneshot', output: '--format stream-json' }
  },
  dsh: {
    id: 'dsh',
    name: 'DeepSeek Harness',
    bin: 'dsh',
    family: 'deepseek',
    tier: 'budget',
    billingModel: 'metered',
    speed: 'balanced',
    costScore: 2,
    qualityScore: 8.9,
    contextLimit: 65536,
    modalities: ['text', 'code'],
    features: ['cost_efficient', 'deep_reasoning', 'mesh_routing'],
    flags: { prompt: '-', nonInteractive: '--profile headless', output: '--json' }
  },
  openclaw: {
    id: 'openclaw',
    name: 'OpenClaw Multi-Agent Gateway',
    bin: 'openclaw',
    family: 'multi-provider',
    tier: 'specialized',
    billingModel: 'metered',
    speed: 'balanced',
    costScore: 5,
    qualityScore: 8.4,
    contextLimit: 65536,
    modalities: ['text', 'code'],
    features: ['multi_channel', 'skill_orchestration'],
    flags: { prompt: 'agent', nonInteractive: '--message', output: '--json' }
  },
  aider: {
    id: 'aider',
    name: 'Aider Pair Programmer',
    bin: 'aider',
    family: 'multi-provider',
    tier: 'budget',
    billingModel: 'metered',
    speed: 'balanced',
    costScore: 4,
    qualityScore: 8.7,
    contextLimit: 128000,
    modalities: ['text', 'code'],
    features: ['git_repo_map', 'lint_auto_fix'],
    flags: { prompt: '--message', nonInteractive: '--yes', output: '' }
  },
  goose: {
    id: 'goose',
    name: 'Block Goose Developer Agent',
    bin: 'goose',
    family: 'multi-provider',
    tier: 'specialized',
    billingModel: 'metered',
    speed: 'balanced',
    costScore: 5,
    qualityScore: 8.3,
    contextLimit: 65536,
    modalities: ['text', 'code'],
    features: ['mcp', 'tool_calling'],
    flags: { prompt: 'run', nonInteractive: '--text', output: '' }
  },
  openhands: {
    id: 'openhands',
    name: 'OpenHands Autonomous SWE',
    bin: 'openhands',
    family: 'multi-provider',
    tier: 'frontier',
    billingModel: 'metered',
    speed: 'deliberate',
    costScore: 7,
    qualityScore: 9.0,
    contextLimit: 128000,
    modalities: ['text', 'code'],
    features: ['sandboxed_docker', 'swe_bench_optimized'],
    flags: { prompt: '-t', nonInteractive: '--headless', output: '--json' }
  },
  cline: {
    id: 'cline',
    name: 'Cline Autonomous CLI',
    bin: 'cline',
    family: 'multi-provider',
    tier: 'specialized',
    billingModel: 'metered',
    speed: 'balanced',
    costScore: 5,
    qualityScore: 8.5,
    contextLimit: 128000,
    modalities: ['text', 'code'],
    features: ['mcp', 'terminal_integration'],
    flags: { prompt: 'task', nonInteractive: '-y', output: '--json' }
  },
  muse: {
    id: 'muse',
    name: 'Meta Muse Code',
    bin: 'muse',
    family: 'meta',
    tier: 'specialized',
    billingModel: 'subscription',
    speed: 'fast',
    costScore: 4,
    qualityScore: 8.4,
    contextLimit: 128000,
    modalities: ['text', 'code'],
    features: ['headless', 'jsonl_events'],
    flags: { prompt: 'exec', nonInteractive: '--json', output: '--json' }
  },
  pi: {
    id: 'pi',
    name: 'Pi Coding Agent',
    bin: 'pi',
    family: 'multi-provider',
    tier: 'budget',
    billingModel: 'metered',
    speed: 'fast',
    costScore: 3,
    qualityScore: 8.3,
    contextLimit: 128000,
    modalities: ['text', 'code'],
    features: ['minimal_tools', 'headless_json'],
    flags: { prompt: '--print', nonInteractive: '--mode json', output: '--mode json' }
  }
};

/**
 * Validate custom or dynamically loaded adapter manifest
 */
export function validateAdapterManifest(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    return { valid: false, errors: ['Adapter manifest must be an object'] };
  }
  const errors = [];
  if (!adapter.name || typeof adapter.name !== 'string') errors.push('Missing string field: name');
  const bin = adapter.bin || adapter.binary;
  if (!bin || typeof bin !== 'string') errors.push('Missing string field: bin (or binary)');
  if (typeof adapter.costScore !== 'number') errors.push('Missing numeric field: costScore');
  if (typeof adapter.qualityScore !== 'number') errors.push('Missing numeric field: qualityScore');

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Deterministic Complexity Classifier (Jev RouteLLM heuristic)
 * Scores prompt on: multi-file keywords, architectural decisions,
 * security boundaries, math/crypto, and instruction surface length.
 */
export function classifyTaskComplexity(taskDescription, options = {}) {
  const text = String(taskDescription || '').toLowerCase();
  let score = 0;
  const factors = [];

  if (/refactor|architect|redesign|migrate|framework|unif/.test(text)) {
    score += 35;
    factors.push('architectural-scope');
  }
  if (/auth|crypto|fido2|passkey|secret|credential|token|sandbox|isolation/.test(text)) {
    score += 30;
    factors.push('security-sensitive');
  }
  if (/multi-file|across (all|every)|entire (repo|fleet)|worktree/.test(text)) {
    score += 25;
    factors.push('broad-blast-radius');
  }
  if (/benchmark|telemetry|concurrency|race condition|memory leak/.test(text)) {
    score += 20;
    factors.push('complex-debugging');
  }
  if (/typo|rename|docstring|comment|formatting|readme|lint fix/.test(text)) {
    score -= 30;
    factors.push('low-complexity-edit');
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  if (words > 120) {
    score += 20;
    factors.push('long-instruction-surface');
  } else if (words < 15) {
    score -= 10;
    factors.push('terse-instruction');
  }

  if (options.preferLocal) {
    score -= 40;
    factors.push('prefer-local-override');
  }
  if (options.preferFrontier) {
    score += 50;
    factors.push('prefer-frontier-override');
  }

  const bounded = Math.max(0, Math.min(100, 50 + score));
  let tier = 'budget';
  if (bounded >= 70) {
    tier = 'frontier';
  } else if (bounded <= 35) {
    tier = 'local';
  }

  return {
    score: bounded,
    tier,
    factors,
    isFrontierRecommended: tier === 'frontier',
    isLocalRecommended: tier === 'local'
  };
}

/**
 * Resolve normalized adapter specification from string ID or object
 */
function resolveAdapterEntry(h, catalog = ADAPTER_CATALOG) {
  if (typeof h === 'string') {
    return catalog[h] || {
      id: h,
      bin: h,
      name: h,
      family: 'custom',
      tier: 'budget',
      qualityScore: 6.0,
      costScore: 4.0
    };
  }
  const id = h.id || h.bin || h.binary || 'custom';
  const base = catalog[id] || {};
  return {
    ...base,
    ...h,
    id,
    bin: h.bin || h.binary || base.bin || id,
    name: h.name || base.name || id,
    family: h.family || base.family || 'custom',
    tier: h.tier || base.tier || 'budget',
    qualityScore: typeof h.qualityScore === 'number' ? h.qualityScore : (base.qualityScore ?? 6.0),
    costScore: typeof h.costScore === 'number' ? h.costScore : (base.costScore ?? 4.0)
  };
}

/**
 * Select optimal harness based on complexity score, actual installed availability,
 * quota headroom, and optional empirical scorecard pass rates.
 */
export function selectOptimalHarness(taskDescription, availableHarnesses = [], quotaStatus = {}, options = {}) {
  const catalog = options.catalog || ADAPTER_CATALOG;
  const empiricalScorecard = options.empiricalScorecard || {};
  const complexity = classifyTaskComplexity(taskDescription, options);

  const pool = availableHarnesses.length > 0
    ? availableHarnesses.map(h => resolveAdapterEntry(h, catalog))
    : Object.values(catalog);

  // Filter out harnesses that are explicitly reported as exhausted or rate-limited (>95% measured usage)
  // or local models when host memory is critically low
  const viable = pool.filter(h => {
    const q = quotaStatus[h.id] || quotaStatus[h.bin];
    if (!q) return true;
    if (q.status === 'exhausted' || q.status === 'unavailable' || q.status === 'low-ram') return false;
    if (typeof q.usagePercent === 'number' && q.usagePercent >= 95) return false;
    return true;
  });

  const candidates = viable.length > 0 ? viable : pool;
  const isFrontier = complexity.tier === 'frontier';
  const isLocal = complexity.tier === 'local';

  const ranked = candidates.map(h => {
    let rawUtility = 0;
    if (isFrontier) {
      rawUtility = (h.qualityScore * 2.0) - (h.costScore * 0.2);
      if (h.tier === 'frontier') rawUtility += 5.0;
    } else if (isLocal) {
      rawUtility = (10 - h.costScore) * 2.0 + (h.tier === 'local' ? 5.0 : 0);
    } else {
      rawUtility = (h.qualityScore * 1.0) - (h.costScore * 0.8);
      if (h.tier === 'budget') rawUtility += 3.0;
    }

    // Penalize harnesses that are installed but currently unauthenticated so ready harnesses rank first
    const q = quotaStatus[h.id] || quotaStatus[h.bin];
    if (q && q.status === 'needs_auth') {
      rawUtility -= 6.0;
    }

    // Factor in empirical local pass rate if at least 2 runs recorded
    const emp = empiricalScorecard[h.id] || empiricalScorecard[h.bin];
    if (emp && emp.total >= 2 && typeof emp.passRate === 'number') {
      const bonus = ((emp.passRate - 75) / 25) * 2.0; // -6.0 to +2.0 adjustment
      rawUtility += bonus;
    }

    return {
      harness: h.id || h.bin,
      name: h.name,
      family: h.family || 'custom',
      tier: h.tier,
      utility: parseFloat(rawUtility.toFixed(3)),
      complexityMatched: h.tier === complexity.tier
    };
  }).sort((a, b) => b.utility - a.utility);

  return {
    selected: ranked[0]?.harness || pool[0]?.id || pool[0]?.bin || null,
    complexity,
    candidates: ranked
  };
}

/**
 * Pure deterministic envelope builder for preflight and execution context
 */
export function buildBootstrapEnvelope(task, options = {}) {
  const timestamp = options.timestamp || new Date().toISOString();
  const normalizedTask = String(task || '').trim();
  const harness = options.harness || 'unknown';
  return {
    id: options.id || `envelope-${harness}-${Buffer.from(normalizedTask.slice(0, 48)).toString('hex').slice(0, 12) || 'task'}`,
    task: normalizedTask,
    action: options.action || 'read,edit,test',
    ready: options.ready !== false,
    harness,
    timestamp,
    contextCapsule: {
      requiredRules: options.requiredRules || [],
      plugins: options.plugins || [],
      budget: options.budget || 17000
    },
    verificationReceipt: {
      preflightPassed: options.preflightPassed !== false,
      ackTime: timestamp
    }
  };
}

/**
 * Evaluate deterministic code quality gate cascade (FrugalGPT concept).
 * Escalates to a higher tier (or cross-family frontier model) from the caller's
 * actual available pool rather than assuming hardcoded binaries.
 */
export function evaluateGateCascade(currentHarness, gateResults = {}, availableHarnesses = []) {
  const { testsPassed = true, linterPassed = true, typecheckPassed = true } = gateResults;
  const passedAll = testsPassed && linterPassed && typecheckPassed;

  if (passedAll) {
    return {
      escalationRequired: false,
      recommendedHarness: currentHarness,
      reason: 'All deterministic gates passed.'
    };
  }

  const pool = availableHarnesses.length > 0
    ? availableHarnesses.map(h => resolveAdapterEntry(h))
    : Object.values(ADAPTER_CATALOG);

  const currentSpec = resolveAdapterEntry(currentHarness);
  const currentTier = currentSpec.tier || 'budget';
  const currentFamily = currentSpec.family || 'unknown';

  const byUtility = (list) => [...list].sort((a, b) => (b.qualityScore - a.qualityScore) || (a.costScore - b.costScore));

  let nextSpec = null;
  let reason = 'Gate failures detected; escalating to higher-capability harness.';

  if (currentTier === 'local') {
    const budgetPool = byUtility(pool.filter(h => h.tier === 'budget' && h.id !== currentSpec.id));
    const frontierPool = byUtility(pool.filter(h => h.tier === 'frontier' && h.id !== currentSpec.id));
    nextSpec = budgetPool[0] || frontierPool[0] || byUtility(pool.filter(h => h.id !== currentSpec.id))[0];
    reason = `Local tier (${currentSpec.id}) failed quality gates; escalating to ${nextSpec?.tier || 'next'} tier (${nextSpec?.id || currentSpec.id}).`;
  } else if (currentTier === 'budget' || currentTier === 'specialized') {
    const frontierPool = byUtility(pool.filter(h => h.tier === 'frontier' && h.id !== currentSpec.id));
    nextSpec = frontierPool[0] || byUtility(pool.filter(h => h.id !== currentSpec.id))[0];
    reason = `${currentTier} tier (${currentSpec.id}) failed quality gates; escalating to frontier harness (${nextSpec?.id || currentSpec.id}).`;
  } else {
    // Already frontier: pick a frontier harness from a DIFFERENT model family to break confirmation bias
    const crossFamilyFrontier = byUtility(pool.filter(h => h.tier === 'frontier' && h.id !== currentSpec.id && h.family !== currentFamily));
    const anyOtherFrontier = byUtility(pool.filter(h => h.tier === 'frontier' && h.id !== currentSpec.id));
    nextSpec = crossFamilyFrontier[0] || anyOtherFrontier[0] || byUtility(pool.filter(h => h.id !== currentSpec.id))[0];
    reason = `Primary frontier harness (${currentSpec.id}) failed gates; cross-auditing with distinct model family (${nextSpec?.id || currentSpec.id}).`;
  }

  return {
    escalationRequired: true,
    previousHarness: currentSpec.id,
    recommendedHarness: nextSpec?.id || currentSpec.id,
    reason,
    failures: {
      tests: !testsPassed,
      linter: !linterPassed,
      typecheck: !typecheckPassed
    }
  };
}

/**
 * Compute empirical scorecard from ledger runs
 */
export function computeEmpiricalScorecard(historyRuns = []) {
  const summary = {};
  for (const run of historyRuns) {
    const h = run.harness || 'unknown';
    if (!summary[h]) {
      summary[h] = { total: 0, passed: 0, failed: 0, totalDurationMs: 0, passRate: 0, avgDurationMs: 0 };
    }
    summary[h].total += 1;
    if (run.success) {
      summary[h].passed += 1;
    } else {
      summary[h].failed += 1;
    }
    summary[h].totalDurationMs += (run.durationMs || 0);
  }

  for (const h of Object.keys(summary)) {
    const item = summary[h];
    item.passRate = item.total > 0 ? parseFloat(((item.passed / item.total) * 100).toFixed(1)) : 0;
    item.avgDurationMs = item.total > 0 ? Math.round(item.totalDurationMs / item.total) : 0;
  }

  return summary;
}

/**
 * Meta Harness Brick Factory
 */
export function createMetaHarness(customAdapters = {}) {
  const mergedAdapters = { ...ADAPTER_CATALOG, ...customAdapters };
  return {
    catalog: mergedAdapters,
    validateAdapter: (adapter) => validateAdapterManifest(adapter),
    classify: (task, opts) => classifyTaskComplexity(task, opts),
    select: (task, available, quotas, opts) => selectOptimalHarness(task, available, quotas, { ...opts, catalog: mergedAdapters }),
    buildEnvelope: (task, opts) => buildBootstrapEnvelope(task, opts),
    evaluateCascade: (harness, gates, available) => evaluateGateCascade(harness, gates, available),
    scorecard: (runs) => computeEmpiricalScorecard(runs)
  };
}
