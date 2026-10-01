import path from 'node:path';
import { getBothBrains, parseLayerFlag } from './agent-dir.mjs';
import { getNodes } from '../core/vault-cache.mjs';
import { mergeGlobalRuleNodes, legacyRuleContributions } from '../core/surface.mjs';
import { compileContext, capsuleResponse, renderCapsule } from '../core/context-compiler.mjs';
import { isBrainEnabled } from '../core/brain-registry.mjs';
import { surfaceInputsHash } from '../core/command-surface.mjs';

export default async function context(args = []) {
  if (!args.length || args.includes('--help')) {
    console.log('Usage: total-recall context "task" [--action edit,test,publish] [--budget 4000] [--format text|json] [--knowledge] [--debug] [--project|--global]\nLocal rules only by default. Unknown applicability is required. Overflow exits 2; do not act until the complete output fits. --knowledge adds supporting documents; --debug exposes inventories within the same budget. Refresh on task/action/project or policy changes.');
    return;
  }
  const { layer, remainingArgs } = parseLayerFlag(args);
  const query = remainingArgs[0];
  let actions = [], budget = 4000, format = 'text', includeKnowledge = false, debug = false;
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
  const brains = getBothBrains();
  const own = layer !== 'global' && brains.project && isBrainEnabled(brains.project.brainDir) ? brains.project.brainDir : null;
  const global = layer !== 'project' && brains.global && isBrainEnabled(brains.global.brainDir) ? brains.global.brainDir : null;
  if (!own && !global) throw new Error('No enabled brain in selected scope');
  const nodes = own ? mergeGlobalRuleNodes(getNodes(path.join(own, 'memory-vault')), global ? getNodes(path.join(global, 'memory-vault')) : []) :
    getNodes(path.join(global, 'memory-vault')).map(n => ({ ...n, _layer: 'global' }));
  const skillsDir = path.dirname(own || global);
  const result = await compileContext({ query, actions, nodes, includeKnowledge, budget: { total: budget }, projectRoot: process.cwd(),
    contributions: legacyRuleContributions(skillsDir), versionInputs: surfaceInputsHash({ skillsDir }) });
  if (debug && format === 'text') throw new Error('--debug requires --format json');
  const response = capsuleResponse(result, { total: budget, debug, format });
  if (!response.ready && !debug) {
    // Admission failed: emitting bodies here makes each budget retry load the
    // same rules again. Keep the full set in the compiler/API, and admit it only
    // after the caller explicitly raises the budget or curates applicability.
    const requiredBudget = response.stats.total_tokens + 32;
    const diagnostic = { ready: false, reason: 'budget-overflow', context: '', stats: {
      version: response.stats.version, required_count: response.stats.required_count,
      budget, required_budget: requiredBudget,
      token_measurement: 'estimated_chars_divided_by_four',
    } };
    console.log(format === 'json' ? JSON.stringify(diagnostic) :
      `ready:false reason:budget-overflow budget:${budget} required_budget:${requiredBudget} required_rules:${response.stats.required_count} version:${response.stats.version}\nRetry with --budget ${requiredBudget}; do not act until ready:true.`);
    process.exitCode = 2;
    return;
  }
  console.log(renderCapsule(response, format));
  if (!response.ready) process.exitCode = 2;
}
