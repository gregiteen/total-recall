/** Measures existing routers. This module never dispatches an agent or executes a plugin operation. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { ROUTER_CORPUS } from './router-benchmark-corpus.mjs';
import { configDir } from './paths.mjs';

const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : null;
const timings = rows => ({ samples: rows.length, p50Ms: percentile(rows.map(r => r.durationMs), .5), p95Ms: percentile(rows.map(r => r.durationMs), .95) });

export function validateCorpus(corpus) {
  if (corpus?.schemaVersion !== 1 || !corpus.id || !corpus.version || !Array.isArray(corpus.cases) || !corpus.cases.length) throw new Error('Invalid corpus schema/version/cases');
  const ids = new Set();
  for (const c of corpus.cases) {
    if (!c.id || ids.has(c.id) || typeof c.intent !== 'string' || !c.intent.trim() || !c.provenance || !['capability', 'harness'].includes(c.layer) || !['cli', 'api', 'mcp', 'router'].includes(c.surface)) throw new Error(`Invalid corpus case ${c.id}`);
    ids.add(c.id);
    if (c.layer === 'capability' && (!Array.isArray(c.groups) || c.groups.some(g => !Array.isArray(g) || !g.length || g.some(id => typeof id !== 'string' || !id)))) throw new Error(`Invalid expected groups ${c.id}`);
    if (c.layer === 'harness' && (!['ready', 'inactive', 'quota'].includes(c.scenario) || !Array.isArray(c.expected) || c.expected.some(id => !['codex', 'claude'].includes(id)))) throw new Error(`Invalid harness scenario ${c.id}`);
  }
  return corpus;
}

/** Bind only to a verified host's real retrieval implementation, never a benchmark replacement. */
export async function loadCapabilityRouter({ coreRoot } = {}) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const roots = coreRoot ? [coreRoot] : [process.env.TR_PACKAGE_ROOT, path.resolve(here, '../node_modules/total-recall-brain')].filter(Boolean);
  for (const candidate of roots) {
    let root, pkg;
    try { root = fs.realpathSync(candidate); pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch { continue; }
    if (pkg.name !== 'total-recall-brain') continue;
    const predictor = path.join(root, 'src/core/action-predictor.mjs');
    const index = path.join(root, 'src/core/cli-semantic-index.mjs');
    if (!fs.existsSync(predictor) || !fs.existsSync(index) || !fs.existsSync(path.join(root, 'bin/total-recall.mjs'))) continue;
    const [actions, retrieval] = await Promise.all([import(pathToFileURL(predictor).href), import(pathToFileURL(index).href)]);
    const catalogModule = path.join(root, 'src/core/plugin-catalog.mjs');
    return { shortlist: actions.shortlistActions, query: (intent, options) => retrieval.queryCliSemanticIndex(intent, { ...options, minScore: 0, actionableOnly: false }),
      questions: actions.buildActionQuestions, harvest: retrieval.harvestAllCliVerbs,
      source: { implementation: 'shortlistActions/queryCliSemanticIndex', hostVersion: pkg.version, root,
        predictorHash: hash(fs.readFileSync(predictor)), retrievalHash: hash(fs.readFileSync(index)),
        catalogHash: fs.existsSync(catalogModule) ? hash(fs.readFileSync(catalogModule)) : null } };
  }
  throw new Error('Real capability router unavailable: invalid selected core root');
}

export function readInstalledCatalog({ coreRoot, projectRoot = process.cwd() } = {}) {
  if (!coreRoot) throw new Error('Installed catalog unavailable: verified coreRoot required');
  let catalog;
  try { catalog = JSON.parse(execFileSync(process.execPath, [path.join(coreRoot, 'bin/total-recall.mjs'), 'composable-cli', 'library', '--json'], {
    cwd: projectRoot, env: { ...process.env, TR_PACKAGE_ROOT: coreRoot }, encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024 })); }
  catch (error) { throw new Error(`Installed catalog unavailable: ${error.message}`); }
  if (!Array.isArray(catalog?.plugins) || !catalog.plugins.length || !Array.isArray(catalog.commands) || !catalog.fingerprint) throw new Error('Installed catalog missing plugins, commands or fingerprint');
  return catalog;
}

export const capabilitySurface = c => ({ api: 'api', 'mcp-tool': 'mcp', 'mcp-server': 'mcp', 'api-router': 'router', cli: 'cli', core: 'cli', composed: 'cli' }[c.kind] || (c.id?.split(':').length === 3 ? 'cli' : null));
export function catalogCases(catalog, count) {
  const records = catalog.capabilities || catalog.commands.map(c => ({ ...c, id: `plugin:${c.plugin}:${c.name}`, kind: 'cli' }));
  const operations = records.filter(c => capabilitySurface(c) && c.id && c.description && !['on', 'off', 'root'].includes(c.name));
  const owners = new Set();
  const surfaces = new Set();
  const ordered = [...operations.filter(c => { const surface = capabilitySurface(c); if (surfaces.has(surface)) return false; surfaces.add(surface); return true; }), ...operations.filter(c => { const key = `${c.plugin}:${capabilitySurface(c)}`; if (owners.has(key)) return false; owners.add(key); return true; }), ...operations];
  const seen = new Set();
  return ordered.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; }).slice(0, count).map(c => ({
    id: `catalog:${c.id}`, layer: 'capability', surface: capabilitySurface(c), kind: 'description-probe', provenance: `catalog:${catalog.fingerprint}:${c.id}`,
    intent: c.description, groups: [[c.id]],
  }));
}

/** Only a declared CLI identity can supply a legacy alias. No router response is used. */
export function resolveLabels(c, records) {
  const aliases = new Map();
  for (const r of records) {
    aliases.set(r.id, r.id);
    if (r.kind === 'cli' && r.plugin && r.name) aliases.set(`plugin:${r.plugin}:${r.name}`, r.id);
    else if (r.id?.startsWith('plugin:') && r.id.split(':').length === 3) {
      const [, owner, name] = r.id.split(':'); aliases.set(`plugin:${owner}:cli:${encodeURIComponent(name)}`, r.id);
    }
  }
  return { ...c, groups: c.groups.map(g => [...new Set(g.map(id => aliases.get(id) || id))]) };
}

export function scoreRetrieval(c, hits, universe) {
  const ids = [...new Set(hits.map(h => h.id))];
  const groups = c.groups;
  const ranks = groups.map(g => ids.findIndex(id => universe.has(id) && g.includes(id)) + 1);
  return { ids, labelCoverage: groups.length ? groups.filter(g => g.some(id => universe.has(id))).length / groups.length : null,
    recallAtK: groups.length ? ranks.filter(Boolean).length / groups.length : null,
    reciprocalRank: groups.length ? mean(ranks.map(r => r ? 1 / r : 0)) : null,
    topOneCorrect: groups.length === 1 ? Number(universe.has(ids[0]) && groups[0].includes(ids[0])) : null,
    allStepsCovered: groups.length > 1 ? ranks.every(Boolean) : null,
    refusalCorrect: null, refusalReason: groups.length ? null : 'Retrieval ranks candidates; no abstention contract. Decision stage not evaluated.' };
}

async function harnessScenario(c) {
  const { routeTask } = await import('./router.mjs');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-benchmark-'));
  const previous = process.env.TR_SECRETS_BRAIN;
  process.env.TR_SECRETS_BRAIN = scratch;
  try {
    const agents = ['codex', 'claude'].map(id => ({ id, installed: true, versionVerified: true, version: 'scenario', authenticated: c.scenario !== 'inactive' }));
    const receipts = c.scenario === 'quota' ? agents.map(a => ({ harness: a.id, success: false, failureKind: 'quota', timestamp: new Date().toISOString(), resetsAt: new Date(Date.now() + 3600000).toISOString() })) : [];
    const result = await routeTask(c.intent, { inspect: async () => ({ agents }), receipts: async () => receipts,
      fleet: () => ({ ok: true, nodes: [] }), openRouterKey: '', openRouterManagementKey: '', codexAllowance: async () => { throw new Error('Unexpected provider probe'); }, recordReceipt: async () => { throw new Error('Unexpected receipt mutation'); } });
    const correct = c.expected.length ? c.expected.includes(result.selected) : !result.selected;
    return { selected: result.selected, tier: result.tier, excluded: result.excluded, correct, refusalCorrect: c.expected.length ? null : correct,
      candidates: result.candidates, evidence: 'Real routeTask with declared readiness/receipt scenario; not live provider readiness' };
  } finally {
    if (previous === undefined) delete process.env.TR_SECRETS_BRAIN; else process.env.TR_SECRETS_BRAIN = previous;
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export function checkThresholds(report, { minRecall, minMrr, maxP95Ms, baseline, maxRecallDrop = 0, allowCatalogChange = false } = {}) {
  const failures = [];
  for (const [name, value, min, max] of [['minRecall', minRecall, 0, 1], ['minMrr', minMrr, 0, 1], ['maxP95Ms', maxP95Ms, 0, Infinity], ['maxRecallDrop', maxRecallDrop, 0, 1]]) {
    if (value !== undefined && (!Number.isFinite(value) || value < min || value > max)) throw new Error(`Invalid ${name}`);
  }
  const measured = report.capability;
  for (const [name, value, limit, lower] of [['recallAtK', measured.recallAtK, minRecall, true], ['mrr', measured.mrr, minMrr, true], ['p95Ms', measured.latency.p95Ms, maxP95Ms, false]]) {
    if (limit !== undefined && (!Number.isFinite(value) || (lower ? value < limit : value > limit))) failures.push({ metric: name, actual: value, threshold: limit });
  }
  if (baseline) {
    if (baseline.schemaVersion !== 1 || baseline.corpus?.hash !== report.corpus.hash || (!allowCatalogChange && baseline.catalog?.hash !== report.catalog.hash) || baseline.configuration?.k !== report.configuration.k || baseline.configuration?.repeats !== report.configuration.repeats || baseline.configuration?.retrieval !== report.configuration.retrieval) throw new Error('Incompatible baseline corpus/catalog/configuration');
    if (allowCatalogChange && (baseline.corpus?.labelMapping !== report.corpus.labelMapping || baseline.corpus?.resolvedLabelsHash !== report.corpus.resolvedLabelsHash)) throw new Error('Incompatible baseline label mappings');
    if (!Number.isFinite(baseline.capability.recallAtK) || measured.recallAtK === null) throw new Error('Baseline has no comparable recall');
    if (baseline.capability.recallAtK - measured.recallAtK > maxRecallDrop) failures.push({ metric: 'recallDrop', actual: baseline.capability.recallAtK - measured.recallAtK, threshold: maxRecallDrop });
  }
  return failures;
}

export async function runRouterBenchmark(options = {}) {
  const { k = 20, repeats = 3, catalogSamples = 24, projectRoot = process.cwd() } = options;
  for (const [name, value, max] of [['k', k, 1000], ['repeats', repeats, 100], ['catalogSamples', catalogSamples, 10000]]) if (!Number.isInteger(value) || value < (name === 'catalogSamples' ? 0 : 1) || value > max) throw new Error(`Invalid ${name}`);
  const startedAt = new Date().toISOString();
  const adapter = options.adapter || await loadCapabilityRouter({ coreRoot: options.coreRoot });
  if (options.coreRoot && adapter.source?.root !== fs.realpathSync(options.coreRoot)) throw new Error('Host-source identity mismatch');
  const catalog = options.catalog || readInstalledCatalog({ coreRoot: adapter.source.root, projectRoot });
  if (!Array.isArray(catalog.plugins) || !catalog.plugins.length || !Array.isArray(catalog.commands) || (!catalog.commands.length && !catalog.capabilities?.length) || !catalog.fingerprint) throw new Error('Installed catalog missing plugins, commands or fingerprint');
  const base = validateCorpus(options.corpus || ROUTER_CORPUS);
  const corpus = validateCorpus({ ...base, cases: [...base.cases, ...catalogCases(catalog, catalogSamples)] });
    const harvested = adapter.harvest({ projectRoot });
  if (!harvested.length) throw new Error('Router harvested no capabilities');
  const universe = new Set(harvested.map(h => h.id));
  if (catalog.capabilities?.some(c => !universe.has(c.id))) throw new Error('Host-source identity mismatch: catalog capability missing from harvest');
  const resolved = corpus.cases.filter(c => c.layer === 'capability').map(c => resolveLabels(c, harvested));
  const byCase = new Map(resolved.map(c => [c.id, c]));
  const actionableUniverse = new Set(harvested.filter(c => c.callable !== false).map(c => c.id));
  const samples = [], unsupported = [];
  const prior = process.env.TR_EMBEDDINGS_DISABLED;
  process.env.TR_EMBEDDINGS_DISABLED = '1';
  try {
    for (let pass = 0; pass < repeats; pass++) for (const c of corpus.cases) {

      const start = performance.now();
      if (c.layer === 'harness') {
        const routed = await harnessScenario(c);
        samples.push({ caseId: c.id, layer: c.layer, kind: c.kind, pass, ...routed, durationMs: performance.now() - start });
      } else {
        const hits = await (adapter.query || adapter.shortlist)(c.intent, { limit: k, projectRoot });
        const durationMs = performance.now() - start;
        samples.push({ caseId: c.id, layer: c.layer, kind: c.kind, pass, ...scoreRetrieval(byCase.get(c.id), hits, universe), durationMs,
          candidates: hits.length, candidateReduction: 1 - hits.length / universe.size,
          questionBytes: bytes(adapter.questions(hits, { intent: c.intent })), intentBytes: Buffer.byteLength(c.intent, 'utf8') });
        const actionStart = performance.now();
        const actions = await adapter.shortlist(c.intent, { limit: k, projectRoot });
        samples.push({ caseId: c.id, layer: 'actionable', kind: c.kind, pass, ...scoreRetrieval(byCase.get(c.id), actions, actionableUniverse), durationMs: performance.now() - actionStart });
      }
    }
  } finally { if (prior === undefined) delete process.env.TR_EMBEDDINGS_DISABLED; else process.env.TR_EMBEDDINGS_DISABLED = prior; }
  for (const surface of ['api', 'mcp', 'router']) if (!harvested.some(c => capabilitySurface(c) === surface)) unsupported.push({ surface, reason: 'No installed declarations for this surface; live coverage missing' });
  const capability = samples.filter(s => s.layer === 'capability'), harness = samples.filter(s => s.layer === 'harness');
  const average = (rows, field) => mean(rows.map(s => s[field]).filter(Number.isFinite));
  const summary = rows => ({ recallAtK: average(rows, 'recallAtK'), mrr: average(rows, 'reciprocalRank'), topOneAccuracy: average(rows, 'topOneCorrect'), labelCoverage: average(rows, 'labelCoverage'), samples: rows.length });
  const sourceFiles = ['router-benchmark.mjs', 'router-benchmark-corpus.mjs', 'router.mjs', 'pool.mjs', '../capability/index.mjs'];
  const report = { schemaVersion: 1, id: randomUUID(), owner: 'meta-harness', benchmark: 'router-efficiency', startedAt, finishedAt: new Date().toISOString(),
    source: { capability: adapter.source, ownerVersion: JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).version,
      hashes: Object.fromEntries(sourceFiles.map(f => [f, hash(fs.readFileSync(new URL(f, import.meta.url), 'utf8'))])) },
    configuration: { k, repeats, catalogSamples, projectRoot, retrieval: 'lexical:TR_EMBEDDINGS_DISABLED=1', providerMode: 'none', execution: false },
    corpus: { id: corpus.id, version: corpus.version, hash: hash(corpus), labelMapping: 'declared-cli-identity-v1', resolvedLabelsHash: hash(resolved.map(c => ({ id: c.id, groups: c.groups.map(g => g.map(id => id.replace(/^(plugin:[^:]+):cli:([^:]+)$/, '$1:$2'))) }))), cases: corpus.cases.length, data: corpus },
    catalog: { sourceRoot: adapter.source.root || null, changedFromBaseline: options.baseline ? options.baseline.catalog.hash !== hash(catalog) : null, schemaVersion: catalog.schemaVersion, fingerprint: catalog.fingerprint, hash: hash(catalog), plugins: catalog.plugins.length, commands: catalog.commands.length,
      harvested: universe.size, harvestedHash: hash(harvested), declaredActivation: catalog.plugins.map(p => ({ id: p.id, activation: p.activation })) },
    actionable: { ...summary(samples.filter(s => s.layer === 'actionable')), latency: timings(samples.filter(s => s.layer === 'actionable')), mode: 'actual-shortlist:callable-only', decisionCorrectness: null },
    capability: { mode: 'actual-catalog-query:all-declarations', ...summary(capability), independent: summary(capability.filter(s => s.kind !== 'description-probe')), descriptionProbes: summary(capability.filter(s => s.kind === 'description-probe')),
      surfaces: Object.fromEntries(['cli', 'api', 'mcp', 'router'].map(surface => [surface, { declarations: harvested.filter(c => capabilitySurface(c) === surface).length, ...summary(capability.filter(s => corpus.cases.find(c => c.id === s.caseId)?.surface === surface)) }])),
      latency: timings(capability), firstCall: timings(capability.slice(0, 1)), warm: timings(capability.filter(s => s.pass > 0)),
      meanCandidateReduction: average(capability, 'candidateReduction'), meanQuestionBytes: average(capability, 'questionBytes'), meanIntentBytes: average(capability, 'intentBytes'),
      fullCatalogQuestionBytes: bytes(adapter.questions(harvested)), refusalCorrectness: null },
    harness: { samples: harness.length, correctness: harness.length ? mean(harness.map(s => Number(s.correct))) : null,
      refusalCorrectness: mean(harness.filter(s => s.refusalCorrect !== null).map(s => Number(s.refusalCorrect))), latency: timings(harness), mode: 'readiness-scenarios' },
    calls: { actionableRouter: samples.filter(s => s.layer === 'actionable').length, capabilityRouter: capability.length, harnessRouter: harness.length, provider: 0, dispatch: 0 },
    dispatchAvoidance: { avoidedByBenchmark: samples.length, routerDecisionAvoidance: null, note: 'Read-only evaluator dispatches nothing; this is not measured router decision savings' },
    missingMetrics: { tokens: null, costUSD: null, actualProviderPromptBytes: null, decisionCorrectness: null, liveHarnessReadiness: null, capabilityRefusalCorrectness: null, inactiveCapabilityFiltering: null,
      reason: 'No provider/Decision/dispatch execution; retrieval has no refusal or activation enforcement contract. Harness scenarios are controlled inputs.' },
    latencyNotes: 'First measured retrieval call, not fresh OS/module caches. Warm means repeated corpus passes. Harness includes disposable scenario setup. No embedding network calls.',
    unsupported, samples };
  report.thresholdFailures = checkThresholds(report, options);
  report.ok = report.thresholdFailures.length === 0;
  if (options.save) {
    const { PluginStateStore } = await import('./ssss-store.mjs');
    const store = new PluginStateStore(path.join(configDir(), 'router-benchmarks.jsonl'), 'meta-harness');
    store.append(report);
    report.persistence = { document: store.documentPath, owner: 'meta-harness', format: 'plugin-store:ledger' };
  }
  return report;
}
