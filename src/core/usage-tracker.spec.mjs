import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { calculateCurrentCost, checkBudgetSafety } from './usage-tracker.mjs';

describe('Usage Tracker & Budget Safety', () => {
  const tempHome = path.join(process.cwd(), 'scratch', 'test-usage-tracker-home');

  beforeEach(() => {
    // Ensure clean temp environment
    if (fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
    fs.mkdirSync(tempHome, { recursive: true });

    // Mock os.homedir to redirect to our temporary test home directory
    vi.spyOn(os, 'homedir').mockReturnValue(tempHome);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('calculates zero cost when no logs exist', () => {
    const usage = calculateCurrentCost();
    expect(usage.dailyUsd).toBe(0);
    expect(usage.weeklyUsd).toBe(0);
  });

  it('correctly ingests and calculates Gemini chat token costs', () => {
    const geminiChatsDir = path.join(tempHome, '.gemini', 'tmp', 'session-123', 'chats');
    fs.mkdirSync(geminiChatsDir, { recursive: true });

    const now = new Date();
    const chatFile = path.join(geminiChatsDir, 'session-abc.jsonl');

    // Write a mock Gemini session log
    const sessionLogs = [
      JSON.stringify({ sessionId: 'abc', startTime: now.toISOString() }),
      JSON.stringify({
        id: 'msg-1',
        timestamp: now.toISOString(),
        type: 'gemini',
        tokens: { input: 10000, output: 5000 }
      })
    ].join('\n') + '\n';

    fs.writeFileSync(chatFile, sessionLogs, 'utf8');

    const usage = calculateCurrentCost();
    
    // Pricing: input $0.075 / M, output $0.30 / M
    // input = 10,000 * 0.075 / 1,000,000 = 0.00075
    // output = 5,000 * 0.30 / 1,000,000 = 0.0015
    // total = 0.00225
    expect(usage.dailyUsd).toBeCloseTo(0.00225, 6);
    expect(usage.weeklyUsd).toBeCloseTo(0.00225, 6);
    expect(usage.breakdown.gemini.dailyTokens).toBe(15000);
  });

  it('correctly parses Claude stats-cache and estimates daily/weekly costs', () => {
    const claudeDir = path.join(tempHome, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    // Write a mock stats-cache.json
    const statsCache = {
      version: 1,
      modelUsage: {
        'claude-sonnet-4-6': {
          inputTokens: 100000,
          outputTokens: 20000,
          cacheReadInputTokens: 500000,
          cacheCreationInputTokens: 50000
        }
      },
      dailyModelTokens: [
        {
          date: todayStr,
          tokensByModel: {
            'claude-sonnet-4-6': 10000
          }
        }
      ]
    };

    fs.writeFileSync(path.join(claudeDir, 'stats-cache.json'), JSON.stringify(statsCache, null, 2), 'utf8');

    const usage = calculateCurrentCost();

    // Historic blend:
    // input: 100,000 * $3/M = $0.30
    // output: 20,000 * $15/M = $0.30
    // cacheRead: 500,000 * $0.30/M = $0.15
    // cacheCreation: 50,000 * $3.75/M = $0.1875
    // total historical cost = 0.30 + 0.30 + 0.15 + 0.1875 = 0.9375
    // total historical tokens = 100,000 + 20,000 + 500,000 + 50,000 = 670,000
    // cost per token = 0.9375 / 670,000 = ~0.000001399
    // today's tokens = 10,000
    // expected today's cost = 10,000 * (0.9375 / 670,000) = ~0.0139925
    expect(usage.dailyUsd).toBeCloseTo(10000 * (0.9375 / 670000), 6);
    expect(usage.weeklyUsd).toBeCloseTo(10000 * (0.9375 / 670000), 6);
  });

  it('blocks dispatch when budget daily cap is breached', () => {
    const configDir = path.join(tempHome, 'config');
    fs.mkdirSync(configDir, { recursive: true });

    // Write a mock config with a tiny daily limit
    const mockConfig = `
budget:
  daily_cap_usd: 0.001
  weekly_cap_usd: 5.00
  enabled: true
`;
    const configPath = path.join(configDir, 'budget.yml');
    fs.writeFileSync(configPath, mockConfig, 'utf8');

    // Create a mock Gemini chat to breach the limit ($0.00225 > $0.001)
    const geminiChatsDir = path.join(tempHome, '.gemini', 'tmp', 'session-123', 'chats');
    fs.mkdirSync(geminiChatsDir, { recursive: true });

    const chatFile = path.join(geminiChatsDir, 'session-abc.jsonl');
    const sessionLogs = [
      JSON.stringify({ sessionId: 'abc', startTime: new Date().toISOString() }),
      JSON.stringify({
        id: 'msg-1',
        timestamp: new Date().toISOString(),
        type: 'gemini',
        tokens: { input: 10000, output: 5000 }
      })
    ].join('\n') + '\n';
    fs.writeFileSync(chatFile, sessionLogs, 'utf8');

    // checkBudgetSafety should throw an error since budget limit is exceeded
    expect(() => checkBudgetSafety(configPath)).toThrowError(/Budget safety limit reached! Daily spend/);
  });

  it('allows dispatch when budget is enabled but not exceeded', () => {
    const configDir = path.join(tempHome, 'config');
    fs.mkdirSync(configDir, { recursive: true });

    const mockConfig = `
budget:
  daily_cap_usd: 10.00
  weekly_cap_usd: 50.00
  enabled: true
`;
    const configPath = path.join(configDir, 'budget.yml');
    fs.writeFileSync(configPath, mockConfig, 'utf8');

    // checkBudgetSafety should not throw
    expect(() => checkBudgetSafety(configPath)).not.toThrow();
  });
});
