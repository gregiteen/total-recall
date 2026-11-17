import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import fs from 'fs';
import path from 'path';
import os from 'os';
import { calculateCurrentCost, checkBudgetSafety } from './usage-tracker.mjs';

describe('Usage Tracker & Budget Safety', () => {
  const tempHome = path.join(process.cwd(), 'scratch', 'test-usage-tracker-home');

  beforeEach(() => {
    if (fs.existsSync(tempHome)) fs.rmSync(tempHome, { recursive: true, force: true });
    fs.mkdirSync(tempHome, { recursive: true });
    vi.spyOn(os, 'homedir').mockReturnValue(tempHome);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempHome)) fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('calculates zero cost when no logs exist', () => {
    const usage = calculateCurrentCost({ home: tempHome });
    expect(usage.dailyUsd).toBe(0);
    expect(usage.weeklyUsd).toBe(0);
  });

  it('parses Claude projects JSONL and Codex token_count JSONL', () => {
    const claudeDir = path.join(tempHome, '.claude', 'projects', 'demo');
    fs.mkdirSync(claudeDir, { recursive: true });
    const nowIso = new Date().toISOString();
    fs.writeFileSync(path.join(claudeDir, 'sess.jsonl'), [
      JSON.stringify({ type: 'assistant', timestamp: nowIso, message: { id: 'm1', model: 'm-a', usage: { input_tokens: 100000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 10000 } } }),
      JSON.stringify({ type: 'assistant', timestamp: nowIso, message: { id: 'm1', model: 'm-a', usage: { input_tokens: 100000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 10000 } } }),
    ].join('\n') + '\n');

    const codexDir = path.join(tempHome, '.codex', 'sessions', '2026');
    fs.mkdirSync(codexDir, { recursive: true });
    fs.writeFileSync(path.join(codexDir, 'c1.jsonl'), [
      JSON.stringify({ type: 'session_meta', timestamp: nowIso, payload: { model: 'm-b' } }),
      JSON.stringify({ type: 'event_msg', timestamp: nowIso, payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 50000, cached_input_tokens: 10000, output_tokens: 5000 } } } }),
    ].join('\n') + '\n');

    const usage = calculateCurrentCost({ home: tempHome });
    expect(usage.breakdown.claude.dailyTokens).toBe(110000);
    expect(usage.breakdown.codex.dailyTokens).toBe(55000);
    expect(usage.dailyUsd).toBeGreaterThan(0);
    expect(usage.weeklyUsd).toBeCloseTo(usage.dailyUsd, 8);
  });

  it('blocks dispatch when budget daily cap is breached', () => {
    const configDir = path.join(tempHome, 'config');
    fs.mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'budget.yml');
    fs.writeFileSync(configPath, 'budget:\n  daily_cap_usd: 0.001\n  weekly_cap_usd: 5.00\n  enabled: true\n');

    const logsDir = path.join(tempHome, '.agent', 'skills', 'total-recall', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(logsDir, 'usage.jsonl'), JSON.stringify({ ts: new Date().toISOString(), cost_usd: 0.5, input_tokens: 1000, output_tokens: 500 }) + '\n');

    expect(() => checkBudgetSafety(configPath, { home: tempHome, alert: false })).toThrowError(/Budget safety limit reached! Daily spend/);
  });

  it('allows dispatch when budget is enabled but not exceeded', () => {
    const configDir = path.join(tempHome, 'config');
    fs.mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'budget.yml');
    fs.writeFileSync(configPath, 'budget:\n  daily_cap_usd: 10.00\n  weekly_cap_usd: 50.00\n  enabled: true\n');
    expect(() => checkBudgetSafety(configPath, { home: tempHome, alert: false })).not.toThrow();
  });
});
