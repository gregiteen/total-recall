#!/usr/bin/env node
/**
 * Embeddings CLI Handler
 * Executed via: npx total-recall embeddings <subcommand>
 *
 * Owns local embedding provider discovery and index coverage for a brain:
 * which provider/model actually serves vectors, whether that endpoint is on
 * this host, and how much of the vault has a vector core can still use.
 * Building the index itself stays with `total-recall compile`, which owns the
 * embeddings.db lifecycle; this plugin only ever opens it read-only.
 *
 * The selection and coverage rules mirror total-recall-brain core
 * (src/core/ollama-embeddings.mjs, vault.mjs, embeddings.mjs). Core is not
 * imported: its logger loads config.mjs, which loads the auth owner, and a
 * read-only status must not unlock credentials. See the EMBEDDINGS_CARD
 * architecture decision of 2026-11-05.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PLUGIN_ID = 'embeddings';
const PLUGIN_DIR = path.dirname(new URL(import.meta.url).pathname);
const PLUGIN_VERSION = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, 'plugin.json'), 'utf8')).version;
const LOOPBACK_URL = 'http://127.0.0.1:11434';
// The vault index width (core embeddings.mjs EMBEDDING_DIMS). It is a storage
// constraint of the vss0 table, so a model of any other width is unusable.
const VAULT_DIMS = 768;
const PROBE_TIMEOUT_MS = 2500;
const SHOW_TIMEOUT_MS = 5000;
const EMBED_TIMEOUT_MS = 30000;
// The host runner kills a child at the manifest's timeout_ms; stay under it.
const PULL_DEADLINE_MS = 590000;
const BENCHMARK_DEADLINE_MS = 280000;
const BENCHMARK_MAX_SAMPLES = 20;
// Neutral benchmark input: never vault text, never a real contact.
const BENCHMARK_TEXT = 'The quick brown fox jumps over the lazy dog while the kettle boils.';

/** The brain this invocation targets: project brain when present, else global. */
function resolveVault() {
  const candidates = [
    path.join(process.cwd(), '.agent', 'skills', 'total-recall'),
    path.join(process.env.HOME || '', '.agent', 'skills', 'total-recall'),
  ];
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'memory-vault'))) return dir;
  }
  return null;
}

// ─── Provider: the same endpoint and model core would use ────────────────────

/** Accepts `host`, `host:port`, or a full URL, as core's normalizeBaseUrl does. */
export function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.username || u.password || u.search || u.hash || u.pathname !== '/') return null;
    const authority = withScheme.match(/^https?:\/\/([^/]+)/i)?.[1];
    if (!u.port && u.protocol === 'http:' && !/:\d+$/.test(authority)) u.port = '11434';
    return u.origin;
  } catch { return null; }
}

/** Configured endpoints first, then loopback: core's candidate order. */
function candidateUrls() {
  const configured = [process.env.TR_OLLAMA_URL, process.env.OLLAMA_HOST].map(normalizeBaseUrl).filter(Boolean);
  return [...new Set([...configured, LOOPBACK_URL])];
}

/** Whether text sent to this endpoint stays on this machine. */
export function endpointLocality(url) {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host === '::1' || /^127\./.test(host)) return 'local';
    return 'remote';
  } catch { return 'unknown'; }
}

async function fetchWithDeadline(url, options, timeoutMs) {
  return fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
}

async function listModels(url) {
  try {
    const res = await fetchWithDeadline(`${url}/api/tags`, {}, PROBE_TIMEOUT_MS);
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const data = await res.json();
    if (!Array.isArray(data?.models)) return { ok: false, reason: 'not an Ollama endpoint (no models array)' };
    return { ok: true, models: data.models };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/** First candidate that answers like Ollama, with every attempt recorded. */
async function resolveEndpoint() {
  const attempts = [];
  for (const url of candidateUrls()) {
    const listed = await listModels(url);
    attempts.push({ url, reachable: listed.ok, reason: listed.ok ? null : listed.reason });
    if (listed.ok) return { url, models: listed.models, attempts };
  }
  return { url: null, models: [], attempts };
}

async function describeModel(url, name) {
  try {
    const res = await fetchWithDeadline(`${url}/api/show`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: name }),
    }, SHOW_TIMEOUT_MS);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

/** Family-scoped width only: generative models publish other towers' widths too. */
export function embeddingWidth(info) {
  const family = info?.details?.family;
  const width = family ? info?.model_info?.[`${family}.embedding_length`] : undefined;
  return Number.isFinite(width) ? width : null;
}

/** The declared capability, never a name heuristic. */
export function canEmbed(info) {
  return Array.isArray(info?.capabilities) && info.capabilities.includes('embedding');
}

/** Every model annotated, plus the one core would select. */
async function inspectModels(url, models) {
  const preferred = process.env.TR_OLLAMA_EMBED_MODEL || null;
  const rows = [];
  for (const m of models) {
    const name = m.name || m.model;
    if (!name) continue;
    const info = await describeModel(url, name);
    const embeds = info ? canEmbed(info) : false;
    const dims = info ? embeddingWidth(info) : null;
    const upstream = Boolean(m.remote_host || m.remote_model || info?.remote_host || info?.remote_model);
    rows.push({
      name, size: m.size ?? null, described: Boolean(info),
      embedding_capable: embeds, dims, compatible: embeds && dims === VAULT_DIMS, upstream,
    });
  }
  return { rows, selected: chooseModel(rows, preferred), preferred };
}

/** A viable pin wins; otherwise the smallest viable model, as core selects. */
export function chooseModel(rows, preferred = null) {
  const viable = rows.filter(r => r.compatible);
  const pinned = preferred && viable.find(r => r.name === preferred || r.name.split(':')[0] === preferred);
  if (pinned) return pinned.name;
  viable.sort((a, b) => (a.size ?? Number.MAX_SAFE_INTEGER) - (b.size ?? Number.MAX_SAFE_INTEGER));
  return viable[0]?.name ?? null;
}

/**
 * Which provider core would use and whether the text leaves this host.
 * Hosted fallback keys are resolved by the auth owner, so their availability
 * is reported as unknown rather than guessed from environment variable names.
 */
async function providerReport() {
  if (process.env.TR_EMBEDDINGS_DISABLED === '1') {
    return { provider: 'disabled', locality: 'disabled', endpoint: null, selected_model: null, dims: null,
      attempts: [], models: [], hosted_fallback: 'not-used', reason: 'TR_EMBEDDINGS_DISABLED=1' };
  }
  const endpoint = await resolveEndpoint();
  if (!endpoint.url) {
    return { provider: 'hosted-fallback', locality: 'unknown', endpoint: null, selected_model: null, dims: null,
      attempts: endpoint.attempts, models: [], hosted_fallback: 'unknown',
      reason: 'No Ollama endpoint answered; core would try hosted providers whose keys the auth owner resolves.' };
  }
  const inspected = await inspectModels(endpoint.url, endpoint.models);
  if (!inspected.selected) {
    return { provider: 'hosted-fallback', locality: 'unknown', endpoint: endpoint.url, selected_model: null, dims: null,
      attempts: endpoint.attempts, models: inspected.rows, hosted_fallback: 'unknown',
      reason: `No model on ${endpoint.url} declares embedding at ${VAULT_DIMS} dims; core would try hosted providers.` };
  }
  const selected = inspected.rows.find(row => row.name === inspected.selected);
  return { provider: 'ollama', locality: selected.upstream ? 'remote' : endpointLocality(endpoint.url), endpoint: endpoint.url,
    selected_model: inspected.selected, dims: VAULT_DIMS, preferred: inspected.preferred,
    attempts: endpoint.attempts, models: inspected.rows, hosted_fallback: 'not-used',
    reason: selected.upstream ? 'The Ollama service reports an upstream model.' : null };
}

// ─── Coverage: rows core can still use for this vault ────────────────────────

const YAML_TAG = /(?:^|[:,\[{-])[ \t]*!!\S/m;

/** Core frontmatter.mjs matter(), on the same SSSS parser. Throws on what core refuses. */
function parseMarkdown(raw, fm) {
  const text = fm.repairEscapedNewlines(raw.replace(/^﻿/, ''));
  const opening = /^---([^\r\n]*)\r?\n/.exec(text);
  if (!opening || opening[1].startsWith('-')) return { data: {}, content: text };
  const language = opening[1].trim().toLowerCase() || 'yaml';
  if (!['yaml', 'yml', 'json'].includes(language)) throw new Error(`Unsupported frontmatter language: ${language}`);
  const remainder = text.slice(opening[0].length);
  const closing = /^---(?:\r?\n|$)/m.exec(remainder);
  const metadata = closing ? remainder.slice(0, closing.index) : remainder;
  if (language !== 'json' && YAML_TAG.test(metadata)) throw new Error('YAML tags are not allowed in frontmatter');
  const data = (language === 'json' ? JSON.parse(metadata || '{}') : fm.parseFrontmatter(metadata.replace(/\r\n/g, '\n'), { strict: true })) || {};
  return { data, content: closing ? remainder.slice(closing.index + closing[0].length) : '' };
}

/** Core vault.mjs walkMd: dot directories and proposals/ are not vault nodes. */
function walkMd(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'proposals') out.push(...walkMd(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

/** Core vault.mjs loadNodes, returning parse failures instead of logging them. */
export async function loadVaultNodes(vaultDir) {
  const fm = await import('@gregiteen/ssss-cli/frontmatter');
  const nodes = [];
  let parseErrors = 0;
  for (const file of walkMd(vaultDir)) {
    try {
      const { data, content } = parseMarkdown(fs.readFileSync(file, 'utf8'), fm);
      if (data.type !== 'memory' && data.type !== 'plugin_record') continue;
      nodes.push({
        ...data,
        slug: data.slug || (data.plugin_id ? `plugin-${data.plugin_id}` : path.basename(file, '.md')),
        category: data.category || (data.type === 'plugin_record' ? 'plugins' : undefined),
        tags: Array.isArray(data.tags) ? data.tags : (data.use_cases || []),
        body: content.trim(),
      });
    } catch { parseErrors++; }
  }
  return { nodes, parseErrors };
}

/** Core embeddings.mjs nodeToEmbedText: the text whose hash marks a row current. */
export function nodeToEmbedText(node) {
  const parts = [`Title: ${node.title || node.slug}`];
  if (node.category) parts.push(`Category: ${node.category}`);
  if (node.tags?.length) parts.push(`Tags: ${node.tags.join(', ')}`);
  if (node.description) parts.push(`Description: ${node.description}`);
  if (node.commands?.length) parts.push(`Commands: ${node.commands.join(', ')}`);
  if (node.body) parts.push(`Body: ${node.body.slice(0, 2000)}`);
  return parts.join('\n\n');
}

function validVector(json) {
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v) || !v.every(Number.isFinite)) return { ok: false, width: null };
    return { ok: v.length === VAULT_DIMS, width: v.length };
  } catch { return { ok: false, width: null }; }
}

/**
 * Classify every index row against the active vault. Only `compatible` rows
 * are vectors core search can use for current content; the rest are named.
 */
export async function coverage(brainDir) {
  const report = {
    state: 'unknown', reason: null, vault_nodes: null, parse_errors: 0,
    rows: null, embedded: null, stale: null, mismatched: null, orphaned: null, missing: null,
    percent: null, model: null, models: [], db_bytes: null,
  };
  let nodes;
  try {
    const loaded = await loadVaultNodes(path.join(brainDir, 'memory-vault'));
    nodes = loaded.nodes;
    report.vault_nodes = nodes.length;
    report.parse_errors = loaded.parseErrors;
  } catch (err) {
    report.state = 'unreadable';
    report.reason = `vault could not be read: ${err.message}`;
    return report;
  }

  const dbPath = path.join(brainDir, 'memory-derived', 'embeddings.db');
  if (!fs.existsSync(dbPath)) {
    report.state = 'no-index';
    report.reason = 'no embeddings.db; run: total-recall compile';
    report.missing = nodes.length;
    return report;
  }
  let rows;
  try {
    report.db_bytes = fs.statSync(dbPath).size;
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      rows = db.prepare('SELECT slug, model, content_sha256, embedding_json FROM vault_embeddings').all();
    } finally { db.close(); }
  } catch (err) {
    report.state = 'unreadable';
    report.reason = `embeddings.db could not be read: ${err.message}`;
    return report;
  }

  const hashes = new Map(nodes.map(n => [n.slug, crypto.createHash('sha256').update(nodeToEmbedText(n)).digest('hex')]));
  const counts = { embedded: 0, stale: 0, mismatched: 0, orphaned: 0 };
  const models = new Map();
  const indexed = new Set();
  for (const row of rows) {
    if (!hashes.has(row.slug)) { counts.orphaned++; continue; }
    indexed.add(row.slug);
    if (!validVector(row.embedding_json).ok) { counts.mismatched++; continue; }
    if (!row.content_sha256 || row.content_sha256 !== hashes.get(row.slug)) { counts.stale++; continue; }
    counts.embedded++;
    models.set(row.model, (models.get(row.model) || 0) + 1);
  }
  Object.assign(report, counts, {
    state: 'ok',
    rows: rows.length,
    missing: nodes.length - indexed.size,
    models: [...models.entries()].sort((a, b) => b[1] - a[1]).map(([model, count]) => ({ model, count })),
  });
  report.model = report.models[0]?.model ?? null;
  report.percent = nodes.length ? Math.round((counts.embedded / nodes.length) * 100) : null;
  return report;
}

// ─── Subcommands ─────────────────────────────────────────────────────────────

function flagValue(args, name) {
  const i = args.indexOf(name);
  return i > -1 ? args[i + 1] : undefined;
}

const IMPLEMENTED = {};

IMPLEMENTED.status = async (args) => {
  const json = args.includes('--json');
  const provider = await providerReport();
  const brain = resolveVault();
  const report = {
    plugin: PLUGIN_ID,
    configured_urls: candidateUrls(),
    provider: provider.provider,
    endpoint: provider.endpoint,
    locality: provider.locality,
    // `local` is true only when the serving endpoint is on this host.
    local: provider.locality === 'local',
    selected_model: provider.selected_model,
    embedding_dims: provider.dims,
    hosted_fallback: provider.hosted_fallback,
    reason: provider.reason,
    attempts: provider.attempts,
    brain: brain ? { dir: brain, ...(await coverage(brain)) } : null,
  };
  if (json) { console.log(JSON.stringify(report, null, 1)); return; }
  const where = { local: 'yes — on this machine', remote: 'NO — the endpoint or selected model uses another machine', disabled: 'embeddings disabled', unknown: 'unknown — hosted fallback resolved by the auth owner' };
  console.log(`Embeddings v${PLUGIN_VERSION}`);
  for (const a of provider.attempts) console.log(`  endpoint:   ${a.url} ${a.reachable ? '(reachable)' : `(unreachable: ${a.reason})`}`);
  console.log(`  model:      ${provider.selected_model ? `${provider.selected_model} (${provider.dims} dims)` : `none${provider.reason ? ` — ${provider.reason}` : ''}`}`);
  console.log(`  local:      ${where[provider.locality]}`);
  if (report.brain) printCoverage(report.brain);
};

function printCoverage(b) {
  console.log(`  brain:      ${b.dir}`);
  if (b.state !== 'ok') { console.log(`  coverage:   ${b.state} — ${b.reason}`); return; }
  console.log(`  vault:      ${b.vault_nodes} nodes${b.parse_errors ? ` (${b.parse_errors} unparseable files)` : ''}`);
  console.log(`  usable:     ${b.embedded}${b.model ? ` (model: ${b.model})` : ''}${b.percent != null ? ` — ${b.percent}%` : ''}`);
  console.log(`  not usable: ${b.stale} stale, ${b.mismatched} wrong width, ${b.missing} missing, ${b.orphaned} orphaned rows`);
}

IMPLEMENTED.models = async (args) => {
  const json = args.includes('--json');
  const endpoint = await resolveEndpoint();
  if (!endpoint.url) {
    if (json) console.log(JSON.stringify({ url: null, reachable: false, attempts: endpoint.attempts, models: [] }));
    else for (const a of endpoint.attempts) console.error(`Embeddings: ${a.url} is unreachable (${a.reason}).`);
    process.exitCode = 1;
    return;
  }
  const { rows, selected } = await inspectModels(endpoint.url, endpoint.models);
  if (json) {
    const locality = rows.find(row => row.name === selected)?.upstream ? 'remote' : endpointLocality(endpoint.url);
    console.log(JSON.stringify({ url: endpoint.url, reachable: true, locality, vault_dims: VAULT_DIMS, selected, models: rows }, null, 1));
    return;
  }
  console.log(`Embeddings v${PLUGIN_VERSION} — ${endpoint.url}`);
  for (const r of rows) console.log(`  ${r.compatible ? '●' : '○'} ${r.name}${r.dims ? ` (${r.dims} dims)` : ''}${r.name === selected ? '  ← selected' : ''}`);
  if (!selected) console.log(`  no model embeds at ${VAULT_DIMS} dims — run: embeddings pull <model>`);
};

IMPLEMENTED.pull = async (args) => {
  const json = args.includes('--json');
  const model = args.find(a => !a.startsWith('-'));
  const fail = (code, body, text) => {
    if (json) console.log(JSON.stringify({ ok: false, ...body }));
    else console.error(`Embeddings: ${text}`);
    process.exitCode = code;
  };
  if (!model) return fail(2, { reason: 'model required' }, 'pull needs an explicit model: embeddings pull <model>');
  const configured = process.env.TR_OLLAMA_URL || process.env.OLLAMA_HOST || LOOPBACK_URL;
  const url = normalizeBaseUrl(configured);
  if (!url || endpointLocality(url) !== 'local') {
    return fail(2, { reason: 'pull requires a configured loopback Ollama origin' }, 'pull requires a configured loopback Ollama origin.');
  }
  const listed = await listModels(url);
  if (!listed.ok) return fail(1, { model, url, reason: listed.reason }, 'the selected Ollama endpoint is unavailable.');
  const existing = listed.models.find(entry => entry.name === model || entry.model === model || entry.name === `${model}:latest`);
  if (existing?.remote_model || existing?.remote_host || /(?:[:-])cloud$/i.test(model)) {
    return fail(2, { reason: 'pull requires a local model' }, 'pull requires a local model.');
  }
  if (!json) console.log(`Embeddings: pulling ${model} on ${url} ...`);
  try {
    const res = await fetchWithDeadline(`${url}/api/pull`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: false }),
    }, PULL_DEADLINE_MS);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error || body.status !== 'success') {
      return fail(1, { model, url, status: res.status, reason: body.error || body.status || `HTTP ${res.status}` },
        `pull failed: ${body.error || body.status || `HTTP ${res.status}`}`);
    }
  } catch (err) {
    return fail(1, { model, url, reason: err.message }, `pull failed: ${err.message}`);
  }
  if (json) { console.log(JSON.stringify({ ok: true, model, url, locality: 'local' })); return; }
  console.log(`  ✅ ${model} ready on ${url}`);
};

IMPLEMENTED.benchmark = async (args) => {
  const json = args.includes('--json');
  const requested = Number(flagValue(args, '--count') ?? 10);
  const fail = (body, text) => {
    if (json) console.log(JSON.stringify({ ok: false, ...body }));
    else console.error(`Embeddings: ${text}`);
    process.exitCode = 1;
  };
  if (!Number.isInteger(requested) || requested < 1 || requested > BENCHMARK_MAX_SAMPLES) {
    fail({ reason: `--count must be an integer from 1 to ${BENCHMARK_MAX_SAMPLES}` }, `--count must be an integer from 1 to ${BENCHMARK_MAX_SAMPLES}.`);
    process.exitCode = 2;
    return;
  }
  const provider = await providerReport();
  if (provider.provider !== 'ollama') {
    return fail({ reason: `no embedding-capable model at ${VAULT_DIMS} dims`, url: provider.endpoint, attempts: provider.attempts },
      `no model embeds at ${VAULT_DIMS} dims. ${provider.reason || ''}`.trim());
  }
  if (provider.locality !== 'local') {
    return fail({ reason: 'benchmark requires a local model on a loopback endpoint', locality: provider.locality },
      'benchmark requires a local model on a loopback endpoint.');
  }
  const started = Date.now();
  const timings = [];
  for (let i = 0; i < requested; i++) {
    const left = BENCHMARK_DEADLINE_MS - (Date.now() - started);
    if (left <= 0) return fail({ reason: 'benchmark deadline exceeded', completed: timings.length, url: provider.endpoint, model: provider.selected_model }, 'benchmark deadline exceeded.');
    const t0 = Date.now();
    try {
      const res = await fetchWithDeadline(`${provider.endpoint}/api/embed`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: provider.selected_model, input: BENCHMARK_TEXT }),
      }, Math.min(EMBED_TIMEOUT_MS, left));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const vector = (await res.json())?.embeddings?.[0];
      if (!Array.isArray(vector) || !vector.every(Number.isFinite)) throw new Error('response carried no numeric vector');
      if (vector.length !== VAULT_DIMS) throw new Error(`vector has ${vector.length} dims, vault requires ${VAULT_DIMS}`);
      timings.push(Date.now() - t0);
    } catch (err) {
      return fail({ reason: err.message, url: provider.endpoint, model: provider.selected_model, completed: timings.length }, `benchmark failed: ${err.message}`);
    }
  }
  const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
  const brain = resolveVault();
  let nodes = null;
  if (brain) { try { nodes = (await loadVaultNodes(path.join(brain, 'memory-vault'))).nodes.length; } catch { nodes = null; } }
  const report = {
    ok: true, url: provider.endpoint, locality: provider.locality, model: provider.selected_model,
    dims: VAULT_DIMS, samples: timings.length,
    ms_per_embedding: Math.round(avg),
    min_ms: Math.min(...timings), max_ms: Math.max(...timings),
    vault_nodes: nodes,
    projected_minutes: nodes ? Math.round((avg * nodes) / 60000) : null,
  };
  if (json) { console.log(JSON.stringify(report, null, 1)); return; }
  console.log(`Embeddings v${PLUGIN_VERSION} — benchmark (${report.samples} samples, ${report.model} on ${report.url})`);
  console.log(`  ${report.ms_per_embedding} ms/embedding  (min ${report.min_ms}, max ${report.max_ms}), ${VAULT_DIMS}-dim vectors verified`);
  if (nodes) console.log(`  ${nodes} vault nodes → about ${report.projected_minutes} minutes to embed fully`);
};

IMPLEMENTED.coverage = async (args) => {
  const json = args.includes('--json');
  const brain = resolveVault();
  if (!brain) {
    if (json) console.log(JSON.stringify({ ok: false, reason: 'no brain found in the current directory or home' }));
    else console.error('Embeddings: no brain found. Run from a project with .agent/skills/total-recall, or after total-recall init.');
    process.exitCode = 1;
    return;
  }
  const cov = await coverage(brain);
  const ok = cov.state === 'ok' || cov.state === 'no-index';
  const report = { ok, brain, ...cov };
  if (!ok) process.exitCode = 1;
  if (json) { console.log(JSON.stringify(report, null, 1)); return; }
  console.log(`Embeddings v${PLUGIN_VERSION} — coverage`);
  printCoverage({ dir: brain, ...cov });
  if (cov.state === 'ok' && (cov.stale || cov.missing || cov.mismatched)) console.log('  run: total-recall compile   (rebuilds the unusable vectors)');
};

export async function run(argv = []) {
  const args = Array.isArray(argv) ? argv.slice(3) : [];
  const sub = args[0] || 'status';
  const wantsHelp = args.includes('--help') || args.includes('-h');

  if (wantsHelp || sub === 'help') {
    const subs = [...new Set(['status', ...Object.keys(IMPLEMENTED)])];
    console.log(`Embeddings v${PLUGIN_VERSION}

Usage: total-recall embeddings <subcommand> [options]

Subcommands:
${subs.map((s) => `  ${s}`).join('\n')}

Options:
  --json         Machine-readable output
  --count <n>    benchmark samples, 1-${BENCHMARK_MAX_SAMPLES} (default 10)
  pull <model>   pull an explicitly named local model to the selected loopback endpoint
  --help, -h     Show this help

Environment:
  TR_OLLAMA_URL / OLLAMA_HOST   Ollama endpoint, tried before loopback
                                (http://127.0.0.1:11434). A non-loopback
                                endpoint receives vault text over the network.
  TR_OLLAMA_EMBED_MODEL         Preferred model, used when it embeds at ${VAULT_DIMS} dims
  Benchmark runs only for a local model. A loopback Ollama server may
  advertise a remote model. Core may try hosted providers if local
  selection fails. When it does, vault text leaves the machine.`);
    return;
  }

  if (IMPLEMENTED[sub]) return IMPLEMENTED[sub](args.slice(1));

  console.error(`Embeddings: "${sub}" is not implemented. Run 'total-recall embeddings --help' for available subcommands.`);
  process.exitCode = 2;
}
export default run;
