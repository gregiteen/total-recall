import fs from 'node:fs';
import path from 'node:path';
import { getBothBrains } from './agent-dir.mjs';
import { getNodes } from '../core/vault-cache.mjs';
import { mergeGlobalRuleNodes } from '../core/surface.mjs';
import { isBrainEnabled } from '../core/brain-registry.mjs';
import {
  CONTEXT_ACTIONS, RULE_CATEGORIES, curatedRules, selectRules, ruleFingerprint, estimateTokens, ruleAppliesToRepo,
} from '../core/context-policy.mjs';
import remember from './remember.mjs';
import edit from './edit.mjs';

const POLICY_SLUG = 'context-policy';
const ALL_ACTIONS = [...CONTEXT_ACTIONS];
const DEFAULT_BUDGET = 4000;

function help() {
  console.log(`
  total-recall rules — keep the instruction capsule short in any repo

  Usage: total-recall rules <command> [options]

    audit   [--budget N] [--top N] [--json]   Capsule size per action, largest rules, curation health
    draft   [--all] [--actions a,b] [--out F]  Write a policy scaffold (original text as directives) to shorten
    apply   <file> [--dry-run] [--allow-exclude]  Validate a policy file and merge it into this repo's policy node
    verify  [--budget N]                       Exit 1 on stale/orphan curation or an action capsule over budget
    prune   [--apply] [--archive]              Drop stale policy entries; list (or archive) expired/superseded/duplicate rules

  Workflow: audit -> draft -> shorten each directive by hand (keep every operative
  constraint; history and quotes stay in the original rule) -> apply -> verify.
  Originals are never changed. Curation lives in one project decision tagged
  context:policy and is private runtime state, never shipped in scaffolds.
  A rule edited after curation reverts to its full text until re-applied (verify shows it).
`);
}

function loadState() {
  const brains = getBothBrains();
  const own = brains.project && isBrainEnabled(brains.project.brainDir) ? brains.project.brainDir : null;
  if (!own) throw new Error('rules needs an enabled project brain (run from the repo, or total-recall init --project)');
  const global = brains.global && isBrainEnabled(brains.global.brainDir) ? brains.global.brainDir : null;
  const repo = path.basename(process.cwd()).toLowerCase();
  // Rules scoped to other repos never reach this capsule, so they are neither audited nor curated here.
  const nodes = mergeGlobalRuleNodes(getNodes(path.join(own, 'memory-vault')),
    global ? getNodes(path.join(global, 'memory-vault')) : []).filter(n => !RULE_CATEGORIES.has(n.category) || ruleAppliesToRepo(n, repo));
  // Superseded and expired rules never reach a capsule either; prune lists them from `all`.
  const all = nodes;
  const live = nodes.filter(n => !RULE_CATEGORIES.has(n.category) || (!n.superseded_by && !(n.expires_at && Date.parse(n.expires_at) <= Date.now())));
  const policies = live.filter(n => n._layer !== 'global' && n.category === 'decisions' && n.status === 'active' &&
    !n.superseded_by && n.tags?.includes('context:policy'));
  let policy = { rules: {} }, health = 'none', node = null;
  if (policies.length > 1) health = 'ambiguous';
  else if (policies.length === 1) {
    node = policies[0];
    try {
      const parsed = JSON.parse(node.body || '');
      if (parsed.rules && typeof parsed.rules === 'object' && !Array.isArray(parsed.rules)) { policy = parsed; health = 'ok'; }
      else health = 'malformed';
    } catch { health = 'malformed'; }
  }
  const ids = new Map(live.filter(n => RULE_CATEGORIES.has(n.category)).map(n => [`${n._layer || 'project'}:${n.slug}`, n]));
  const stale = [], orphan = [];
  for (const [id, entry] of Object.entries(policy.rules)) {
    const n = ids.get(id);
    if (!n) orphan.push(id);
    else if (entry.source_hash !== ruleFingerprint(n)) stale.push(id);
  }
  return { own, nodes: live, all, node, policy, health, ids, stale, orphan };
}

const rawText = n => `## ${n.title || n.slug} [${n.slug}]\n\n${(n.body || n.content || '').trim()}`;
const renderOf = n => (n._directive ? `[${n.slug}] ${n._directive}` : rawText(n));

function capsuleTokens(nodes, actions) {
  const rules = selectRules(curatedRules(nodes), { actions, projectRoot: process.cwd() });
  return { tokens: estimateTokens(rules.map(renderOf).join('\n\n---\n\n')), count: rules.length };
}

function sizes(state) {
  const sets = [[], ...ALL_ACTIONS.map(a => [a]), ['edit', 'publish']];
  return sets.map(actions => ({ actions: actions.join(',') || '(none)', ...capsuleTokens(state.nodes, actions) }));
}

function parseFlags(args, valued = []) {
  const flags = {}, rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (valued.includes(k)) flags[k] = args[++i]; else flags[k] = true;
    } else rest.push(a);
  }
  return { flags, rest };
}

function audit(args) {
  const { flags } = parseFlags(args, ['budget', 'top']);
  const budget = Number(flags.budget) || DEFAULT_BUDGET;
  const state = loadState();
  const curated = curatedRules(state.nodes);
  const rows = curated.filter(n => RULE_CATEGORIES.has(n.category) && n.status === 'active').map(n => {
    const id = `${n._layer || 'project'}:${n.slug}`;
    const original = estimateTokens(rawText(n));
    const current = estimateTokens(renderOf(n));
    return { id, original, current, curated: Boolean(n._directive), excluded: Boolean(n._contextExcluded) };
  });
  const sz = sizes(state);
  const over = sz.filter(s => s.actions !== '(none)' && s.tokens > budget);
  const report = {
    policy: state.health, rules: rows.length, curated: rows.filter(r => r.curated).length,
    excluded: rows.filter(r => r.excluded).length, stale: state.stale, orphan: state.orphan,
    budget, capsules: sz, over_budget: over.map(s => s.actions),
    largest: rows.filter(r => !r.excluded).sort((a, b) => b.current - a.current).slice(0, Number(flags.top) || 15),
  };
  if (flags.json) { console.log(JSON.stringify(report, null, 1)); return; }
  console.log(`Policy: ${report.policy}; ${report.rules} rules, ${report.curated} curated, ${report.excluded} excluded`);
  if (state.stale.length) console.log(`Stale curation (rule edited since; full text in use): ${state.stale.join(', ')}`);
  if (state.orphan.length) console.log(`Orphan curation (rule gone): ${state.orphan.join(', ')}`);
  console.log(`\nCapsule tokens by action (budget ${budget}):`);
  for (const s of sz) console.log(`  ${s.actions !== '(none)' && s.tokens > budget ? 'OVER' : 'ok  '} ${String(s.tokens).padStart(6)}  ${s.actions} (${s.count} rules)`);
  console.log('\nLargest rules (current/original tokens):');
  for (const r of report.largest) console.log(`  ${String(r.current).padStart(5)}/${String(r.original).padEnd(5)} ${r.id}${r.curated ? ' (curated)' : ''}`);
  if (over.length) console.log('\nOver budget: run `total-recall rules draft --out policy.json`, shorten the directives, then `rules apply policy.json`.');
}

function draft(args) {
  const { flags } = parseFlags(args, ['actions', 'out']);
  const actions = flags.actions ? String(flags.actions).split(',').filter(Boolean) : ALL_ACTIONS;
  const bad = actions.filter(a => a !== 'universal' && !CONTEXT_ACTIONS.has(a));
  if (bad.length) throw new Error(`Unsupported action(s): ${bad.join(', ')}`);
  const state = loadState();
  const rules = {};
  const keep = flags.all ? {} : Object.fromEntries(Object.entries(state.policy.rules)
    .filter(([id]) => !state.stale.includes(id) && !state.orphan.includes(id)));
  Object.assign(rules, keep);
  const todo = [];
  for (const n of state.nodes) {
    if (!RULE_CATEGORIES.has(n.category) || n.status !== 'active') continue;
    const id = `${n._layer || 'project'}:${n.slug}`;
    if (!flags.all && keep[id]) continue;
    const body = (n.body || n.content || '').trim();
    todo.push([id, { source_hash: ruleFingerprint(n), actions, directive: body, original_tokens: estimateTokens(rawText(n)), title: n.title || n.slug }]);
  }
  todo.sort((a, b) => b[1].original_tokens - a[1].original_tokens);
  for (const [id, e] of todo) rules[id] = e;
  const text = JSON.stringify({ rules }, null, 1);
  if (flags.out) { fs.writeFileSync(flags.out, text + '\n'); console.log(`Wrote ${todo.length} scaffold entries to ${flags.out} (largest first).`); }
  else console.log(text);
  console.error('Edit each entry: shorten "directive" keeping every operative constraint, narrow "actions", or replace it with {"enabled": false, "reason": "..."} to exclude locally. Then: total-recall rules apply <file>.');
}


// Facts an agent would act on: numbers, paths, URLs, identifiers, quoted strings. A shorter directive must keep them.
export function operativeFacts(text) {
  const t = String(text || '');
  const found = new Set([
    ...(t.match(/\$?\d[\d,.]*[kKM%]?/g) || []),
    ...(t.match(/https?:\/\/\S+/g) || []),
    ...(t.match(/[\w~.-]+(?:\/[\w.-]+)+/g) || []),
    ...(t.match(/\b[A-Z][A-Z0-9_]{3,}\b/g) || []),
    ...(t.match(/\b[a-z]+_[a-z_]+\b/g) || []),
  ].map(x => x.replace(/[.,;:)(]+$/, '')).filter(x => x.length > 2 && !/^(19|20)\d\d(-\d\d)*$/.test(x) && !/^\d{1,2}$/.test(x)));
  return [...found];
}

export function validatePolicyFile(file, state, { allowExclude = false } = {}) {
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`Cannot read policy file ${file}: ${e.message}`); }
  if (!parsed.rules || typeof parsed.rules !== 'object' || Array.isArray(parsed.rules)) throw new Error('Policy file needs a top-level "rules" object');
  const errors = [], warnings = [], clean = {};
  for (const [id, entry] of Object.entries(parsed.rules)) {
    const n = state.ids.get(id);
    if (!n) { errors.push(`${id}: no such rule (use layer:slug)`); continue; }
    if (entry.source_hash !== ruleFingerprint(n)) { errors.push(`${id}: stale source_hash (rule changed; re-run draft)`); continue; }
    if (entry.enabled === false) {
      if (!allowExclude) { errors.push(`${id}: excluding a rule drops it from context; shorten it instead (or pass --allow-exclude)`); continue; }
      if (typeof entry.reason !== 'string' || !entry.reason.trim()) { errors.push(`${id}: exclusion needs a non-empty reason`); continue; }
      clean[id] = { source_hash: entry.source_hash, enabled: false, reason: entry.reason.trim() };
      continue;
    }
    const acts = entry.actions;
    if (!Array.isArray(acts) || !acts.length || acts.some(a => a !== 'universal' && !CONTEXT_ACTIONS.has(a))) { errors.push(`${id}: actions must be supported actions or "universal"`); continue; }
    if (typeof entry.directive !== 'string' || !entry.directive.trim()) { errors.push(`${id}: directive must be non-empty`); continue; }
    const body = (n.body || n.content || '').trim();
    if (entry.directive.trim().length > body.length) warnings.push(`${id}: directive is longer than the original`);
    const lost = operativeFacts(body).filter(f => !entry.directive.toLowerCase().includes(f.toLowerCase()));
    if (lost.length) warnings.push(`${id}: directive drops ${lost.slice(0, 8).join(', ')}${lost.length > 8 ? ', ...' : ''} - keep what an agent must act on`);
    clean[id] = { source_hash: entry.source_hash, actions: acts, directive: entry.directive.trim() };
  }
  return { clean, errors, warnings };
}

async function apply(args) {
  const { flags, rest } = parseFlags(args);
  if (!rest[0]) throw new Error('Usage: total-recall rules apply <file> [--dry-run]');
  const state = loadState();
  if (state.health === 'ambiguous') throw new Error('More than one active context:policy decision; archive extras first');
  if (state.health === 'malformed') throw new Error('Existing context:policy body is not valid policy JSON; fix or archive it first');
  const { clean, errors, warnings } = validatePolicyFile(rest[0], state, { allowExclude: Boolean(flags['allow-exclude']) });
  if (errors.length) { for (const e of errors) console.error(`  ✖ ${e}`); throw new Error(`Policy rejected: ${errors.length} invalid entr${errors.length === 1 ? 'y' : 'ies'}; nothing written`); }
  for (const w of warnings) console.error(`  ⚠ ${w}`);
  const kept = Object.fromEntries(Object.entries(state.policy.rules)
    .filter(([id]) => !state.stale.includes(id) && !state.orphan.includes(id)));
  const merged = { rules: { ...kept, ...clean } };
  const before = capsuleTokens(state.nodes, ['edit']).tokens;
  if (flags['dry-run']) { console.log(`Dry run: ${Object.keys(clean).length} entries valid, ${Object.keys(merged.rules).length} total; nothing written. edit capsule now ${before} tokens.`); return; }
  const body = JSON.stringify(merged);
  if (state.node) await edit([state.node.slug, body, '--project']);
  else await remember(['decision', body, '--project', '--tags', 'context:policy', '--slug', POLICY_SLUG, '--title', 'Local rule applicability policy']);
  console.log(`Applied ${Object.keys(clean).length} entries (${Object.keys(merged.rules).length} total). Run \`total-recall rules verify\` after the vault recompiles.`);
}

function verify(args) {
  const { flags } = parseFlags(args, ['budget']);
  const budget = Number(flags.budget) || DEFAULT_BUDGET;
  const state = loadState();
  const problems = [];
  if (state.health === 'ambiguous' || state.health === 'malformed') problems.push(`policy is ${state.health}; curation is ignored`);
  for (const id of state.stale) problems.push(`stale curation: ${id} (rule edited; full text in use)`);
  for (const id of state.orphan) problems.push(`orphan curation: ${id} (rule no longer exists)`);
  for (const s of sizes(state)) if (s.actions !== '(none)' && s.tokens > budget) problems.push(`capsule for ${s.actions} is ${s.tokens} tokens > ${budget}`);
  if (problems.length) { for (const p of problems) console.log(`✖ ${p}`); process.exitCode = 1; return; }
  console.log(`✔ policy ${state.health}; every action capsule within ${budget} tokens`);
}

async function prune(args) {
  const { flags } = parseFlags(args);
  const state = loadState();
  const now = Date.now();
  const active = state.all.filter(n => RULE_CATEGORIES.has(n.category) && n.status === 'active');
  const norm = n => (n.body || n.content || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const seen = new Map(), dup = [];
  for (const n of active) {
    const k = norm(n);
    if (!k) continue;
    if (seen.has(k)) dup.push(n); else seen.set(k, n);
  }
  const expired = active.filter(n => n.expires_at && Date.parse(n.expires_at) <= now);
  const superseded = active.filter(n => n.superseded_by);
  const candidates = [...new Set([...expired, ...superseded, ...dup])].filter(n => n._layer !== 'global');
  console.log(`Stale policy entries: ${state.stale.length}; orphan: ${state.orphan.length}`);
  console.log(`Archive candidates (project rules): ${candidates.length} (expired ${expired.length}, superseded ${superseded.length}, duplicate ${dup.length})`);
  for (const n of candidates) console.log(`  ${n.slug}`);
  if (!flags.apply && !flags.archive) { console.log('Dry run. --apply drops stale/orphan policy entries; --archive archives the candidates.'); return; }
  if (flags.apply && (state.stale.length || state.orphan.length) && state.node) {
    const drop = new Set([...state.stale, ...state.orphan]);
    const rules = Object.fromEntries(Object.entries(state.policy.rules).filter(([id]) => !drop.has(id)));
    await edit([state.node.slug, JSON.stringify({ rules }), '--project']);
    console.log(`Dropped ${drop.size} stale/orphan policy entries.`);
  }
  if (flags.archive) for (const n of candidates) await edit([n.slug, '--status', 'archived', '--project']);
}

export default async function rules(args = []) {
  const [cmd, ...rest] = args;
  if (!cmd || cmd === '--help' || cmd === 'help') return help();
  if (cmd === 'audit') return audit(rest);
  if (cmd === 'draft') return draft(rest);
  if (cmd === 'apply') return apply(rest);
  if (cmd === 'verify') return verify(rest);
  if (cmd === 'prune') return prune(rest);
  throw new Error(`Unknown rules command: ${cmd}. Run total-recall rules --help`);
}
