import path from 'node:path';
import { getBothBrains, parseLayerFlag } from './agent-dir.mjs';
import { getNodes } from '../core/vault-cache.mjs';
import { mergeGlobalRuleNodes, legacyRuleContributions } from '../core/surface.mjs';
import { compileContext, capsuleResponse, renderCapsule, PREFLIGHT_NOTICE } from '../core/context-compiler.mjs';
import { isBrainEnabled } from '../core/brain-registry.mjs';
import { surfaceInputsHash } from '../core/command-surface.mjs';
import { readConfigValue } from './config.mjs';
import { recordCapsule } from '../core/context-telemetry.mjs';
import { estimateTokens } from '../core/context-policy.mjs';
import { summarizeRetrieval } from '../core/task-context.mjs';
import { findRoot, recordCapsuleDelivery, skillHashes, takeCaller } from '../core/preflight-receipt.mjs';

/** About 28 KB: harnesses save output over about 30 KB to a file instead of showing it, which agents then cannot read (audit C-005, F-019). */
export const CAPSULE_LIMIT = 7000;

/** The merged rule nodes a capsule draws from, for the selected layer. */
export function loadContextNodes(layer) {
  const brains = getBothBrains();
  const own = layer !== 'global' && brains.project && isBrainEnabled(brains.project.brainDir) ? brains.project.brainDir : null;
  const global = layer !== 'project' && brains.global && isBrainEnabled(brains.global.brainDir) ? brains.global.brainDir : null;
  if (!own && !global) throw new Error('No enabled brain in selected scope');
  const nodes = own ? mergeGlobalRuleNodes(getNodes(path.join(own, 'memory-vault')), global ? getNodes(path.join(global, 'memory-vault')) : []) :
    getNodes(path.join(global, 'memory-vault')).map(n => ({ ...n, _layer: 'global' }));
  // The repository is the brain's root, not this folder: a subfolder or a nested checkout has the same rules.
  return { nodes, projectRoot: (own && brains.project.projectRoot) || process.cwd(), skillsDir: path.dirname(own || global),
    derivedDirs: [own, global].filter(Boolean).map(dir => path.join(dir, 'memory-derived')),
    indexScopes: [own && { layer: 'project', derivedDir: path.join(own, 'memory-derived') },
      global && { layer: 'global', derivedDir: path.join(global, 'memory-derived') }].filter(Boolean) };
}

/** The first lines of an automatically compacted capsule. `rules verify` measures with it too, so both agree on what fits. */
export const compactedHeader = (version, budget, rulesHash) => (counts, tokens, ranking) => [
  `ready:true compacted:true tokens:${tokens} budget:${budget} version:${version} rules:${counts.rules} full:${counts.full} summarized:${counts.summarized} referenced:${counts.referenced} duplicate:${counts.duplicate} ranking:${ranking} rules_hash:${rulesHash}`,
  PREFLIGHT_NOTICE,
  `COMPACTED: every rule below still applies. Read a referenced rule with: total-recall compact "<task>" --expand <slug>`,
].join('\n');

/**
 * Tells a later `ack` that this session already received the capsule, so it does not print it
 * again. Only the gate knows the session, and only for a command that ran alone.
 */
function noteDelivery(query, rulesHash) {
  try {
    const root = findRoot();
    const session = takeCaller(root, 'context', { task: query });
    if (session) recordCapsuleDelivery(root, session, { rulesHash, skills: skillHashes(root).hashes, task: query });
  } catch { /* the only cost is one more printed capsule */ }
}

/**
 * Compact the over-budget capsule, or explain the budget it needs. `fullRequired` is what the uncompacted capsule would take.
 * @returns {Promise<boolean>} whether a ready capsule was printed
 */
async function printCompacted({ query, actions, budget, format, version, rulesHash, nodes, projectRoot, skillsDir, derivedDirs, knowledge }) {
  const { compactNodes } = await import('./compact.mjs');
  const header = compactedHeader(version, budget, rulesHash);
  const compact = target => compactNodes({ task: query, actions, budget: target, complete: true, nodes, projectRoot, skillsDir, derivedDirs, header,
    supplemental: knowledge?.contributions || [], taskVector: knowledge?.queryVector });
  const output = result => {
    if (format !== 'json') return result.context;
    const payload = { ready: true, compacted: true, ranking: result.ranking, context: result.context, counts: result.counts,
      stats: { version, rules_hash: rulesHash, budget, retrieval: summarizeRetrieval(knowledge?.summary), token_measurement: 'estimated_chars_divided_by_four' } };
    for (let index = 0; index < 10; index++) {
      const tokens = estimateTokens(`${JSON.stringify(payload)}\n`);
      if (tokens === payload.stats.total_tokens) break;
      payload.stats.total_tokens = tokens;
    }
    return JSON.stringify(payload);
  };
  try {
    // Encoding inflates the capsule by a varying share, so search for the compaction target that fits.
    let target = budget, low = 1, high = budget, best = null, floor = null;
    for (let attempt = 0; attempt < 12 && low <= high; attempt++) {
      let result;
      try { result = await compact(target); }
      catch (error) {
        if (!error.requiredBudget) throw error;
        floor = error;
        low = Math.max(target, error.requiredBudget > target ? error.requiredBudget : target + 1);
        target = low;
        continue;
      }
      const text = output(result), measured = estimateTokens(`${text}\n`);
      if (measured <= budget) {
        best = text;
        if (budget - measured <= Math.max(16, budget * 0.02)) break;
        low = target + 1;
      // Any target above the text it actually produced yields the same text, so step below that.
      } else high = Math.min(target, result.tokens ?? target) - 1;
      const projected = Math.floor(target * budget / measured);
      target = projected >= low && projected <= high ? projected : Math.floor((low + high) / 2);
    }
    if (best !== null) { console.log(best); return true; }
    if (floor) throw floor;
    throw new Error('Context wire accounting did not converge');
  } catch (error) {
    if (!error.requiredBudget) throw error;
    // Measure the actual floor through the same encoder; leave room for the changed budget digits on retry.
    const floor = await compact(error.requiredBudget);
    const requiredBudget = estimateTokens(`${output(floor)}\n`) + 16;
    console.log(format === 'json'
      ? JSON.stringify({ ready: false, reason: 'budget-overflow', context: '', stats: { version, budget, required_budget: requiredBudget, overage: requiredBudget - budget, rules: error.ruleCount, token_measurement: 'estimated_chars_divided_by_four' } })
      : `ready:false reason:budget-overflow budget:${budget} required_budget:${requiredBudget} overage:${requiredBudget - budget} rules:${error.ruleCount} version:${version}\nThis budget cannot hold all ${error.ruleCount} applicable rules even compacted; \`total-recall rules audit\` lists them by size. Retry with --budget ${requiredBudget}; do not act until ready:true.`);
    process.exitCode = 2;
    return false;
  }
}

export default async function context(args = []) {
  if (!args.length || args.includes('--help')) {
    console.log(`Usage: total-recall context "task" [--action edit,test,publish] [--budget ${CAPSULE_LIMIT}] [--format text|json] [--knowledge] [--debug] [--project|--global]\nApplicable rules plus semantically retrieved task memory and active plugin evidence by default; unavailable vectors use a labelled lexical fallback. Unknown rule applicability is required. Over budget, compaction preserves selected task evidence and accounts for every rule: absolute rules keep at least a summary and every other rule keeps at least its slug. Configured budgets are capped at ${CAPSULE_LIMIT}; pass a larger --budget to print the full capsule. Exit 2 means the complete capsule cannot fit; do not act until ready:true. --knowledge remains accepted; --debug exposes retrieval inventories within the same budget. Refresh on task/action/project or policy changes.`);
    return;
  }
  const { layer, remainingArgs } = parseLayerFlag(args);
  const query = remainingArgs[0];
  const configuredBudget = (() => {
    for (const candidate of [layer === 'global' ? 'global' : 'project', 'global']) {
      try {
        const value = readConfigValue('context_budget', candidate);
        if (Number.isFinite(value) && value > 0) return value;
      } catch { /* fall through to the next layer */ }
    }
    return undefined;
  })();
  let actions = [], budget = Math.min(configuredBudget ?? CAPSULE_LIMIT, CAPSULE_LIMIT), format = 'text', includeKnowledge = true, debug = false;
  for (let i = 1; i < remainingArgs.length; i++) {
    const flag = remainingArgs[i];
    if (flag === '--knowledge') { includeKnowledge = true; continue; }
    if (flag === '--debug') { debug = true; continue; }
    const value = remainingArgs[++i];
    if (flag === '--action') actions = value?.split(',').filter(Boolean) || [];
    else if (flag === '--budget') budget = Number(value);
    else if (flag === '--format' && ['json', 'text'].includes(value)) format = value;
    else throw new Error(`Unknown context option: ${flag}`);
  }
  const { nodes, projectRoot, skillsDir, derivedDirs, indexScopes } = loadContextNodes(layer);
  const derivedDir = derivedDirs[0];
  const result = await compileContext({ query, actions, nodes, includeKnowledge, budget: { total: budget }, projectRoot,
    derivedDir, indexScopes, contributions: legacyRuleContributions(skillsDir), versionInputs: surfaceInputsHash({ skillsDir }) });
  if (debug && format === 'text') throw new Error('--debug requires --format json');
  const response = capsuleResponse(result, { total: budget, debug, format });
  // Measured before the admission branch, so a capsule that failed to fit is
  // recorded too. Those refusals are the samples the budget decision needs, and
  // a measurement that only counts successes would hide the exact case it
  // exists to explain.
  recordCapsule({ ...result.stats, total_tokens: result.stats.total_tokens }, {
    derivedDir, action: actions, query, consumer: 'cli',
  });
  if (!response.ready && !debug) {
    const printed = await printCompacted({ query, actions, budget, format, version: response.stats.version, rulesHash: result.stats.rules_hash, nodes, projectRoot, skillsDir, derivedDirs, knowledge: result.taskKnowledge });
    if (printed) noteDelivery(query, result.stats.rules_hash);
    return;
  }
  console.log(renderCapsule(response, format));
  if (response.ready) noteDelivery(query, result.stats.rules_hash);
  else process.exitCode = 2;
}
