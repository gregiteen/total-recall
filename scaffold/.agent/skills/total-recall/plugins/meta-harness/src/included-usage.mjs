/** Admission for the operator's included-usage policy. No provider generation happens here. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { configDir } from './paths.mjs';
import { agentEnvironment, CODEX_PLAN_ARGS, findBinary } from './worker.mjs';
import { activeQuotaWalls, readReceipts } from './learner.mjs';

export const INCLUDED_AGENTS = ['claude', 'codex'];
const VERSION = 1;
const DEFAULT = { version: VERSION, enabled: false, claude: null };
const sha256 = key => createHash('sha256').update(key).digest('hex');

async function policyStore() {
  const { PluginStateStore } = await import('./ssss-store.mjs');
  return new PluginStateStore(path.join(configDir(), 'included-usage.json'), 'meta-harness');
}

export async function readIncludedPolicy(store) {
  store ??= await policyStore();
  const state = store.read(DEFAULT);
  if (state?.version !== VERSION || typeof state.enabled !== 'boolean' ||
      (state.claude !== null && (!/^[a-f0-9]{64}$/.test(state.claude?.fingerprint || '') ||
        typeof state.claude.keyName !== 'string' || typeof state.claude.organization !== 'string' ||
        !Number.isFinite(Date.parse(state.claude.expiresAt))))) {
    throw new Error('Included usage policy is invalid; dispatch stopped.');
  }
  return state;
}

function requireOperator() {
  if (process.env.TR_META_HARNESS_RUN) throw new Error('Only the operator may change the included usage policy.');
}

export async function enforceIncludedUsage() {
  requireOperator();
  const store = await policyStore();
  const state = await readIncludedPolicy(store);
  if (!state.enabled) store.write({ ...state, enabled: true });
  return includedUsageStatus();
}

async function authKey(keyName) {
  const root = process.env.TR_PACKAGE_ROOT;
  if (!root || !path.isAbsolute(root) ||
      JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name !== 'total-recall-brain') {
    throw new Error('Verified Total Recall Auth runtime required.');
  }
  const { loadPluginModule } = await import(pathToFileURL(path.join(root, 'src/core/plugin-runtime.mjs')).href);
  const { hostSecretsBrainDir } = await loadPluginModule('auth', 'host-secrets-store', { activeRequired: true });
  const { getSecret } = await loadPluginModule('auth', 'secrets-store', { activeRequired: true });
  const result = await getSecret(hostSecretsBrainDir(), keyName, { action: 'use', actor: 'meta-harness' });
  if (!result.found || typeof result.value !== 'string' || !/^sk-ant-api[0-9]+-[\w-]+$/.test(result.value)) {
    throw new Error('The selected Anthropic API key is missing or invalid in Total Recall Auth.');
  }
  return result.value;
}

/** Bind the operator's Console observation to the actual secret without recording its value or hint. */
export async function bindClaudeIncludedKey(evidence, { readKey = authKey, now = Date.now() } = {}) {
  requireOperator();
  const { keyName, organization, keyHint, expiresAt, creditSource, autoReload, paymentMethod, invoiced, paidBalanceCents } = evidence || {};
  const expiry = Date.parse(expiresAt);
  const hint = typeof keyHint === 'string' && /^(sk-ant-api[0-9]+-[\w-]{2,20})(?:\.{3}|…)([\w-]{4,12})$/.exec(keyHint);
  if (!/^[A-Z][A-Z0-9_]{1,100}$/.test(keyName || '') || !/^[\w-]{1,100}$/.test(organization || '') ||
      !hint || !Number.isFinite(expiry) || expiry <= now || expiry > now + 35 * 86400000 ||
      creditSource !== 'claude-max' || autoReload !== false || paymentMethod !== false || invoiced !== false || paidBalanceCents !== 0) {
    throw new Error('Binding requires verified Max credit expiry, Console key hint, and a prepaid organization with no paid balance, auto-reload, or payment method.');
  }
  const key = await readKey(keyName);
  if (!key.startsWith(hint[1]) || !key.endsWith(hint[2])) throw new Error('The Console key hint does not match the selected Total Recall Auth key.');
  const store = await policyStore();
  const state = await readIncludedPolicy(store);
  store.write({ ...state, enabled: true, claude: { keyName, organization, expiresAt: new Date(expiry).toISOString(),
    verifiedAt: new Date(now).toISOString(), fingerprint: sha256(key) } });
  return includedUsageStatus();
}

export const claudeProofCurrent = (policy, now = Date.now()) => Date.parse(policy.claude?.expiresAt) > now;

export async function includedUsageStatus({ probe = false } = {}) {
  const policy = await readIncludedPolicy();
  const claude = policy.claude ? { organization: policy.claude.organization, verifiedAt: policy.claude.verifiedAt,
    expiresAt: policy.claude.expiresAt, current: claudeProofCurrent(policy) } : null;
  return { ok: true, policyVersion: VERSION, enabled: policy.enabled, claude,
    ...(probe ? { codex: await readCodexAllowance(process.cwd()) } : {}) };
}

/** Use only the documented account reads on stdio. No turn/start is sent. */
export function queryCodexAccount(cwd, { env = process.env, timeoutMs = 10000 } = {}) {
  const binary = findBinary('codex', env);
  if (!binary) throw new Error('Codex CLI is unavailable.');
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [...CODEX_PLAN_ARGS, 'app-server', '--listen', 'stdio://'], {
      cwd, env: agentEnvironment(env), stdio: ['pipe', 'pipe', 'ignore'],
    });
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    let account, limits, size = 0, outcome;
    const send = message => child.stdin.write(JSON.stringify(message) + '\n');
    const fail = error => {
      outcome ||= { error };
      child.kill('SIGTERM');
    };
    const timer = setTimeout(() => { outcome ||= { error: 'Codex account read timed out.' }; child.kill('SIGKILL'); }, timeoutMs);
    const closed = () => {
      clearTimeout(timer);
      lines.close();
      if (outcome?.result) resolve(outcome.result);
      else reject(new Error(outcome?.error || 'Codex account read ended without a complete result.'));
    };
    child.once('error', () => { outcome = { error: 'Could not start Codex account read.' }; });
    child.once('close', closed);
    child.stdin.on('error', () => fail('Codex account read input closed.'));
    child.stdout.on('data', chunk => { size += chunk.length; if (size > 256 * 1024) fail('Codex account response exceeded its bound.'); });
    lines.on('line', line => {
      if (outcome) return;
      let frame;
      try { frame = JSON.parse(line); } catch { fail('Codex returned invalid account data.'); return; }
      if (![1, 2, 3].includes(frame?.id)) return;
      if (!frame.result || frame.error) { fail('Codex could not read the signed-in account or its limits.'); return; }
      if (frame.id === 1) {
        send({ method: 'initialized', params: {} });
        send({ id: 2, method: 'account/read', params: { refreshToken: false } });
        send({ id: 3, method: 'account/rateLimits/read' });
      } else if (frame.id === 2) account = frame.result;
      else limits = frame.result;
      if (account && limits) {
        outcome = { result: { account, limits } };
        child.stdin.end();
        child.kill('SIGTERM');
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'meta_harness', title: 'Meta Harness', version: '1' } } });
  });
}

export function evaluateCodexAllowance({ account, limits }, now = Date.now()) {
  const plan = account?.account?.planType;
  if (account?.account?.type !== 'chatgpt' || !/^(plus|pro|prolite|go|free)(?:[_-]\w+)?$/i.test(plan || '')) {
    return { ok: false, failureKind: 'auth', error: 'Codex requires a verified personal ChatGPT plan with included limits.' };
  }
  const rate = limits?.rateLimits;
  const buckets = [rate, ...Object.values(limits?.rateLimitsByLimitId || {})].filter(Boolean);
  const windows = [rate?.primary, rate?.secondary].filter(Boolean);
  if (!windows.length || windows.some(window => typeof window.usedPercent !== 'number')) {
    return { ok: false, plan, failureKind: 'billing-policy', error: 'Codex did not report current included usage.' };
  }
  const credits = buckets.map(bucket => bucket.credits).filter(Boolean);
  if (!credits.length || credits.some(c => c.hasCredits !== false || c.unlimited !== false ||
      (c.balance != null && !/^0(?:\.0+)?$/.test(String(c.balance))))) {
    return { ok: false, plan, failureKind: 'billing-policy', error: 'Codex did not confirm that paid credits are unavailable.' };
  }
  const full = windows.filter(window => window.usedPercent >= 100);
  if (full.length) {
    const resets = full.map(window => window.resetsAt * 1000);
    return { ok: false, plan, failureKind: 'quota', error: 'Codex has reached an included usage limit.',
      resetsAt: resets.every(reset => Number.isFinite(reset) && reset > now) ? new Date(Math.max(...resets)).toISOString() : null };
  }
  return { ok: true, plan, usagePercent: Math.max(...windows.map(window => window.usedPercent)) };
}

export async function readCodexAllowance(cwd, { query = queryCodexAccount } = {}) {
  try { return evaluateCodexAllowance(await query(cwd)); }
  catch (error) { return { ok: false, failureKind: 'billing-policy', error: error.message }; }
}

export async function includedAdmission(agent, cwd, policy, { readKey = authKey, codex = readCodexAllowance,
  receipts = readReceipts } = {}) {
  if (!INCLUDED_AGENTS.includes(agent)) return { ok: false, failureKind: 'billing-policy', error: 'This harness is outside the included usage policy.' };
  if (agent === 'claude' && !claudeProofCurrent(policy)) {
    return { ok: false, failureKind: 'billing-policy', error: 'Claude requires current verification of the linked Max credit grant and key.' };
  }
  const wall = activeQuotaWalls((await receipts()).filter(run => run.billingMode === 'included'))[agent];
  if (wall) return { ok: false, failureKind: 'quota', error: 'This harness is waiting for included usage.', resetsAt: wall.resetReported ? wall.until : null };
  if (agent === 'codex') return codex(cwd);
  try {
    const key = await readKey(policy.claude.keyName);
    if (sha256(key) !== policy.claude.fingerprint) throw new Error('The Claude key changed; verify the new key against the Max grant.');
    return { ok: true, key };
  } catch (error) {
    return { ok: false, failureKind: 'auth', error: error.message };
  }
}
