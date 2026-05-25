import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import { logger } from './logger.mjs';
import { brainDir } from './config.mjs';

// Standard pricing constants ($ per million tokens)
export const PRICING = {
  claude: {
    input: 3.00 / 1000000,
    output: 15.00 / 1000000,
    cacheRead: 0.30 / 1000000,
    cacheCreation: 3.75 / 1000000
  },
  gemini: {
    input: 0.075 / 1000000,
    output: 0.30 / 1000000
  },
  codex: {
    input: 2.50 / 1000000,
    output: 10.00 / 1000000
  }
};

/**
 * Recursively find files in a directory.
 */
function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath, callback);
      } else if (entry.isFile()) {
        callback(fullPath);
      }
    }
  } catch (err) {
    logger.warn('usage-tracker', `Error walking directory ${dir}: ${err.message}`);
  }
}

/**
 * Calculates local token and dollar cost usage across Gemini, Claude, and Codex.
 * Tracks usage in the last 24 hours (daily) and last 7 days (weekly).
 *
 * @returns {object} Combined daily and weekly metrics and breakdown per agent.
 */
export function calculateCurrentCost() {
  const now = new Date();
  
  const dailyLimitMs = 24 * 60 * 60 * 1000;
  const weeklyLimitMs = 7 * 24 * 60 * 60 * 1000;
  
  // Format local date string as YYYY-MM-DD
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const gemini = {
    dailyInput: 0,
    dailyOutput: 0,
    weeklyInput: 0,
    weeklyOutput: 0
  };

  const claude = {
    dailyCost: 0,
    weeklyCost: 0
  };

  const codex = {
    dailyInput: 0,
    dailyOutput: 0,
    weeklyInput: 0,
    weeklyOutput: 0
  };

  // 1. Gemini Ingestion
  const geminiTmpBase = path.join(os.homedir(), '.gemini', 'tmp');
  if (fs.existsSync(geminiTmpBase)) {
    try {
      const dirs = fs.readdirSync(geminiTmpBase).filter(d => {
        const full = path.join(geminiTmpBase, d, 'chats');
        try {
          return fs.existsSync(full) && fs.statSync(full).isDirectory();
        } catch {
          return false;
        }
      });

      for (const dir of dirs) {
        const chatsDir = path.join(geminiTmpBase, dir, 'chats');
        try {
          const files = fs.readdirSync(chatsDir).filter(f => f.endsWith('.jsonl'));
          for (const file of files) {
            const filePath = path.join(chatsDir, file);
            try {
              const stat = fs.statSync(filePath);
              const ageMs = now.getTime() - stat.mtime.getTime();
              
              // Skip files older than 7 days entirely to avoid reading large logs
              if (ageMs > weeklyLimitMs) continue;

              const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
              for (const line of lines) {
                try {
                  const entry = JSON.parse(line);
                  if (entry.tokens) {
                    const timestamp = entry.timestamp ? new Date(entry.timestamp) : stat.mtime;
                    const entryAgeMs = now.getTime() - timestamp.getTime();
                    
                    const input = entry.tokens.input || 0;
                    const output = entry.tokens.output || 0;

                    if (entryAgeMs <= dailyLimitMs) {
                      gemini.dailyInput += input;
                      gemini.dailyOutput += output;
                    }
                    if (entryAgeMs <= weeklyLimitMs) {
                      gemini.weeklyInput += input;
                      gemini.weeklyOutput += output;
                    }
                  }
                } catch { /* malformed line */ }
              }
            } catch (err) { /* unreadable file */ }
          }
        } catch { /* unreadable directory */ }
      }
    } catch (err) {
      logger.warn('usage-tracker', `Failed to read Gemini tmp chats: ${err.message}`);
    }
  }

  // 2. Claude Ingestion
  const statsFile = path.join(os.homedir(), '.claude', 'stats-cache.json');
  if (fs.existsSync(statsFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
      const modelStats = {};
      const fallbackCostPerToken = 5.00 / 1000000; // conservative blended rate

      // Calculate historical cost per token for each model
      const usageSrc = data.modelUsage || data.models;
      if (usageSrc) {
        for (const [model, stats] of Object.entries(usageSrc)) {
          const input = stats.inputTokens || 0;
          const output = stats.outputTokens || 0;
          const cacheRead = stats.cacheReadInputTokens || 0;
          const cacheCreation = stats.cacheCreationInputTokens || 0;
          
          const totalTokens = input + output + cacheRead + cacheCreation;
          if (totalTokens > 0) {
            const totalCost = (input * PRICING.claude.input) +
                              (output * PRICING.claude.output) +
                              (cacheRead * PRICING.claude.cacheRead) +
                              (cacheCreation * PRICING.claude.cacheCreation);
            modelStats[model] = {
              costPerToken: totalCost / totalTokens
            };
          }
        }
      }

      // Parse daily activity
      if (Array.isArray(data.dailyModelTokens)) {
        for (const entry of data.dailyModelTokens) {
          if (!entry.date) continue;
          
          const entryDate = new Date(`${entry.date}T12:00:00`); // parse cleanly in local/system time
          const diffMs = now.getTime() - entryDate.getTime();
          const isToday = entry.date === todayStr;
          const isThisWeek = diffMs <= weeklyLimitMs;

          if (isToday || isThisWeek) {
            let entryCost = 0;
            if (entry.tokensByModel) {
              for (const [model, tokens] of Object.entries(entry.tokensByModel)) {
                const costPerToken = modelStats[model]?.costPerToken || fallbackCostPerToken;
                entryCost += tokens * costPerToken;
              }
            }
            if (isToday) {
              claude.dailyCost += entryCost;
            }
            if (isThisWeek) {
              claude.weeklyCost += entryCost;
            }
          }
        }
      }
    } catch (err) {
      logger.warn('usage-tracker', `Failed to read Claude stats-cache.json: ${err.message}`);
    }
  }

  // 3. Codex Ingestion
  const codexSessionsDir = path.join(os.homedir(), '.codex', 'sessions');
  if (fs.existsSync(codexSessionsDir)) {
    try {
      walkDir(codexSessionsDir, (filePath) => {
        if (!filePath.endsWith('.jsonl')) return;
        try {
          const stat = fs.statSync(filePath);
          const ageMs = now.getTime() - stat.mtime.getTime();
          if (ageMs > weeklyLimitMs) return;

          const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              if (entry.usage) {
                const timestamp = entry.timestamp ? new Date(entry.timestamp) : stat.mtime;
                const entryAgeMs = now.getTime() - timestamp.getTime();
                
                const input = entry.usage.prompt_tokens || entry.usage.input_tokens || 0;
                const output = entry.usage.completion_tokens || entry.usage.output_tokens || 0;

                if (entryAgeMs <= dailyLimitMs) {
                  codex.dailyInput += input;
                  codex.dailyOutput += output;
                }
                if (entryAgeMs <= weeklyLimitMs) {
                  codex.weeklyInput += input;
                  codex.weeklyOutput += output;
                }
              }
            } catch { /* line error */ }
          }
        } catch { /* file error */ }
      });
    } catch (err) {
      logger.warn('usage-tracker', `Failed to scan Codex sessions: ${err.message}`);
    }
  }

  // Cost conversion
  const geminiDailyCost = (gemini.dailyInput * PRICING.gemini.input) + (gemini.dailyOutput * PRICING.gemini.output);
  const geminiWeeklyCost = (gemini.weeklyInput * PRICING.gemini.input) + (gemini.weeklyOutput * PRICING.gemini.output);
  
  const codexDailyCost = (codex.dailyInput * PRICING.codex.input) + (codex.dailyOutput * PRICING.codex.output);
  const codexWeeklyCost = (codex.weeklyInput * PRICING.codex.input) + (codex.weeklyOutput * PRICING.codex.output);

  const dailyUsd = geminiDailyCost + claude.dailyCost + codexDailyCost;
  const weeklyUsd = geminiWeeklyCost + claude.weeklyCost + codexWeeklyCost;

  return {
    timestamp: now.toISOString(),
    dailyUsd,
    weeklyUsd,
    breakdown: {
      gemini: {
        dailyUsd: geminiDailyCost,
        weeklyUsd: geminiWeeklyCost,
        dailyTokens: gemini.dailyInput + gemini.dailyOutput,
        weeklyTokens: gemini.weeklyInput + gemini.weeklyOutput
      },
      claude: {
        dailyUsd: claude.dailyCost,
        weeklyUsd: claude.weeklyCost
      },
      codex: {
        dailyUsd: codexDailyCost,
        weeklyUsd: codexWeeklyCost,
        dailyTokens: codex.dailyInput + codex.dailyOutput,
        weeklyTokens: codex.weeklyInput + codex.weeklyOutput
      }
    }
  };
}

/**
 * Safely load and parse budget.yml config.
 *
 * @param {string} configPath
 * @returns {object} Budget config structure.
 */
export function loadBudgetConfig(configPath) {
  if (!fs.existsSync(configPath)) return {};
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return yaml.parse(raw) || {};
  } catch (err) {
    logger.warn('usage-tracker', `Failed to parse budget config at ${configPath}: ${err.message}`);
    return {};
  }
}

/**
 * Checks if the current token/dollar spend exceeds safety limits in budget.yml.
 * Throws a budget exhaustion error if caps are breached.
 *
 * @param {string} configPath - Path to the budget.yml config file.
 */
export function checkBudgetSafety(configPath) {
  try {
    let resolvedPath = configPath;
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      // Fallback 1: workspace root config
      const workspacePath = path.join(process.cwd(), 'config', 'budget.yml');
      if (fs.existsSync(workspacePath)) {
        resolvedPath = workspacePath;
      } else {
        // Fallback 2: agentDir config
        const agentHomePath = path.join(brainDir, 'config', 'budget.yml');
        if (fs.existsSync(agentHomePath)) {
          resolvedPath = agentHomePath;
        }
      }
    }

    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      logger.warn('usage-tracker', `Budget config not found, bypassing safety check.`);
      return;
    }

    const config = loadBudgetConfig(resolvedPath);
    if (!config.budget || config.budget.enabled === false) {
      return;
    }

    const { daily_cap_usd, weekly_cap_usd } = config.budget;
    const usage = calculateCurrentCost();

    if (daily_cap_usd !== undefined && usage.dailyUsd > daily_cap_usd) {
      const errorMsg = `Budget safety limit reached! Daily spend of $${usage.dailyUsd.toFixed(4)} exceeds the cap of $${daily_cap_usd.toFixed(4)}. Dispatch blocked.`;
      logger.error('usage-tracker', errorMsg);
      throw new Error(errorMsg);
    }

    if (weekly_cap_usd !== undefined && usage.weeklyUsd > weekly_cap_usd) {
      const errorMsg = `Budget safety limit reached! Weekly spend of $${usage.weeklyUsd.toFixed(4)} exceeds the cap of $${weekly_cap_usd.toFixed(4)}. Dispatch blocked.`;
      logger.error('usage-tracker', errorMsg);
      throw new Error(errorMsg);
    }

    logger.info('usage-tracker', `Spend within limits. Daily: $${usage.dailyUsd.toFixed(4)} / $${daily_cap_usd?.toFixed(4) || 'N/A'}. Weekly: $${usage.weeklyUsd.toFixed(4)} / $${weekly_cap_usd?.toFixed(4) || 'N/A'}.`);
  } catch (err) {
    if (err.message.includes('Budget safety limit reached')) {
      throw err;
    }
    logger.warn('usage-tracker', `Error executing safety check: ${err.message}. Safeguard bypassed.`);
  }
}
