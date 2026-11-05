/** Budgeted task capsules: rank rules, keep verbatim text, and account for every rule left out. */

import { estimateTokens } from './context-policy.mjs';
import { cosineSimilarity } from './embeddings.mjs';

const DUPLICATE_SIMILARITY = 0.92;
const REFERENCE_SHARE = 0.4;
const TOP_FULL_SHARE = 0.3;
const SUMMARY_MAX_CHARS = 200;
const SUMMARY_MIN_CHARS = 80;
// A period here does not end a sentence.
const SENTENCE_END = /(?<!\be\.g)(?<!\bi\.e)(?<!\bvs)[.!?](?=\s|$)/g;

/** The leading sentences of a rule, verbatim. Never rewords, because rewording can change a constraint. */
export function summarizeRule(text) {
  const flat = String(text || '').replace(/^#+\s.*$/gm, ' ').replace(/\s+/g, ' ').trim();
  if (flat.length <= SUMMARY_MAX_CHARS) return flat;
  let end = 0;
  for (const match of flat.matchAll(SENTENCE_END)) {
    const candidate = match.index + 1;
    if (candidate > SUMMARY_MAX_CHARS) break;
    end = candidate;
    if (end >= SUMMARY_MIN_CHARS) return flat.slice(0, end);
  }
  if (end) return flat.slice(0, end);
  const cut = flat.lastIndexOf(' ', SUMMARY_MAX_CHARS);
  return `${flat.slice(0, cut > 0 ? cut : SUMMARY_MAX_CHARS)}…`;
}

/** Relevance alone orders the text; ties fall to importance, then slug, so output is stable. */
function rank(items) {
  return [...items].sort((a, b) =>
    (b.score || 0) - (a.score || 0) ||
    (b.importance || 3) - (a.importance || 3) ||
    a.slug.localeCompare(b.slug));
}

function findDuplicates(ranked) {
  const duplicateOf = new Map();
  const normalize = text => String(text).toLowerCase().replace(/\s+/g, ' ').trim();
  ranked.forEach((item, i) => {
    if (item.priority === 'absolute') return;
    for (const earlier of ranked.slice(0, i)) {
      if (duplicateOf.has(earlier.slug)) continue;
      const same = normalize(item.body) === normalize(earlier.body) ||
        (item.vector && earlier.vector && cosineSimilarity(item.vector, earlier.vector) >= DUPLICATE_SIMILARITY);
      if (same) { duplicateOf.set(item.slug, earlier.slug); return; }
    }
  });
  return duplicateOf;
}

/**
 * Assign each rule a tier so the printed output fits `budget`, measuring the real
 * render after every change. `header(counts, tokens)` supplies the status lines.
 */
export function compactRules(items, { budget, expand = [], header, complete = false }) {
  if (!Number.isFinite(budget) || budget < 1) throw new Error('Compact budget must be a positive token estimate');
  const ranked = rank(items);
  const known = new Set(ranked.map(item => item.slug));
  const unknown = expand.filter(slug => !known.has(slug));
  if (unknown.length) throw new Error(`Cannot expand rules not in this capsule: ${unknown.join(', ')}`);
  const duplicateOf = findDuplicates(ranked.filter(item => !expand.includes(item.slug)));
  const tiers = new Map(ranked.map(item => [item.slug, 'omitted']));

  const render = () => {
    const of = tier => ranked.filter(item => tiers.get(item.slug) === tier);
    const full = of('full'), summary = of('summary'), reference = of('reference'), duplicate = of('duplicate');
    const counts = { rules: ranked.length, full: full.length, summarized: summary.length, referenced: reference.length,
      duplicate: duplicate.length, omitted: of('omitted').length };
    const blocks = [
      ...full.map(item => item.text.trim()),
      ...summary.map(item => `[${item.slug}] ${summarizeRule(item.body)}`),
    ];
    if (reference.length) blocks.push(`Referenced: ${reference.map(item => item.slug).join(', ')}`);
    if (duplicate.length) blocks.push(`Duplicates: ${duplicate.map(item => `${item.slug} (of ${duplicateOf.get(item.slug)})`).join(', ')}`);
    const body = blocks.join('\n\n---\n\n');
    // The token count sits inside the text it counts, so iterate to a stable value.
    let tokens = estimateTokens(body);
    let context = '';
    for (let i = 0; i < 5; i++) {
      context = `${header(counts, tokens)}${body ? `\n${body}` : ''}`;
      const measured = estimateTokens(`${context}\n`);
      if (measured === tokens) break;
      tokens = measured;
    }
    return { context, counts, tokens };
  };
  const used = () => render().tokens;
  const tryTier = (item, tier, limit = budget) => {
    const previous = tiers.get(item.slug);
    tiers.set(item.slug, tier);
    if (used() <= limit) return true;
    tiers.set(item.slug, previous);
    return false;
  };

  // A complete capsule measures its own, higher floor below, so a retry at the reported number succeeds.
  const floor = used();
  if (!complete && floor > budget) {
    const error = new Error(`Budget ${budget} cannot hold the capsule header; the minimum is ${floor}`);
    error.requiredBudget = floor;
    error.ruleCount = items.length;
    throw error;
  }

  for (const slug of expand) {
    if (!tryTier(ranked.find(item => item.slug === slug), 'full')) {
      const error = new Error(`Budget ${budget} cannot hold expanded rule ${slug}; raise --budget or expand fewer rules`);
      throw error;
    }
  }
  // A complete capsule accounts for every rule before ranking spends any budget, so
  // ranking decides how much text a rule gets and never whether it applies.
  if (complete) {
    for (const item of ranked) {
      if (tiers.get(item.slug) !== 'omitted') continue;
      tiers.set(item.slug, duplicateOf.has(item.slug) ? 'duplicate' : item.priority === 'absolute' ? 'summary' : 'reference');
    }
    const completeFloor = used();
    if (completeFloor > budget) {
      const error = new Error(`Budget ${budget} cannot hold every rule; the minimum is ${completeFloor}`);
      error.requiredBudget = completeFloor;
      error.ruleCount = items.length;
      throw error;
    }
  }
  const candidates = ranked.filter(item => !duplicateOf.has(item.slug) && tiers.get(item.slug) !== 'full');

  // Slugs alone must not consume a small budget: the top rules need their text.
  const referenceLimit = used() + Math.floor((budget - used()) * REFERENCE_SHARE);
  // Absolute rules are named first, so a small budget still shows they exist.
  const unplaced = candidates.filter(item => tiers.get(item.slug) === 'omitted');
  const namedFirst = [...unplaced.filter(item => item.priority === 'absolute'), ...unplaced.filter(item => item.priority !== 'absolute')];
  for (const item of namedFirst) if (!tryTier(item, 'reference', referenceLimit)) break;
  const topLimit = used() + Math.floor((budget - used()) * TOP_FULL_SHARE);
  for (const item of candidates) tryTier(item, 'full', topLimit);
  for (const item of candidates) if (tiers.get(item.slug) !== 'full') tryTier(item, 'summary');
  for (const item of candidates) if (tiers.get(item.slug) !== 'full') tryTier(item, 'full');
  for (const item of namedFirst) if (tiers.get(item.slug) === 'omitted') tryTier(item, 'reference');
  for (const slug of duplicateOf.keys()) tryTier(ranked.find(item => item.slug === slug), 'duplicate');

  const { context, counts, tokens } = render();
  return { context, counts, tokens, tiers: Object.fromEntries(tiers) };
}
