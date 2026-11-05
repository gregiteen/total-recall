import { parseLayerFlag } from './agent-dir.mjs';
import { loadContextNodes } from './context.mjs';
import { curatedRules, selectRules } from '../core/context-policy.mjs';
import { compactRules } from '../core/context-compactor.mjs';
import { cosineSimilarity, getEmbedding, loadEmbeddingsIndex } from '../core/embeddings.mjs';
import { legacyRuleContributions } from '../core/surface.mjs';

const DEFAULT_BUDGET = 4000;
const EMBED_TIMEOUT_MS = 8000;

const USAGE = `Usage: total-recall compact "task" [--budget 4000] [--action edit,test] [--expand slug,slug] [--format text|json] [--project|--global]
Fits the applicable rules into --budget estimated tokens, ranked against the task. Rules keep their own words: full text, a leading excerpt, or a slug under Referenced. Read any of them in full with --expand. The output is partial by design; \`total-recall context\` prints the complete capsule.`;

function parseArgs(args) {
  const options = { budget: DEFAULT_BUDGET, actions: [], expand: [], format: 'text' };
  for (let i = 1; i < args.length; i++) {
    const flag = args[i];
    const value = args[++i];
    if (flag === '--budget') options.budget = Number(value);
    else if (flag === '--action') options.actions = value?.split(',').filter(Boolean) || [];
    else if (flag === '--expand') options.expand = value?.split(',').filter(Boolean) || [];
    else if (flag === '--format' && ['json', 'text'].includes(value)) options.format = value;
    else throw new Error(`Unknown compact option: ${flag}`);
  }
  if (!Number.isFinite(options.budget) || options.budget < 1) throw new Error('--budget must be a positive number of tokens');
  return options;
}

function loadVectors(derivedDirs) {
  const vectors = {};
  for (const dir of derivedDirs) {
    try {
      for (const [slug, entry] of Object.entries(loadEmbeddingsIndex(dir))) vectors[slug] ??= entry.embedding;
    } catch { /* a brain without an index simply contributes no vectors */ }
  }
  return vectors;
}

async function embedTask(task) {
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), EMBED_TIMEOUT_MS); });
  try {
    return await Promise.race([getEmbedding(task), timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function lexicalScore(terms, text) {
  if (!terms.length) return 0;
  const haystack = text.toLowerCase();
  return terms.filter(term => haystack.includes(term)).length / terms.length;
}

/** Rank the applicable rules against the task and fit them into `budget`. Shared by `compact` and `context`. */
export async function compactNodes({ task, actions = [], budget, expand = [], complete = false, rank = true, nodes, skillsDir, derivedDirs, header }) {
  const rules = selectRules(curatedRules(nodes), { actions, projectRoot: process.cwd() });
  const vectors = loadVectors(derivedDirs);
  const taskVector = rank ? await embedTask(task) : null;
  const terms = String(task).toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) || [];
  const semantic = Boolean(taskVector);

  const score = (slug, text) => semantic && vectors[slug] ? cosineSimilarity(taskVector, vectors[slug]) : lexicalScore(terms, text);
  const items = rules.map(node => {
    const body = (node._directive || node.body || node.content || '').trim();
    return {
      slug: node.slug, body, priority: node.priority, importance: node.importance,
      text: node._directive ? `[${node.slug}] ${node._directive}` : `## ${node.title || node.slug} [${node.slug}]\n\n${body}`,
      vector: vectors[node.slug], score: score(node.slug, `${node.title || ''} ${body}`),
    };
  });
  for (const { id, text } of legacyRuleContributions(skillsDir)) {
    items.push({ slug: id, body: text, text, score: lexicalScore(terms, text) });
  }

  const ranking = semantic ? 'semantic' : 'lexical';
  return { ranking, ...compactRules(items, { budget, expand, complete, header: (counts, tokens) => header(counts, tokens, ranking) }) };
}

export default async function compact(args = []) {
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return;
  }
  const { layer, remainingArgs } = parseLayerFlag(args);
  const task = remainingArgs[0];
  const { budget, actions, expand, format } = parseArgs(remainingArgs);
  const { nodes, skillsDir, derivedDirs } = loadContextNodes(layer);
  const header = (counts, tokens, ranking) => [
    `compacted:true tokens:${tokens} budget:${budget} rules:${counts.rules} full:${counts.full} summarized:${counts.summarized} referenced:${counts.referenced} duplicate:${counts.duplicate} omitted:${counts.omitted} ranking:${ranking}`,
    'PARTIAL: read any rule in full with --expand <slug>; total-recall context prints the complete capsule.',
  ].join('\n');

  let result;
  try {
    result = await compactNodes({ task, actions, budget, expand, nodes, skillsDir, derivedDirs, header });
  } catch (error) {
    console.log(error.requiredBudget ? `compacted:false reason:budget-too-small budget:${budget} required_budget:${error.requiredBudget}` : `compacted:false reason:${error.message}`);
    process.exitCode = 2;
    return;
  }
  const { context, counts, tokens, tiers, ranking } = result;
  console.log(format === 'json'
    ? JSON.stringify({ compacted: true, ranking, budget, tokens, counts, tiers, context })
    : context);
}
