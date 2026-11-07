/** Headless reasoning belongs to Meta Harness, including config, readiness and receipts. */
import fs from 'node:fs';
import path from 'node:path';
import { brainDir } from './paths.mjs';
import { getActiveAdapters, inspectAgents } from './worker.mjs';
import { dispatchTask } from './compat-harness.mjs';

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
  const config = readConfig(path.join(root, 'config', 'meta-harness', 'reasoning.json'));
  const brain = readConfig(path.join(root, 'config', 'brain.json'));
  const adapters = getActiveAdapters();
  let agents = adapters.map((adapter, index) => ({ name: adapter.id, binary: adapter.binary, enabled: true, priority: index + 1 }));
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
    const selected = agents.find(agent => agent.name === preferred);
    if (!selected) throw new Error(`Preferred reasoning harness ${preferred} is not configured`);
    selected.priority = 0;
    agents.sort((a, b) => a.priority - b.priority);
  }
  if (env.TR_CLI_MODEL && agents.length) agents[0].model = env.TR_CLI_MODEL;
  const timeout = Number(env.TR_CLI_TIMEOUT || config.timeout || 300);
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('Reasoning timeout must be positive');
  return { agents, timeout, maxRetries: config.maxRetries ?? 0, embedding: config.embedding || options.embedding,
    allowUnknownAuth: config.allowUnknownAuth === true, preferredAgent: preferred || null };
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
  const text = system ? `${system}\n\n---\n\n${prompt}` : prompt;
  const agents = (config.agents || []).filter(agent => agent.enabled !== false).sort((a, b) => a.priority - b.priority);
  if (!agents.length) throw new Error('No CLI agents are configured');
  const { resolvePool } = await import('./pool.mjs');
  const pool = await (dependencies.resolvePool || resolvePool)({ allowUnknownAuth: config.allowUnknownAuth === true });
  const candidates = agents.filter(agent => pool.ready.some(ready => ready.id === agent.name));
  if (!candidates.length) throw new Error(`No configured CLI agent is ready: ${(pool.excluded || []).map(item => `${item.harness}: ${item.reason}`).join('; ') || 'no verified runtime'}`);
  const failures = [];
  for (const agent of candidates) {
    const result = await (dependencies.dispatch || dispatchTask)(agent.name, text, {
      cwd: config.cwd || process.cwd(), node: config.node || 'local', timeoutMs: (config.timeout || 300) * 1000,
      model: agent.model || undefined, write: false, role: 'Reasoning', allowUnknownAuth: config.allowUnknownAuth === true,
    });
    if (result.ok === true || result.success === true) return result.response || '';
    if (result.queued || result.queueError || result.failureKind === 'billing-policy') {
      const error = new Error(result.queued ? `Included usage exhausted. Queued as ${result.queueId}.` : result.queueError || result.error);
      error.queueId = result.queueId;
      throw error;
    }
    failures.push(`${agent.name}: ${result.error || 'dispatch failed'}`);
  }
  throw new Error(`All CLI agents failed (${failures.join('; ')})`);
}

export async function callLocalRuntimeRaw(messages, config, _tools, dependencies) {
  if (!Array.isArray(messages)) throw new Error('Reasoning messages must be an array');
  const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n');
  const user = messages.filter(message => message.role !== 'system').map(message => message.content).join('\n');
  return { role: 'assistant', content: await callLocalRuntime(user, system, config, dependencies) };
}
