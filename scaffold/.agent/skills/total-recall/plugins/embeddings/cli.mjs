#!/usr/bin/env node
/**
 * Embeddings CLI Handler
 * Executed via: npx total-recall embeddings <subcommand>
 *
 * Owns local embedding provider discovery and index coverage for a brain:
 * which provider/model actually serves vectors, whether that model is local
 * (no text leaves the machine, no provider spend), and how much of the vault
 * is embedded. Building the index itself stays with `total-recall compile`,
 * which owns the embeddings.db lifecycle.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PLUGIN_ID = 'embeddings';
const PLUGIN_DIR = path.dirname(new URL(import.meta.url).pathname);
const PLUGIN_VERSION = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, 'plugin.json'), 'utf8')).version;
const DEFAULT_URL = 'http://127.0.0.1:11434';
const HOSTED_PROVIDERS = ['OPENROUTER_API_KEY', 'GOOGLE_API_KEY', 'OPENAI_API_KEY'];

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

function ollamaUrl() {
  const raw = process.env.TR_OLLAMA_URL || process.env.OLLAMA_HOST || DEFAULT_URL;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const u = new URL(withScheme);
    if (!u.port) u.port = '11434';
    return u.origin;
  } catch { return DEFAULT_URL; }
}

async function probe(url, timeoutMs = 4000) {
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { reachable: false, reason: `HTTP ${res.status}` };
    const data = await res.json();
    return { reachable: true, models: (data.models || []).map(m => m.name) };
  } catch (err) {
    return { reachable: false, reason: err.message };
  }
}

/** Pick the embedding-capable model with the vault's vector width, as the core does. */
async function selectModel(url, dims = 768) {
  const tags = await probe(url);
  if (!tags.reachable) return null;
  for (const name of tags.models || []) {
    try {
      const res = await fetch(`${url}/api/show`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: name }), signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const info = await res.json();
      const caps = info.capabilities || [];
      // Older servers do not report capabilities; fall back to a name hint.
      const capable = caps.includes('embedding') || /embed/i.test(name);
      if (!capable) continue;
      const width = Object.entries(info.model_info || {})
        .filter(([k]) => k.endsWith('.embedding_length')).map(([, v]) => v)[0];
      if (width && width !== dims) continue;
      return { name, width: width || null };
    } catch { /* try the next model */ }
  }
  return null;
}

/** Coverage of the vault against its embeddings index, read without loading it all. */
function coverage(brainDir) {
  const dbPath = path.join(brainDir, 'memory-derived', 'embeddings.db');
  // No vault_nodes here: counting nodes is vaultNodeCount's job, and a
  // placeholder key would clobber a real count when this object is spread.
  const result = { embedded: null, model: null, db_bytes: null, percent: null };
  if (fs.existsSync(dbPath)) result.db_bytes = fs.statSync(dbPath).size;
  if (!fs.existsSync(dbPath)) return result;
  const py = spawnSync('python3', ['-c', `
import sqlite3, json, sys
try:
    c = sqlite3.connect(${JSON.stringify(dbPath)})
    n = c.execute('select count(*) from vault_embeddings').fetchone()[0]
    models = [r[0] for r in c.execute('select model, count(*) from vault_embeddings group by model order by count(*) desc')]
    print(json.dumps({'embedded': n, 'models': models}))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`], { encoding: 'utf8', timeout: 20000 });
  try {
    const parsed = JSON.parse(py.stdout || '{}');
    result.embedded = parsed.embedded ?? null;
    result.model = parsed.models?.[0] ?? null;
  } catch { /* leave nulls */ }
  return result;
}

function vaultNodeCount(brainDir) {
  const vault = path.join(brainDir, 'memory-vault');
  let count = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) count++;
    }
  };
  try { walk(vault); } catch { return null; }
  return count;
}

const IMPLEMENTED = {};

IMPLEMENTED.status = async (args) => {
  const json = args.includes('--json');
  const url = ollamaUrl();
  const probed = await probe(url);
  const model = probed.reachable ? await selectModel(url) : null;
  const brain = resolveVault();
  const report = {
    plugin: PLUGIN_ID,
    configured_url: url,
    ollama: { reachable: probed.reachable, models: probed.models || [], reason: probed.reason || null },
    selected_model: model?.name ?? null,
    embedding_dims: model?.width ?? null,
    local: Boolean(model),
    // A hosted fallback is what the core uses when no local model answers.
    hosted_fallback_keys: HOSTED_PROVIDERS.filter(k => Boolean(process.env[k])),
    brain: brain ? {
      dir: brain,
      // Spread coverage FIRST: it returns its own vault_nodes placeholder which
      // would otherwise clobber the counted value placed after it.
      ...coverage(brain),
      vault_nodes: vaultNodeCount(brain),
    } : null,
  };
  if (report.brain && report.brain.vault_nodes && report.brain.embedded != null) {
    report.brain.percent = Math.round((report.brain.embedded / report.brain.vault_nodes) * 100);
  }
  if (json) { console.log(JSON.stringify(report, null, 1)); return; }
  console.log(`Embeddings v${PLUGIN_VERSION}`);
  console.log(`  endpoint:   ${url} ${probed.reachable ? '(reachable)' : `(unreachable: ${probed.reason})`}`);
  console.log(`  model:      ${model ? `${model.name}${model.width ? ` (${model.width} dims)` : ''}` : 'none — would fall back to a hosted provider'}`);
  console.log(`  local:      ${model ? 'yes — vectors never leave this machine' : 'NO — text would be sent to a provider'}`);
  if (!model && report.hosted_fallback_keys.length) console.log(`  fallback:   ${report.hosted_fallback_keys.join(', ')}`);
  if (report.brain) {
    const b = report.brain;
    console.log(`  brain:      ${b.dir}`);
    console.log(`  vault:      ${b.vault_nodes} nodes`);
    console.log(`  embedded:   ${b.embedded ?? 'no index'}${b.model ? ` (model: ${b.model})` : ''}${b.percent != null ? ` — ${b.percent}%` : ''}`);
  }
};

IMPLEMENTED.models = async (args) => {
  const json = args.includes('--json');
  const url = ollamaUrl();
  const probed = await probe(url);
  if (!probed.reachable) {
    if (json) console.log(JSON.stringify({ url, reachable: false, reason: probed.reason, models: [] }));
    else console.error(`Embeddings: ${url} is unreachable (${probed.reason}).`);
    process.exitCode = 1;
    return;
  }
  const rows = [];
  for (const name of probed.models || []) {
    let width = null, capable = false;
    try {
      const res = await fetch(`${url}/api/show`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: name }), signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const info = await res.json();
        capable = (info.capabilities || []).includes('embedding') || /embed/i.test(name);
        width = Object.entries(info.model_info || {}).filter(([k]) => k.endsWith('.embedding_length')).map(([, v]) => v)[0] ?? null;
      }
    } catch { /* report what is known */ }
    rows.push({ name, embedding_capable: capable, dims: width });
  }
  if (json) { console.log(JSON.stringify({ url, reachable: true, models: rows }, null, 1)); return; }
  console.log(`Embeddings v${PLUGIN_VERSION} — ${url}`);
  for (const r of rows) console.log(`  ${r.embedding_capable ? '●' : '○'} ${r.name}${r.dims ? ` (${r.dims} dims)` : ''}`);
  if (!rows.some(r => r.embedding_capable)) console.log('  no embedding-capable model — run: embeddings pull');
};

IMPLEMENTED.pull = async (args) => {
  const model = args.find(a => !a.startsWith('-')) || 'nomic-embed-text';
  const json = args.includes('--json');
  const url = ollamaUrl();
  if (!json) console.log(`Embeddings: pulling ${model} from ${url} ...`);
  const res = spawnSync('ollama', ['pull', model], {
    encoding: 'utf8', timeout: 600000,
    env: { ...process.env, OLLAMA_HOST: url.replace(/^https?:\/\//, '') },
  });
  const ok = res.status === 0;
  if (json) { console.log(JSON.stringify({ model, ok, status: res.status, stderr: ok ? null : (res.stderr || '').slice(-400) })); if (!ok) process.exitCode = 1; return; }
  if (!ok) { console.error(`  failed: ${(res.stderr || res.stdout || '').trim().slice(-300)}`); process.exitCode = 1; return; }
  console.log(`  ✅ ${model} ready`);
};

IMPLEMENTED.benchmark = async (args) => {
  const json = args.includes('--json');
  const countIdx = args.indexOf('--count');
  const samples = Number(countIdx > -1 ? args[countIdx + 1] : 0) || 10;
  const url = ollamaUrl();
  const model = await selectModel(url);
  if (!model) {
    if (json) console.log(JSON.stringify({ ok: false, reason: 'no embedding-capable model available', url }));
    else console.error(`Embeddings: no embedding-capable model at ${url}. Run: embeddings pull`);
    process.exitCode = 1;
    return;
  }
  const text = 'Contact High Life Smoke Shop, 2485 Corporate Pkwy Burlington NC 27215, phone 336-828-7106, status active.';
  const timings = [];
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${url}/api/embeddings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model.name, prompt: text }), signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.json();
      timings.push(Date.now() - t0);
    } catch (err) {
      if (json) console.log(JSON.stringify({ ok: false, reason: err.message, url, model: model.name }));
      else console.error(`Embeddings: benchmark failed: ${err.message}`);
      process.exitCode = 1;
      return;
    }
  }
  const total = timings.reduce((a, b) => a + b, 0);
  const avg = total / timings.length;
  const brain = resolveVault();
  const nodes = brain ? vaultNodeCount(brain) : null;
  const report = {
    ok: true, url, model: model.name, samples,
    ms_per_embedding: Math.round(avg),
    min_ms: Math.min(...timings), max_ms: Math.max(...timings),
    vault_nodes: nodes,
    projected_minutes: nodes ? Math.round((avg * nodes) / 60000) : null,
  };
  if (json) { console.log(JSON.stringify(report, null, 1)); return; }
  console.log(`Embeddings v${PLUGIN_VERSION} — benchmark (${samples} samples, ${model.name})`);
  console.log(`  ${Math.round(avg)} ms/embedding  (min ${Math.min(...timings)}, max ${Math.max(...timings)})`);
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
  const nodes = vaultNodeCount(brain);
  const cov = coverage(brain);
  const report = { ok: true, brain, vault_nodes: nodes, embedded: cov.embedded, model: cov.model, db_bytes: cov.db_bytes,
    percent: (nodes && cov.embedded != null) ? Math.round((cov.embedded / nodes) * 100) : null };
  if (json) { console.log(JSON.stringify(report, null, 1)); return; }
  console.log(`Embeddings v${PLUGIN_VERSION} — coverage`);
  console.log(`  brain:    ${brain}`);
  console.log(`  vault:    ${nodes} nodes`);
  console.log(`  embedded: ${cov.embedded ?? 'no index'}${cov.model ? ` (model: ${cov.model})` : ''}${report.percent != null ? ` — ${report.percent}%` : ''}`);
  if (report.percent != null && report.percent < 100) console.log('  run: total-recall compile   (builds the missing vectors)');
};

export async function run(argv = []) {
  const args = Array.isArray(argv) ? argv.slice(3) : [];
  const sub = args[0] || 'status';
  const json = args.includes('--json');
  const wantsHelp = args.includes('--help') || args.includes('-h');

  if (wantsHelp || sub === 'help') {
    const subs = [...new Set(['status', ...Object.keys(IMPLEMENTED)])];
    console.log(`Embeddings v${PLUGIN_VERSION}

Usage: total-recall embeddings <subcommand> [options]

Subcommands:
${subs.map((s) => `  ${s}`).join('\n')}

Options:
  --json      Machine-readable output
  --help, -h  Show this help

Environment:
  TR_OLLAMA_URL / OLLAMA_HOST   Ollama endpoint (default http://127.0.0.1:11434)
                                When unset, the core falls back to a hosted
                                provider and vault text leaves the machine.`);
    return;
  }

  if (IMPLEMENTED[sub]) return IMPLEMENTED[sub](args.slice(1));

  console.error(`Embeddings: "${sub}" is not implemented. Run 'total-recall embeddings --help' for available subcommands.`);
  process.exitCode = 2;
}
export default run;
