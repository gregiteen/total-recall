/**
 * Meta Harness Self-Learning Subsystem
 * Ingests run execution receipts, updates the empirical scorecard,
 * and proposes friction-reducing rule/memory proposals.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { computeEmpiricalScorecard } from '../capability/index.mjs';

function getLedgerPath() {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const baseDir = path.join(home, '.agent', 'skills', 'total-recall');
  fs.mkdirSync(baseDir, { recursive: true });
  return path.join(baseDir, 'meta-harness-runs.json');
}

/**
 * Record a run execution receipt
 */
export function recordRunReceipt(receipt = {}) {
  const ledgerPath = getLedgerPath();
  let entries = [];
  if (fs.existsSync(ledgerPath)) {
    try {
      entries = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    } catch {
      entries = [];
    }
  }

  const entry = {
    id: receipt.id || `run-${Date.now()}`,
    timestamp: new Date().toISOString(),
    harness: receipt.harness || 'agy',
    task: receipt.task || '',
    complexityScore: receipt.complexityScore || 50,
    success: receipt.success !== false,
    durationMs: receipt.durationMs || 0,
    escalatedFrom: receipt.escalatedFrom || null,
    failures: receipt.failures || {}
  };

  entries.push(entry);
  // Keep last 1,000 runs
  if (entries.length > 1000) {
    entries = entries.slice(-1000);
  }

  fs.writeFileSync(ledgerPath, JSON.stringify(entries, null, 2), 'utf8');
  return { ok: true, recorded: entry.id, totalRuns: entries.length };
}

/**
 * Read learning summary and generate memory/friction proposals
 */
export function learnFromHistory() {
  const ledgerPath = getLedgerPath();
  let entries = [];
  if (fs.existsSync(ledgerPath)) {
    try {
      entries = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    } catch {
      entries = [];
    }
  }

  const scorecard = computeEmpiricalScorecard(entries);
  const proposals = [];

  // Identify harnesses with elevated failure rates (>25%)
  for (const [harness, stats] of Object.entries(scorecard)) {
    if (stats.total >= 3 && stats.passRate < 75) {
      proposals.push({
        id: `proposal-deprecate-or-escalate-${harness}`,
        targetHarness: harness,
        reason: `Pass rate for ${harness} is ${stats.passRate}% over ${stats.total} runs.`,
        recommendation: `Auto-escalate ${harness} to frontier model or apply strict preflight gate.`
      });
    }
  }

  return {
    ok: true,
    totalHistoryRuns: entries.length,
    scorecard,
    proposals
  };
}
