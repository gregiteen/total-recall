import path from 'node:path';
import { getBothBrains, parseLayerFlag } from './agent-dir.mjs';
import { getNodes } from '../core/vault-cache.mjs';
import { mergeGlobalRuleNodes, legacyRuleContributions } from '../core/surface.mjs';
import { compileContext } from '../core/context-compiler.mjs';
import { isBrainEnabled } from '../core/brain-registry.mjs';
import { surfaceInputsHash } from '../core/command-surface.mjs';

export default async function context(args = []) {
  if (!args.length || args.includes('--help')) {
    console.log('Usage: total-recall context "task" [--action edit,test,publish] [--budget 16000] [--format json|text] [--project|--global]\nLocal only. Unknown applicability is required. A required-set overflow exits 2: do not act until a complete capsule fits. Refresh on task/action/project or policy version changes.');
    return;
  }
  const { layer, remainingArgs } = parseLayerFlag(args);
  const query = remainingArgs[0];
  let actions = [], budget = 16000, format = 'json';
  for (let i = 1; i < remainingArgs.length; i++) {
    const flag = remainingArgs[i], value = remainingArgs[++i];
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
  const result = await compileContext({ query, actions, nodes, budget: { total: budget }, projectRoot: process.cwd(),
    contributions: legacyRuleContributions(skillsDir), versionInputs: surfaceInputsHash({ skillsDir }) });
  console.log(format === 'json' ? JSON.stringify(result, null, 2) : `${result.ready ? 'READY' : 'NOT READY: required instructions exceed budget'}\n${result.context}`);
  if (!result.ready) process.exitCode = 2;
}
