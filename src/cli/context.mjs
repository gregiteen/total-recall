import path from 'node:path';
import { getBothBrains, parseLayerFlag } from './agent-dir.mjs';
import { getNodes } from '../core/vault-cache.mjs';
import { mergeGlobalRuleNodes, legacyRuleContributions } from '../core/surface.mjs';
import { compileContext, capsuleResponse, renderCapsule, PREFLIGHT_NOTICE } from '../core/context-compiler.mjs';
import { isBrainEnabled } from '../core/brain-registry.mjs';
import { surfaceInputsHash } from '../core/command-surface.mjs';
import { readConfigValue } from './config.mjs';
import { recordCapsule } from '../core/context-telemetry.mjs';

/** About 28 KB: harnesses save output over about 30 KB to a file instead of showing it, which agents then cannot read (audit C-005, F-019). */
export const CAPSULE_LIMIT = 7000;
const JSON_ESCAPE_SHARE = 0.97;
const JSON_WRAPPER_TOKENS = 128;

/** The merged rule nodes a capsule draws from, for the selected layer. */
export function loadContextNodes(layer) {
  const brains = getBothBrains();
  const own = layer !== 'global' && brains.project && isBrainEnabled(brains.project.brainDir) ? brains.project.brainDir : null;
  const global = layer !== 'project' && brains.global && isBrainEnabled(brains.global.brainDir) ? brains.global.brainDir : null;
  if (!own && !global) throw new Error('No enabled brain in selected scope');
  const nodes = own ? mergeGlobalRuleNodes(getNodes(path.join(own, 'memory-vault')), global ? getNodes(path.join(global, 'memory-vault')) : []) :
    getNodes(path.join(global, 'memory-vault')).map(n => ({ ...n, _layer: 'global' }));
  return { nodes, skillsDir: path.dirname(own || global),
    derivedDirs: [own, global].filter(Boolean).map(dir => path.join(dir, 'memory-derived')) };
}

/** The first lines of an automatically compacted capsule. `rules verify` measures with it too, so both agree on what fits. */
export const compactedHeader = (version, budget) => (counts, tokens, ranking) => [
  `ready:true compacted:true tokens:${tokens} budget:${budget} version:${version} rules:${counts.rules} full:${counts.full} summarized:${counts.summarized} referenced:${counts.referenced} duplicate:${counts.duplicate} ranking:${ranking}`,
  PREFLIGHT_NOTICE,
  `COMPACTED: every rule below still applies. Read a referenced rule with: total-recall compact "<task>" --expand <slug>`,
].join('\n');

/** Compact the over-budget capsule, or explain the budget it needs. `fullRequired` is what the uncompacted capsule would take. */
async function printCompacted({ query, actions, budget, format, version, fullRequired, nodes, skillsDir, derivedDirs }) {
  const { compactNodes } = await import('./compact.mjs');
  // JSON escaping and its wrapper count against the budget too.
  const target = format === 'json' ? Math.floor(budget * JSON_ESCAPE_SHARE) - JSON_WRAPPER_TOKENS : budget;
  const header = compactedHeader(version, budget);
  let result;
  try {
    result = await compactNodes({ task: query, actions, budget: Math.max(target, 1), complete: true, nodes, skillsDir, derivedDirs, header });
  } catch (error) {
    if (!error.requiredBudget) throw error;
    const floor = format === 'json' ? Math.ceil((error.requiredBudget + JSON_WRAPPER_TOKENS) / JSON_ESCAPE_SHARE) : error.requiredBudget;
    const requiredBudget = Math.min(fullRequired, floor);
    console.log(format === 'json'
      ? JSON.stringify({ ready: false, reason: 'budget-overflow', context: '', stats: { version, budget, required_budget: requiredBudget, overage: requiredBudget - budget, rules: error.ruleCount, token_measurement: 'estimated_chars_divided_by_four' } })
      : `ready:false reason:budget-overflow budget:${budget} required_budget:${requiredBudget} overage:${requiredBudget - budget} rules:${error.ruleCount} version:${version}\nThis budget cannot hold all ${error.ruleCount} applicable rules even compacted; \`total-recall rules audit\` lists them by size. Retry with --budget ${requiredBudget}; do not act until ready:true.`);
    process.exitCode = 2;
    return;
  }
  console.log(format === 'json'
    ? JSON.stringify({ ready: true, compacted: true, ranking: result.ranking, context: result.context, counts: result.counts,
      stats: { version, budget, total_tokens: result.tokens, token_measurement: 'estimated_chars_divided_by_four' } })
    : result.context);
}

export default async function context(args = []) {
  if (!args.length || args.includes('--help')) {
    console.log(`Usage: total-recall context "task" [--action edit,test,publish] [--budget ${CAPSULE_LIMIT}] [--format text|json] [--knowledge] [--debug] [--project|--global]\nLocal rules only by default. Unknown applicability is required. Over budget, the capsule compacts automatically: absolute rules keep at least a summary and every other rule keeps at least its slug. Configured budgets are capped at ${CAPSULE_LIMIT}; pass a larger --budget to print the full capsule. Exit 2 means the budget cannot hold every rule; do not act until ready:true. --knowledge adds supporting documents; --debug exposes inventories within the same budget. Refresh on task/action/project or policy changes.`);
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
  let actions = [], budget = Math.min(configuredBudget ?? CAPSULE_LIMIT, CAPSULE_LIMIT), format = 'text', includeKnowledge = false, debug = false;
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
  const { nodes, skillsDir, derivedDirs } = loadContextNodes(layer);
  const derivedDir = derivedDirs[0];
  const result = await compileContext({ query, actions, nodes, includeKnowledge, budget: { total: budget }, projectRoot: process.cwd(),
    derivedDir, contributions: legacyRuleContributions(skillsDir), versionInputs: surfaceInputsHash({ skillsDir }) });
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
    await printCompacted({ query, actions, budget, format, version: response.stats.version, fullRequired: response.stats.total_tokens + 32, nodes, skillsDir, derivedDirs });
    return;
  }
  console.log(renderCapsule(response, format));
  if (!response.ready) process.exitCode = 2;
}
