/** Compatibility interfaces for native hosts. All execution uses the plugin's common boundary. */
import path from 'node:path';
import { getActiveAdapters, findBinary, inspectAgents, agentEnvironment } from './worker.mjs';
import { getInstalledVersion, getLatestVersion } from './tracker.mjs';

export const HARNESS_SPECS = Object.fromEntries(getActiveAdapters().map(adapter => [adapter.id, {
  ...adapter, defaultFlags: adapter.args, execType: adapter.input === 'stdin' ? 'pipe_stdin' : 'flag_last',
  enforcement: 'advisory', enforcementEvidence: 'Use the measured preflight adapter report for enforcement evidence',
}]));

export function normalizeToolSelection(tools) {
  if (tools === undefined || tools === null) return null;
  const values = (Array.isArray(tools) ? tools : String(tools).split(',')).map(value => String(value).trim()).filter(Boolean);
  if (!values.length || (values.length === 1 && values[0] === 'none')) return '';
  if (values.length === 1 && ['all', 'default'].includes(values[0])) return null;
  return values.join(',');
}

export function validateHarnessOptions(id, options = {}) {
  const adapter = getActiveAdapters().find(item => item.id === id);
  if (!adapter) throw new Error(`Unknown harness ID "${id}"`);
  if ((normalizeToolSelection(options.tools) !== null || options.settingSources !== undefined) && id !== 'claude') {
    throw new Error(`Harness "${adapter.name}" does not support choosing its tool set or --setting-sources`);
  }
  if (options.settingSources !== undefined && (typeof options.settingSources !== 'string' || !/^(user|project|local)(,(user|project|local))*$/.test(options.settingSources))) throw new Error('Invalid --setting-sources');
  if (options.allowUnknownAuth !== undefined && typeof options.allowUnknownAuth !== 'boolean') throw new Error('allowUnknownAuth must be an explicit boolean');
  return adapter;
}

/** Legacy inspection helper only; execution flags are built by worker.mjs. */
export function buildHarnessArgs(spec, options = {}) {
  const adapter = validateHarnessOptions(spec.id, options);
  const args = [...adapter.args], extra = [];
  const tools = normalizeToolSelection(options.tools);
  if (tools !== null) extra.push('--tools', tools);
  if (options.settingSources !== undefined) extra.push('--setting-sources', options.settingSources);
  const promptFlag = args.at(-1) === '-p' ? args.pop() : null;
  return [...args, ...extra, ...(promptFlag ? [promptFlag] : [])];
}

export const shellQuote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";

export function detectHarnesses() {
  return getActiveAdapters().map(adapter => {
    const binaryPath = findBinary(adapter.binary);
    return { id: adapter.id, name: adapter.name, available: Boolean(binaryPath), binaryPath, description: adapter.docs, execType: adapter.input };
  });
}

export async function detectHarnessesWithAuth(options = {}) {
  const result = await (options.inspect || inspectAgents)(options);
  return result.agents.map(agent => ({ ...agent, available: agent.installed, authed: agent.authenticated === true && !agent.blockedBy, authRoute: agent.authenticated === 'unknown' ? 'unknown' : agent.authenticated ? 'measured-login' : 'needs-auth' }));
}

/** Kept for callers preparing environments; only an adapter's declared credentials may be resolved. */
export async function resolveHarnessEnv(spec, baseEnv = process.env, { readSecret } = {}) {
  const adapter = validateHarnessOptions(spec.id);
  const env = agentEnvironment(baseEnv);
  if (!Object.keys(adapter.credentials || {}).length) return env;
  if (!readSecret) {
    const { runProcess } = await import('./worker.mjs');
    const binary = findBinary(baseEnv.TOTAL_RECALL_BIN || 'total-recall', baseEnv);
    if (!binary) throw new Error('Total Recall auth owner is unavailable');
    readSecret = async key => {
      const result = await runProcess(binary, ['auth', 'secret', 'get', key], { env: agentEnvironment(baseEnv) });
      return result.exitCode === 0 ? result.stdout.trim() : null;
    };
  }
  for (const [name, keys] of Object.entries(adapter.credentials)) {
    for (const key of keys) { const value = await readSecret(key); if (value) { env[name] = value; break; } }
    if (!env[name]) throw new Error(`Configure ${name} through auth before dispatch`);
  }
  return env;
}

export async function dispatchTask(id, prompt, options = {}, dependencies = {}) {
  validateHarnessOptions(id, options);
  const remote = options.node && options.node !== 'local';
  if (remote && (typeof options.cwd !== 'string' || (!path.posix.isAbsolute(options.cwd) && !path.win32.isAbsolute(options.cwd)))) throw new Error('Choose an explicit absolute workspace on the remote node');
  const { dispatchWithReceipt } = await import('./dispatch.mjs');
  const result = await (dependencies.dispatch || dispatchWithReceipt)({
    agent: id, cwd: remote ? options.cwd : path.resolve(options.cwd || process.cwd()), prompt,
    node: options.node || 'local', permissions: { read: true, write: options.write === true },
    allowUnknownAuth: options.allowUnknownAuth === true, timeoutMs: options.timeoutMs,
    tools: options.tools, settingSources: options.settingSources, model: options.model,
  }, { node: options.node || 'local', role: options.role || 'Dispatch' });
  return { ...result, harnessId: id, harnessName: HARNESS_SPECS[id]?.name || id, success: result.ok === true };
}

export async function runCouncil(prompt, ids, options = {}) {
  const { coordinateTask } = await import('./coordinator.mjs');
  return coordinateTask(prompt, { ...options, mode: 'council', execute: true, ...(ids ? { availableHarnesses: ids } : {}) });
}

export const getInstalledHarnessVersion = id => getInstalledVersion(id) || 'unknown';
export const getLatestHarnessVersion = (id, installed) => getLatestVersion(id, installed);

export async function queryHarnessUsage(options = {}) {
  const { inspectQuotas } = await import('./router.mjs');
  const report = await (options.inspectQuotas || inspectQuotas)(options);
  if (!report.ok) throw new Error(report.error || 'Harness usage is unavailable');
  const remaining = value => typeof value === 'number' ? `${Math.max(0, 100 - value)}%` : '—';
  return Object.entries(report.quotas || {}).filter(([id]) => !['system', 'metered'].includes(id)).map(([id, quota]) => ({
    id, name: HARNESS_SPECS[id]?.name || id, available: quota.installed === true,
    authed: quota.status === 'ready', authRoute: quota.status, status: quota.status,
    version: quota.version || 'unknown', latestVersion: quota.latestVersion || null, isCurrent: quota.latestVersion ? quota.version === quota.latestVersion : null,
    rolling5hRemainingPct: remaining(quota.rolling5hUsedPercent), weeklyRemainingPct: remaining(quota.weeklyUsedPercent),
    quotaRemaining: quota.quotaNote || 'No usage source', enforcement: 'advisory', enforcementEvidence: null,
  }));
}
