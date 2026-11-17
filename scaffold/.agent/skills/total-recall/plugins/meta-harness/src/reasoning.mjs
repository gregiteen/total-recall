/** Headless reasoning belongs to Metaharness, including config, readiness and receipts. */
import fs from 'node:fs';
import path from 'node:path';
import { brainDir } from './paths.mjs';
import { getActiveAdapters, inspectAgents } from './worker.mjs';
import { dispatchTask } from './compat-harness.mjs';
import { INTERNAL_JOB_MARKER } from './session/run.mjs';
import { readCodexRateLimits } from './telemetry.mjs';
import { readIncludedPolicy } from './included-usage.mjs';

// One reasoning generation is bounded; the reasoning config may lower or raise it.
const DEFAULT_REASONING_MAX_TOKENS = 64000;
// How long a held reasoning caller waits before asking again.
export const REASONING_HOLD_MS = 30 * 60_000;
export const REASONING_CONFIG_HINT = 'Set one with: total-recall meta-harness reasoning-config --agent <harness> [--model <model>] [--max-usage-percent <1-100>]';

export function reasoningConfigPath(options = {}) {
  return path.join(options.brainDir || brainDir(options.env || process.env), 'config', 'meta-harness', 'reasoning.json');
}

function readConfig(file) {
  if (!fs.existsSync(file)) return {};
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`Invalid reasoning configuration: ${error.message}`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Reasoning configuration must be an object');
  return value;
}

export function loadRuntimeConfig(_legacyPath, options = {}) {
  const env = options.env || process.env, argv = options.argv || process.argv;
  const root = options.brainDir || brainDir(env);
  const config = readConfig(options.reasoningFile || path.join(root, 'config', 'meta-harness', 'reasoning.json'));
  const brain = readConfig(path.join(root, 'config', 'brain.json'));
  const adapters = getActiveAdapters();
  // Background reasoning runs only where the operator chose. Adapter order is never a default:
  // it once sent every background review to the first adapter's most expensive model.
  let agents = [];
  if (config.agents !== undefined) {
    if (!Array.isArray(config.agents)) throw new Error('Reasoning agents must be an array');
    agents = config.agents.filter(agent => agent.enabled !== false).map((agent, index) => {
      const adapter = adapters.find(item => item.id === agent.name || item.id === agent.id);
      if (!adapter) throw new Error(`Unknown reasoning harness ${agent.name || agent.id}`);
      if (agent.flags !== undefined || (agent.binary && agent.binary !== adapter.binary)) throw new Error('Native flags belong to the adapter registry');
      return { name: adapter.id, binary: adapter.binary, enabled: true, priority: agent.priority ?? index + 1, model: agent.model || null };
    }).sort((a, b) => a.priority - b.priority);
  }
  let preferred = argv.find(value => value.startsWith('--agent='))?.slice(8) || env.TR_CLI_AGENT || config.preferredAgent || brain.preferred_agent;
  if (!preferred) {
    for (const file of [options.instructionsFile, options.surfaceDir && path.join(options.surfaceDir, 'AGENTS.md')].filter(Boolean)) {
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      preferred = (text.match(/preferred\s+CLI\s+agent\s+is\s+([a-zA-Z0-9_-]+)/i) || text.match(/preferred_cli_agent:\s*([a-zA-Z0-9_-]+)/i))?.[1]?.toLowerCase();
      if (preferred) break;
    }
  }
  if (preferred) {
    let selected = agents.find(agent => agent.name === preferred);
    if (!selected && config.agents !== undefined) throw new Error(`Preferred reasoning harness ${preferred} is not configured`);
    if (!selected) {
      // An explicit preference with no reasoning file is still an operator choice.
      const adapter = adapters.find(item => item.id === preferred);
      if (!adapter) throw new Error(`Unknown reasoning harness ${preferred}`);
      selected = { name: adapter.id, binary: adapter.binary, enabled: true, priority: 0, model: null };
      agents.push(selected);
    }
    selected.priority = 0;
    agents.sort((a, b) => a.priority - b.priority);
  }
  if (env.TR_CLI_MODEL && agents.length) agents[0].model = env.TR_CLI_MODEL;
  const maxTokens = config.maxTokens ?? DEFAULT_REASONING_MAX_TOKENS;
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1) throw new Error('Reasoning maxTokens must be a positive integer');
  const maxUsagePercent = config.maxUsagePercent ?? null;
  if (maxUsagePercent !== null && (typeof maxUsagePercent !== 'number' || !(maxUsagePercent > 0 && maxUsagePercent <= 100))) {
    throw new Error('Reasoning maxUsagePercent must be a number above 0 and at most 100');
  }
  const timeout = Number(env.TR_CLI_TIMEOUT || config.timeout || 300);
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('Reasoning timeout must be positive');
  return { agents, timeout, maxTokens, maxUsagePercent, maxRetries: config.maxRetries ?? 0, embedding: config.embedding || options.embedding,
    allowUnknownAuth: config.allowUnknownAuth === true, preferredAgent: preferred || null };
}

/**
 * Show or change which harness and model run background reasoning (lesson reviews and other
 * internal jobs). `agent` becomes the primary and is enabled; `enable`/`disable` keep an option
 * listed without running it. Models are checked with the model owner before they are saved.
 */
export async function reasoningConfig({ agent, model, maxUsagePercent, enable, disable } = {}, options = {}) {
  const env = options.env || process.env;
  const file = reasoningConfigPath(options);
  const raw = readConfig(file);
  const changing = [agent, model, maxUsagePercent, enable, disable].some(value => value !== undefined);
  if (changing) {
    if (env.TR_META_HARNESS_RUN) throw new Error('Only the operator may change the background reasoning configuration.');
    const adapters = getActiveAdapters();
    const known = id => {
      if (!adapters.some(item => item.id === id)) throw new Error(`Unknown reasoning harness ${id}`);
      return id;
    };
    const agents = Array.isArray(raw.agents) ? raw.agents.map(item => ({ ...item })) : [];
    const entry = id => agents.find(item => (item.name || item.id) === id) || (agents.push({ name: id }), agents.at(-1));
    if (agent !== undefined) {
      const primary = entry(known(agent));
      primary.enabled = true;
      agents.splice(agents.indexOf(primary), 1);
      agents.unshift(primary);
    }
    for (const id of [enable].filter(Boolean)) entry(known(id)).enabled = true;
    for (const id of [disable].filter(Boolean)) entry(known(id)).enabled = false;
    if (model !== undefined) {
      const target = agent !== undefined ? agents[0] : agents.find(item => item.enabled !== false);
      if (!target) throw new Error('Choose a harness with --agent before setting a model');
      const check = (options.validateModel || (await import('./model-selection.mjs')).createModelValidator())(target.name, model);
      if (!check.ok) throw new Error(check.reason || `${target.name} cannot run ${model}`);
      target.model = model;
    }
    agents.forEach((item, index) => { item.priority = index + 1; });
    const next = { ...raw, agents };
    if (maxUsagePercent !== undefined) next.maxUsagePercent = Number(maxUsagePercent);
    // Validate the whole file before it replaces the old one.
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(next, null, 2) + '\n');
    try {
      loadRuntimeConfig(undefined, { ...options, brainDir: path.dirname(path.dirname(path.dirname(file))), reasoningFile: temp, argv: [] });
      fs.renameSync(temp, file);
    } catch (error) { fs.rmSync(temp, { force: true }); throw error; }
  }
  const saved = readConfig(file);
  const effective = loadRuntimeConfig(undefined, { ...options, argv: [] });
  return { ok: true, path: file, configured: effective.agents.length > 0, config: saved,
    order: effective.agents.map(item => ({ harness: item.name, model: item.model || null })),
    maxUsagePercent: effective.maxUsagePercent, holdMinutes: REASONING_HOLD_MS / 60_000,
    ...(effective.agents.length ? {} : { note: `Background reasoning is refused until a harness is configured. ${REASONING_CONFIG_HINT}` }) };
}

export async function checkRuntimeHealth(config, { inspect = inspectAgents } = {}) {
  const desired = (config?.agents || loadRuntimeConfig().agents).filter(agent => agent.enabled !== false);
  const report = await inspect({ ids: desired.map(agent => agent.name) });
  const available = desired.flatMap(agent => {
    const observed = report.agents.find(item => item.id === agent.name);
    return observed?.installed && observed.authenticated === true && observed.versionVerified && !observed.blockedBy
      ? [{ name: agent.name, binary: agent.binary, priority: agent.priority }] : [];
  });
  return { status: available.length ? 'healthy' : 'degraded', available, primary: available[0]?.name || null,
    ...(available.length ? {} : { reason: 'No configured harness has verified login and runtime readiness' }) };
}

export async function callLocalRuntime(prompt, system, config, dependencies = {}) {
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('A nonempty reasoning task is required');
  config ||= loadRuntimeConfig();
  const text = `${INTERNAL_JOB_MARKER}\n${system ? `${system}\n\n---\n\n${prompt}` : prompt}`;
  const agents = (config.agents || []).filter(agent => agent.enabled !== false).sort((a, b) => a.priority - b.priority);
  if (!agents.length) throw new Error(`No background reasoning harness is configured. ${REASONING_CONFIG_HINT}`);
  const { resolvePool } = await import('./pool.mjs');
  const pool = await (dependencies.resolvePool || resolvePool)({ allowUnknownAuth: config.allowUnknownAuth === true });
  // An operator OpenRouter binding admits a metered harness explicitly; dispatch bills it through that binding.
  const policy = await (dependencies.readPolicy || readIncludedPolicy)();
  const bound = id => Object.hasOwn(policy?.openRouter ?? {}, id);
  const candidates = agents.filter(agent => pool.ready.some(ready => ready.id === agent.name) || bound(agent.name));
  if (!candidates.length) throw new Error(`No configured CLI agent is ready: ${(pool.excluded || []).map(item => `${item.harness}: ${item.reason}`).join('; ') || 'no verified runtime'}`);
  const failures = [], held = [];
  for (const agent of candidates) {
    if (agent.name === 'codex' && config.maxUsagePercent) {
      const limits = (dependencies.readCodexRateLimits || readCodexRateLimits)();
      const windows = [limits?.primary, limits?.secondary].filter(Boolean);
      // No live reading means no measured usage; the Codex wall still stops a run at 100%.
      const used = windows.length ? Math.max(...windows.map(window => window.used_percent)) : null;
      if (used !== null && used >= config.maxUsagePercent) {
        held.push(`codex usage is ${used}%, at or above the ${config.maxUsagePercent}% background reasoning threshold`);
        continue;
      }
    }
    const result = await (dependencies.dispatch || dispatchTask)(agent.name, text, {
      cwd: config.cwd || process.cwd(), node: config.node || 'local', timeoutMs: (config.timeout || 300) * 1000,
      model: agent.model || undefined, write: false, role: 'Reasoning', allowUnknownAuth: config.allowUnknownAuth === true,
      internalReasoning: true, maxTurns: 1, maxTokens: config.maxTokens ?? DEFAULT_REASONING_MAX_TOKENS,
    });
    if (result.ok === true || result.success === true) return result.response || '';
    if (result.queued || result.queueError || result.failureKind === 'billing-policy') {
      const error = new Error(result.queued ? `Included usage exhausted. Queued as ${result.queueId}.` : result.queueError || result.error);
      error.queueId = result.queueId;
      throw error;
    }
    failures.push(`${agent.name}: ${result.error || 'dispatch failed'}`);
  }
  if (held.length && !failures.length) {
    // Nothing ran. Callers treat this as "try later", not as a failed task.
    throw Object.assign(new Error(`Background reasoning held: ${held.join('; ')}`), { code: 'REASONING_DEFERRED', retryAfterMs: REASONING_HOLD_MS });
  }
  throw new Error(`All CLI agents failed (${[...held, ...failures].join('; ')})`);
}

export async function callLocalRuntimeRaw(messages, config, _tools, dependencies) {
  if (!Array.isArray(messages)) throw new Error('Reasoning messages must be an array');
  const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n');
  const user = messages.filter(message => message.role !== 'system').map(message => message.content).join('\n');
  return { role: 'assistant', content: await callLocalRuntime(user, system, config, dependencies) };
}
