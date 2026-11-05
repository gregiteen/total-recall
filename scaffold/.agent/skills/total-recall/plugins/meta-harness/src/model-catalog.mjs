/**
 * Model and benchmark catalog: a projection of real sources, refreshed out of band.
 * Reads never touch the network and never invent a figure. An unavailable source keeps its
 * last good data and reports its error; a source never fetched is simply absent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { derivedDir } from './paths.mjs';
import { findBinary } from './worker.mjs';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models';
const AA_URL = 'https://artificialanalysis.ai/api/v2/language/models/free';
const SWE_PRO_URL = 'https://labs.scale.com/leaderboard/swe_bench_pro_public';
const TBENCH_URL = 'https://www.tbench.ai/';
const EMPTY = () => ({ updatedAt: null, source: 'not-synced', harnessModels: {}, sources: {}, pricing: {}, codingIndex: {}, leaderboards: {} });

const catalogFile = () => path.join(derivedDir(), 'model-catalog.json');

export function getModelCatalog() {
  try {
    const data = JSON.parse(fs.readFileSync(catalogFile(), 'utf8'));
    if (data?.sources) return { ...EMPTY(), ...data };
  } catch { /* not synced yet */ }
  return EMPTY();
}

/** Compare names across catalogs: no provider prefix, no effort suffix, no punctuation. */
export function normalizeModelName(name) {
  return String(name).toLowerCase().split('/').pop().replace(/\([^)]*\)/g, ' ').replace(/[-_ ](low|medium|high|xhigh|max)\s*$/, '').replace(/[^a-z0-9]/g, '');
}

export function parseOpenRouter(json) {
  const pricing = {};
  for (const model of json?.data || []) {
    const prompt = Number(model.pricing?.prompt), completion = Number(model.pricing?.completion);
    if (!Number.isFinite(prompt) || !Number.isFinite(completion)) continue;
    pricing[normalizeModelName(model.id)] = { id: model.id, promptPer1M: +(prompt * 1e6).toFixed(4), completionPer1M: +(completion * 1e6).toFixed(4), contextWindow: model.context_length ?? null };
  }
  return pricing;
}
/** The free tier fills only some indices, so each stays null unless the provider returned it. */
export function parseArtificialAnalysis(json) {
  const index = {};
  for (const model of json?.data || []) {
    const e = model.evaluations || {};
    const row = { name: model.name, intelligenceIndex: e.artificial_analysis_intelligence_index ?? null, engineeringIndex: e.artificial_analysis_engineering_index ?? null, codingIndex: e.artificial_analysis_coding_index ?? null, agenticIndex: e.artificial_analysis_agentic_index ?? null };
    if ([row.intelligenceIndex, row.engineeringIndex, row.codingIndex, row.agenticIndex].some(value => typeof value === 'number')) index[normalizeModelName(model.slug || model.name)] = row;
  }
  return index;
}
/** Server-rendered rows read: rank, model, score, ±, confidence interval. */
export function parseSweBenchPro(html) {
  const text = String(html).replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, '|').replace(/\s*\|[\s|]*/g, '|');
  return [...text.matchAll(/\|(\d{1,3})\|([^|]{2,80})(?:\|[A-Z]{2,8})?\|(\d{1,3}\.\d+)\|±\|(\d{1,3}\.\d+)(?=\|)/g)].map(m => ({ rank: +m[1], model: m[2].replace(/\*$/, '').trim(), score: +m[3], ci95: +m[4] }));
}
/** The page embeds its leaderboard as escaped JSON: a `leaderboard` with a version name, then a `rows` array. */
export function parseTerminalBench(html) {
  const text = String(html).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  const start = text.indexOf('"rows":[');
  if (start < 0) return { benchmark: null, rows: [] };
  const open = start + '"rows":'.length;
  let depth = 0, inString = false, end = -1;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (inString) { if (c === '\\') i += 1; else if (c === '"') inString = false; continue; }
    if (c === '"') inString = true;
    else if (c === '[' || c === '{') depth += 1;
    else if (c === ']' || c === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return { benchmark: null, rows: [] };
  const plain = value => (typeof value === 'string' ? value : value?.label ?? null);
  const rows = JSON.parse(text.slice(open, end + 1)).map(row => ({
    rank: row.rank ?? null, model: plain(row.metadata?.model_display), agent: plain(row.metadata?.agent_display), effort: row.metadata?.reasoning_effort ?? null,
    score: row.metrics?.accuracy ?? null, ci95: row.metrics?.accuracy_ci95_half_width ?? null, costUSD: row.metrics?.total_cost_usd ?? null,
  })).filter(row => row.model && typeof row.score === 'number');
  const version = [...text.slice(0, start).matchAll(/"name":"(\d+)-(\d+)-(\d+)"/g)].at(-1);
  return { benchmark: version ? `${version[1]}.${version[2]}` : null, rows };
}

async function fromSource(previous, name, url, load, count) {
  try {
    const data = await load();
    const size = count(data);
    if (!size) throw new Error('Source returned no parseable rows');
    return { data, status: { ok: true, url, fetchedAt: new Date().toISOString(), count: size } };
  } catch (error) {
    return { data: null, status: { ...(previous.sources?.[name] || {}), ok: false, url, attemptedAt: new Date().toISOString(), error: String(error.message).slice(0, 300) } };
  }
}

/** Ask each installed harness for its own model list. One failing does not hide the others. */
function harnessModelList(run) {
  const readers = {
    agy: ['agy', ['models'], text => text.split('\n').map(line => line.split('\t')).filter(parts => parts.length === 2).map(([id, name]) => ({ id: id.trim(), name: name.trim() }))],
    ollama: ['ollama', ['list'], text => text.split('\n').slice(1).map(line => line.trim().split(/\s+/)[0]).filter(id => id && !/embed|bge-|minilm|rerank/i.test(id)).map(id => ({ id, name: id }))],
    codex: ['codex', ['debug', 'models'], text => (JSON.parse(text).models || []).map(model => ({ id: model.slug, name: model.display_name || model.slug }))],
  };
  const models = {}, errors = {};
  for (const [harness, [bin, args, parse]] of Object.entries(readers)) {
    const binary = findBinary(bin);
    if (!binary) continue;
    try { models[harness] = parse(run(binary, args)); } catch (error) { errors[harness] = String(error.message).slice(0, 200); }
  }
  return { models, errors };
}

function secretFrom(names) {
  for (const name of names) {
    try {
      const value = execFileSync(process.env.TOTAL_RECALL_BIN || 'total-recall', ['auth', 'secret', 'get', name], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (value) return value;
    } catch { /* try the next name */ }
  }
  return null;
}

export async function syncModelCatalog({ fetchImpl = fetch, secret = secretFrom, run = (bin, args) => execFileSync(bin, args, { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }) } = {}) {
  const previous = getModelCatalog();
  const next = { ...previous, sources: { ...previous.sources } };
  const getJson = async (url, headers = {}) => {
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };
  const getText = async url => {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  };
  const apply = (name, key, outcome) => { next.sources[name] = outcome.status; if (outcome.data) next[key] = outcome.data; };

  apply('openrouter', 'pricing', await fromSource(previous, 'openrouter', OPENROUTER_URL, async () => parseOpenRouter(await getJson(OPENROUTER_URL)), data => Object.keys(data).length));
  apply('artificialAnalysis', 'codingIndex', await fromSource(previous, 'artificialAnalysis', AA_URL, async () => {
    const key = secret(['DEVELOPER_ARTIFICIAL_ANALYSIS_API_KEY', 'ARTIFICIAL_ANALYSIS_API_KEY']);
    if (!key) throw new Error('No Artificial Analysis key in the auth store');
    const rows = {};
    for (let page = 1, more = true; more && page <= 20; page += 1) {
      const json = await getJson(`${AA_URL}?page=${page}`, { 'x-api-key': key });
      Object.assign(rows, parseArtificialAnalysis(json));
      more = json.pagination?.has_more === true;
    }
    return rows;
  }, data => Object.keys(data).length));
  next.sources.artificialAnalysis.attribution = 'Data from Artificial Analysis (artificialanalysis.ai)';

  const swe = await fromSource(previous, 'sweBenchPro', SWE_PRO_URL, async () => parseSweBenchPro(await getText(SWE_PRO_URL)), rows => rows.length);
  next.sources.sweBenchPro = swe.status;
  const terminal = await fromSource(previous, 'terminalBench', TBENCH_URL, async () => parseTerminalBench(await getText(TBENCH_URL)), parsed => parsed.rows.length);
  next.sources.terminalBench = { ...terminal.status, ...(terminal.data ? { benchmark: terminal.data.benchmark } : {}) };
  next.leaderboards = { sweBenchPro: swe.data || previous.leaderboards?.sweBenchPro || [], terminalBench: terminal.data?.rows || previous.leaderboards?.terminalBench || [] };

  const { models, errors } = harnessModelList(run);
  next.harnessModels = { ...previous.harnessModels, ...models };
  const failures = Object.entries(errors).map(([harness, error]) => `${harness}: ${error}`).join('; ');
  next.sources.harnesses = { ok: !failures, fetchedAt: new Date().toISOString(), count: Object.values(next.harnessModels).flat().length, ...(failures ? { error: failures } : {}) };
  next.updatedAt = new Date().toISOString();
  next.source = 'sync';
  saveCatalog(next);
  const failed = Object.entries(next.sources).filter(([, status]) => !status.ok).map(([name, status]) => ({ source: name, error: status.error }));
  return { ok: failed.length === 0, sources: next.sources, failed };
}

/** Attach only figures whose normalized names match. Nothing is estimated for a model without a match. */
export function joinHarnessModels(catalog = getModelCatalog()) {
  const rows = [];
  // Boards list a model once per effort or agent, best first, so the first row is its best result.
  const board = list => {
    const rows = new Map();
    for (const row of list || []) { const key = normalizeModelName(row.model); if (!rows.has(key)) rows.set(key, row); }
    return rows;
  };
  const swe = board(catalog.leaderboards?.sweBenchPro), terminal = board(catalog.leaderboards?.terminalBench);
  // A board may drop the vendor ("Opus 5.5" for claude-opus-5-5). A suffix of at least five characters still names one model.
  const lookup = (rows, key) => rows.get(key) || [...rows].find(([name]) => name.length >= 5 && key.endsWith(name))?.[1] || null;
  for (const [harness, models] of Object.entries(catalog.harnessModels || {})) for (const model of models) {
    const key = normalizeModelName(model.id);
    const pricing = catalog.pricing?.[key] || null, index = catalog.codingIndex?.[key] || null;
    rows.push({ harness, id: model.id, name: model.name, pricing, intelligenceIndex: index?.intelligenceIndex ?? null, engineeringIndex: index?.engineeringIndex ?? null, codingIndex: index?.codingIndex ?? null, agenticIndex: index?.agenticIndex ?? null, sweBenchPro: lookup(swe, key)?.score ?? null, terminalBench: lookup(terminal, key)?.score ?? null });
  }
  return rows;
}

export function saveCatalog(catalog) {
  fs.mkdirSync(path.dirname(catalogFile()), { recursive: true });
  const temporary = `${catalogFile()}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(catalog, null, 2));
  fs.renameSync(temporary, catalogFile());
  const cell = value => value ?? '-';
  const lines = ['# Fleet Model Catalog', '', `Updated: ${catalog.updatedAt}`, '', '## Sources', ''];
  for (const [name, status] of Object.entries(catalog.sources)) lines.push(`- **${name}**: ${status.ok ? `ok, ${status.count} rows, ${status.fetchedAt}` : `failed: ${status.error}`}${status.url ? ` (${status.url})` : ''}${status.attribution ? `. ${status.attribution}` : ''}`);
  lines.push('', '## Harness models', '', '| Harness | Model | Input / Output per 1M | Intelligence index | Engineering index | SWE-bench Pro | Terminal-Bench |', '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
  for (const row of joinHarnessModels(catalog)) lines.push(`| ${row.harness} | \`${row.id}\` | ${row.pricing ? `$${row.pricing.promptPer1M} / $${row.pricing.completionPer1M}` : '-'} | ${cell(row.intelligenceIndex)} | ${cell(row.engineeringIndex)} | ${cell(row.sweBenchPro)} | ${cell(row.terminalBench)} |`);
  fs.writeFileSync(path.join(path.dirname(catalogFile()), 'MODELS.md'), lines.join('\n') + '\n');
}
