import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import { execFileSync } from 'node:child_process';
import { logger } from './logger.mjs';
import { brainDir } from './config.mjs';

/** Neutral fallback rates ($ per token) when live ai-models catalog cache is absent. */
export const DEFAULT_RATES = Object.freeze({
  input: 2.00 / 1_000_000,
  cachedInput: 0.20 / 1_000_000,
  cacheWrite: 2.50 / 1_000_000,
  output: 10.00 / 1_000_000,
});

function walkRecentJsonl(dir, cutoffMs, callback) {
  if (!fs.existsSync(dir)) return;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walkRecentJsonl(fullPath, cutoffMs, callback);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        try {
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs >= cutoffMs) callback(fullPath, stat);
        } catch { /* unreadable file */ }
      }
    }
  } catch (err) {
    logger.warn('usage-tracker', `Error walking directory ${dir}: ${err.message}`);
  }
}

/** Load cached per-1M USD pricing from ai-models cache when available; never hardcodes model names. */
export function loadCatalogPricing(home = os.homedir()) {
  const map = new Map();
  const cacheDir = path.join(home, '.agent', 'skills', 'total-recall', 'cache');
  try {
    for (const name of fs.readdirSync(cacheDir)) {
      if (!name.startsWith('ai-models') || !name.endsWith('.json')) continue;
      const data = JSON.parse(fs.readFileSync(path.join(cacheDir, name), 'utf8'));
      const models = Array.isArray(data?.models) ? data.models : Object.values(data?.providers || {}).flatMap((p) => p?.models || []);
      for (const m of models) {
        if (m?.id && m?.pricing && Number.isFinite(m.pricing.inputPerM) && Number.isFinite(m.pricing.outputPerM)) {
          map.set(m.id, {
            input: m.pricing.inputPerM / 1_000_000,
            cachedInput: (m.pricing.inputPerM * 0.1) / 1_000_000,
            cacheWrite: (m.pricing.inputPerM * 1.25) / 1_000_000,
            output: m.pricing.outputPerM / 1_000_000,
          });
        }
      }
    }
  } catch { /* no cache */ }
  return map;
}

/**
 * Calculates local token and API-equivalent dollar cost across Claude, Codex, and Auth usage.jsonl.
 * Tracks usage in the last 24 hours (daily) and last 7 days (weekly).
 */
export function calculateCurrentCost({ home = os.homedir(), now = new Date() } = {}) {
  const nowMs = now.getTime();
  const dailyCutoff = nowMs - 24 * 60 * 60 * 1000;
  const weeklyCutoff = nowMs - 7 * 24 * 60 * 60 * 1000;
  const pricing = loadCatalogPricing(home);
  const rateFor = (model) => pricing.get(model) || DEFAULT_RATES;

  const claude = { dailyUsd: 0, weeklyUsd: 0, dailyTokens: 0, weeklyTokens: 0 };
  const codex = { dailyUsd: 0, weeklyUsd: 0, dailyTokens: 0, weeklyTokens: 0 };
  const ledger = { dailyUsd: 0, weeklyUsd: 0, dailyTokens: 0, weeklyTokens: 0 };

  // 1. Claude Code project transcripts (~/.claude/projects/**/*.jsonl)
  walkRecentJsonl(path.join(home, '.claude', 'projects'), weeklyCutoff, (filePath, stat) => {
    const seen = new Set();
    let lines;
    try { lines = fs.readFileSync(filePath, 'utf8').split('\n'); } catch { return; }
    for (const line of lines) {
      if (!line) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      if (row.type !== 'assistant' || !row.message?.usage) continue;
      const msgId = row.message.id || row.uuid;
      if (msgId && seen.has(msgId)) continue;
      if (msgId) seen.add(msgId);
      const ts = row.timestamp ? Date.parse(row.timestamp) : stat.mtimeMs;
      if (!Number.isFinite(ts) || ts < weeklyCutoff) continue;
      const u = row.message.usage;
      const r = rateFor(row.message.model);
      const inp = u.input_tokens || 0;
      const cWrite = u.cache_creation_input_tokens || 0;
      const cRead = u.cache_read_input_tokens || 0;
      const out = u.output_tokens || 0;
      const cost = (inp * r.input) + (cWrite * r.cacheWrite) + (cRead * r.cachedInput) + (out * r.output);
      const tokens = inp + cWrite + cRead + out;
      claude.weeklyUsd += cost;
      claude.weeklyTokens += tokens;
      if (ts >= dailyCutoff) { claude.dailyUsd += cost; claude.dailyTokens += tokens; }
    }
  });

  // 2. Codex CLI transcripts (~/.codex/sessions + archived_sessions)
  for (const sub of ['sessions', 'archived_sessions']) {
    walkRecentJsonl(path.join(home, '.codex', sub), weeklyCutoff, (filePath, stat) => {
      let model = null, lastTotal = null, firstTs = 0;
      let lines;
      try { lines = fs.readFileSync(filePath, 'utf8').split('\n'); } catch { return; }
      for (const line of lines) {
        if (!line) continue;
        let row;
        try { row = JSON.parse(line); } catch { continue; }
        if (!firstTs && row.timestamp) { const t = Date.parse(row.timestamp); if (Number.isFinite(t)) firstTs = t; }
        if ((row.type === 'turn_context' || row.type === 'session_meta') && row.payload?.model) model = row.payload.model;
        if (row.type === 'event_msg' && row.payload?.type === 'token_count' && row.payload?.info?.total_token_usage) {
          lastTotal = row.payload.info.total_token_usage;
        }
      }
      if (!lastTotal) return;
      const ts = firstTs || stat.mtimeMs;
      if (ts < weeklyCutoff) return;
      const r = rateFor(model);
      const input = lastTotal.input_tokens || 0;
      const cached = lastTotal.cached_input_tokens || 0;
      const uncached = Math.max(0, input - cached);
      const output = lastTotal.output_tokens || 0;
      const cost = (uncached * r.input) + (cached * r.cachedInput) + (output * r.output);
      const tokens = input + output;
      codex.weeklyUsd += cost;
      codex.weeklyTokens += tokens;
      if (ts >= dailyCutoff) { codex.dailyUsd += cost; codex.dailyTokens += tokens; }
    });
  }

  // 3. Auth metered usage ledger (~/.agent/skills/total-recall/logs/usage.jsonl)
  const usageFile = path.join(home, '.agent', 'skills', 'total-recall', 'logs', 'usage.jsonl');
  if (fs.existsSync(usageFile)) {
    try {
      for (const line of fs.readFileSync(usageFile, 'utf8').split('\n')) {
        if (!line) continue;
        let row;
        try { row = JSON.parse(line); } catch { continue; }
        const ts = Date.parse(row.ts || '');
        if (!Number.isFinite(ts) || ts < weeklyCutoff) continue;
        const cost = Number(row.cost_usd) || 0;
        const tokens = (Number(row.input_tokens) || 0) + (Number(row.output_tokens) || 0);
        ledger.weeklyUsd += cost;
        ledger.weeklyTokens += tokens;
        if (ts >= dailyCutoff) { ledger.dailyUsd += cost; ledger.dailyTokens += tokens; }
      }
    } catch { /* unreadable usage.jsonl */ }
  }

  const dailyUsd = claude.dailyUsd + codex.dailyUsd + ledger.dailyUsd;
  const weeklyUsd = claude.weeklyUsd + codex.weeklyUsd + ledger.weeklyUsd;

  return {
    timestamp: now.toISOString(),
    dailyUsd,
    weeklyUsd,
    breakdown: { claude, codex, metered: ledger },
  };
}

export function syncUsageLedger() {
  return calculateCurrentCost();
}

export function loadBudgetConfig(configPath) {
  if (!fs.existsSync(configPath)) return {};
  try {
    return yaml.parse(fs.readFileSync(configPath, 'utf8')) || {};
  } catch (err) {
    logger.warn('usage-tracker', `Failed to parse budget config at ${configPath}: ${err.message}`);
    return {};
  }
}

function sendBudgetAlert(title, message) {
  try {
    execFileSync(process.env.TOTAL_RECALL_BIN || 'total-recall', [
      'alerts', 'send', '--title', title, '--message', message,
      '--severity', 'critical', '--source', 'usage-tracker',
      '--event-id', `budget-breach-${new Date().toISOString().slice(0, 10)}`,
    ], { stdio: 'pipe', timeout: 10000 });
  } catch { /* alert delivery must not mask the budget error */ }
}

export function checkBudgetSafety(configPath, { home = os.homedir(), alert = true } = {}) {
  let resolvedPath = configPath;
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    const workspacePath = path.join(process.cwd(), 'config', 'budget.yml');
    const agentHomePath = path.join(brainDir, 'config', 'budget.yml');
    if (fs.existsSync(workspacePath)) resolvedPath = workspacePath;
    else if (fs.existsSync(agentHomePath)) resolvedPath = agentHomePath;
  }
  if (!resolvedPath || !fs.existsSync(resolvedPath)) return;

  const config = loadBudgetConfig(resolvedPath);
  if (!config.budget || config.budget.enabled === false) return;

  const { daily_cap_usd, weekly_cap_usd } = config.budget;
  // Native CLI transcript costs are API-equivalent estimates, including work
  // covered by subscriptions. Only Auth's metered ledger records dollar spend.
  // Included-plan admission and allowance limits belong to Metaharness.
  const usage = calculateCurrentCost({ home }).breakdown.metered;

  if (daily_cap_usd !== undefined && usage.dailyUsd > daily_cap_usd) {
    const errorMsg = `Budget safety limit reached! Daily spend of $${usage.dailyUsd.toFixed(4)} exceeds the cap of $${daily_cap_usd.toFixed(4)}. Dispatch blocked.`;
    logger.error('usage-tracker', errorMsg);
    if (alert) sendBudgetAlert('Total Recall Daily Budget Breached', errorMsg);
    throw new Error(errorMsg);
  }
  if (weekly_cap_usd !== undefined && usage.weeklyUsd > weekly_cap_usd) {
    const errorMsg = `Budget safety limit reached! Weekly spend of $${usage.weeklyUsd.toFixed(4)} exceeds the cap of $${weekly_cap_usd.toFixed(4)}. Dispatch blocked.`;
    logger.error('usage-tracker', errorMsg);
    if (alert) sendBudgetAlert('Total Recall Weekly Budget Breached', errorMsg);
    throw new Error(errorMsg);
  }
}
