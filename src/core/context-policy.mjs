import crypto from 'node:crypto';
import path from 'node:path';

export const RULE_CATEGORIES = new Set(['invariants', 'preferences', 'anti-patterns']);
export const CONTEXT_ACTIONS = new Set(['read', 'edit', 'test', 'build', 'publish', 'deploy', 'secrets', 'network', 'memory', 'skills', 'project']);
export const estimateTokens = text => Math.ceil(String(text || '').length / 4);

/** Curation is local, explicit and invalidated by any canonical rule change. */
export const ruleFingerprint = node => crypto.createHash('sha256').update(JSON.stringify(
  Object.fromEntries(Object.entries(node).filter(([key]) => !key.startsWith('_')).sort(([a], [b]) => a.localeCompare(b))),
)).digest('hex');

export function curatedRules(nodes, now = Date.now()) {
  const policies = nodes.filter(n => n._layer !== 'global' && n.category === 'decisions' && n.status === 'active' &&
    !n.superseded_by && !(n.expires_at && Date.parse(n.expires_at) <= now) && n.tags?.includes('context:policy'));
  // Multiple policies are ambiguous, never pick a winner by order or relevance.
  if (policies.length !== 1) return nodes;
  let rules;
  try { rules = JSON.parse(policies[0].body || '').rules; } catch { return nodes; }
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return nodes;
  return nodes.map(node => {
    const entry = rules[`${node._layer || 'project'}:${node.slug}`];
    if (!RULE_CATEGORIES.has(node.category) || !entry || entry.source_hash !== ruleFingerprint(node)) return node;
    if (entry.enabled === false && typeof entry.reason === 'string' && entry.reason.trim()) return { ...node, _contextExcluded: true };
    if (entry.enabled !== undefined && entry.enabled !== true) return node;
    if (
      !Array.isArray(entry.actions) || !entry.actions.length || entry.actions.some(a => a !== 'universal' && !CONTEXT_ACTIONS.has(a)) ||
      typeof entry.directive !== 'string' || !entry.directive.trim()) return node;
    const tags = (node.tags || []).filter(t => !t.startsWith('context:action:') && t !== 'context:universal');
    return { ...node, tags: [...tags, ...entry.actions.map(a => a === 'universal' ? 'context:universal' : `context:action:${a}`)],
      _directive: entry.directive.trim() };
  });
}

/** A rule scoped to other repos (repos[] or project) never reaches this repo's capsule. */
export function ruleAppliesToRepo(node, repo) {
  const r = String(repo).toLowerCase();
  if (node.repos?.length && !node.repos.some(x => String(x).toLowerCase() === r)) return false;
  if (node.project && String(node.project).toLowerCase() !== r) return false;
  return true;
}

/** Applicability is explicit validated memory tags, independent of obligation.
 * Unknown rules remain required in task capsules. No inference from prose.
 */
export function selectRules(nodes, { actions = [], projectRoot = process.cwd(), bootstrap = false, now = Date.now() } = {}) {
  const repo = path.basename(projectRoot).toLowerCase();
  const applicable = nodes.filter(node => {
    if (!RULE_CATEGORIES.has(node.category) || node.status !== 'active' || node.superseded_by || node._contextExcluded) return false;
    if (node.expires_at && Date.parse(node.expires_at) <= now) return false;
    if (!ruleAppliesToRepo(node, repo)) return false;
    const tags = Array.isArray(node.tags) ? node.tags : [];
    if (tags.includes('context:universal')) return true;
    if (bootstrap) return false;
    const triggers = tags.filter(t => typeof t === 'string' && t.startsWith('context:action:')).map(t => t.slice(15));
    // Unknown actions conservatively activate every conditional restriction.
    return !triggers.length || !actions.length || actions.some(action => !CONTEXT_ACTIONS.has(action)) ||
      triggers.some(trigger => !CONTEXT_ACTIONS.has(trigger) || actions.includes(trigger));
  });
  return applicable.filter(node => !applicable.some(other => other !== node && other.subject && other.subject === node.subject &&
    other.supersedes?.includes(node.slug))).sort((a, b) =>
    Number(b.priority === 'absolute') - Number(a.priority === 'absolute') || (b.importance || 3) - (a.importance || 3) || String(a.slug).localeCompare(String(b.slug)));
}

/** Pack whole contributions; required text is never truncated. Overflow blocks action. */
export function assembleContext(contributions, { total = 4000 } = {}) {
  if (!Number.isFinite(total) || total < 1) throw new Error('Context total must be a positive finite token estimate');
  const seen = new Set();
  contributions = contributions.filter(item => {
    const identity = JSON.stringify([item.id, Boolean(item.required), item.text]);
    if (seen.has(identity)) return false;
    seen.add(identity); return true;
  });
  const required = contributions.filter(c => c.required && c.text);
  const selected = [...required];
  const excluded = [];
  const render = list => list.map(c => c.text.trim()).filter(Boolean).join('\n\n---\n\n');
  const requiredTokens = estimateTokens(render(required));
  for (const item of contributions.filter(c => !c.required && c.text)) {
    if (estimateTokens(render([...selected, item])) <= total) selected.push(item);
    else excluded.push(item.id);
  }
  const context = render(selected);
  const totalTokens = estimateTokens(context);
  return { context, ready: requiredTokens <= total, stats: {
    token_measurement: 'estimated_chars_divided_by_four', total_tokens: totalTokens,
    budget_used: totalTokens, budget_remaining: Math.max(0, total - totalTokens),
    required_tokens: requiredTokens, overflow_tokens: Math.max(0, requiredTokens - total),
    required_ids: required.map(c => c.id), excluded_ids: excluded,
    contributions: selected.map(c => ({ id: c.id, required: Boolean(c.required), chars: c.text.length, estimated_tokens: estimateTokens(c.text) })),
    version: crypto.createHash('sha256').update(JSON.stringify({ total, contributions })).digest('hex'),
  } };
}
