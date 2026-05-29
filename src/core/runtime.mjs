import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import os from 'os';
import { spawnSync } from 'node:child_process';
import { logger } from './logger.mjs';
import { agentDir, brainDir } from './config.mjs';
import { checkBudgetSafety } from './usage-tracker.mjs';
import { validateCommand } from './sandbox.mjs';

/**
 * Find the absolute path to a binary in process.env.PATH.
 * Bulletproof pure-JS replacement for the external 'which' command.
 */
export function findBinaryInPath(binaryName) {
  const pathEnv = process.env.PATH || '';
  const dirs = pathEnv.split(path.delimiter);
  for (const dir of dirs) {
    const fullPath = path.join(dir, binaryName);
    try {
      const stats = fs.statSync(fullPath);
      const isExecutable = stats.isFile() && (os.platform() === 'win32' || (stats.mode & 0o111) !== 0);
      if (isExecutable) {
        return fullPath;
      }
    } catch {
      // Ignored
    }
  }
  return null;
}


/**
 * Total Recall Runtime — CLI Agent Dispatch
 *
 * All reasoning tasks are dispatched to headless CLI agents.
 * Agent registry lives in the cli-agents skill:
 *   .agent/skills/total-recall/skills/cli-agents/agents.yml
 */

// ─── Default agent registry (used when agents.yml doesn't exist) ─────────────

const DEFAULT_AGENTS = [
  { name: 'antigravity', binary: 'antigravity', flags: '--sandbox=false --yolo -o json', priority: 1, enabled: true, exec: 'flag' },
  { name: 'gemini',      binary: 'gemini',      flags: '--sandbox=false --yolo -o json', priority: 2, enabled: true, exec: 'flag' },
  { name: 'claude',      binary: 'claude',      flags: '--output-format json --permission-mode bypassPermissions', priority: 3, enabled: true, exec: 'flag' },
  { name: 'codex',       binary: 'codex',       flags: '--full-auto --json', priority: 4, enabled: true, exec: 'subcommand' },
];

/**
 * Resolve the path to the cli-agents config file.
 */
function getAgentsConfigPath() {
  const skillPath = path.join(agentDir, 'skills', 'total-recall', 'skills', 'cli-agents', 'agents.yml');
  if (fs.existsSync(skillPath)) return skillPath;
  // Fallback: check if it's a standalone skill (not nested in meta-skill)
  const standalonePath = path.join(agentDir, 'skills', 'cli-agents', 'agents.yml');
  if (fs.existsSync(standalonePath)) return standalonePath;
  return null;
}

// ─── Config loading ──────────────────────────────────────────────────────────

/**
 * Load runtime configuration.
 * Reads agent registry from cli-agents/agents.yml.
 * Accepts optional configPath for backward compat (runtime.yml — now embedding-only).
 */
export function loadRuntimeConfig(_configPath) {
  // All config from cli-agents/agents.yml
  const agentsPath = getAgentsConfigPath();
  let agentConfig = {};
  if (agentsPath) {
    agentConfig = yaml.parse(fs.readFileSync(agentsPath, 'utf8')) || {};
  }

  // Parse agents registry
  let agents = DEFAULT_AGENTS.map(a => ({ ...a }));
  if (Array.isArray(agentConfig.agents)) {
    agents = agentConfig.agents
      .filter(a => a.enabled !== false)
      .map(a => ({
        name:     a.name || 'unknown',
        binary:   a.binary || a.name,
        model:    a.model || null,
        flags:    a.flags || '',
        priority: a.priority ?? 99,
        enabled:  a.enabled !== false,
        exec:     a.exec || 'flag',
      }))
      .sort((a, b) => a.priority - b.priority);
  }

  const config = {
    agents,
    timeout:    agentConfig.timeout ?? 300,
    maxRetries: agentConfig.max_retries ?? 2,
    embedding:  agentConfig.embedding ?? { provider: 'google', model: 'text-embedding-004' },
  };

  // Dynamic Priority Resolution (No Hardcoding)
  let preferredAgent = null;

  // Tier A: Check CLI Arg Overrides (--agent=name)
  if (Array.isArray(process.argv)) {
    const agentArg = process.argv.find(arg => arg.startsWith('--agent='));
    if (agentArg) {
      preferredAgent = agentArg.split('=')[1];
    }
  }

  // Tier B: Check Environment Variable Overrides
  if (!preferredAgent && process.env.TR_CLI_AGENT) {
    preferredAgent = process.env.TR_CLI_AGENT;
  }

  // Tier C: Check Central config (brain.json preferred_agent)
  if (!preferredAgent) {
    try {
      const brainJsonPath = path.join(brainDir, 'config', 'brain.json');
      if (fs.existsSync(brainJsonPath)) {
        const brainConfig = JSON.parse(fs.readFileSync(brainJsonPath, 'utf8'));
        if (brainConfig.preferred_agent) {
          preferredAgent = brainConfig.preferred_agent;
        }
      }
    } catch {}
  }

  // Tier D: Check SSSS Compiled Memory Preference Surface
  if (!preferredAgent) {
    try {
      const checkPaths = [
        path.join(brainDir, 'INSTRUCTIONS.md'),
        path.join(brainDir, 'GEMINI.md'),
        path.join(brainDir, 'AGENTS.md')
      ];
      for (const p of checkPaths) {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf8');
          const prefMatch = content.match(/preferred\s+CLI\s+agent\s+is\s+([a-zA-Z0-9_-]+)/i) || content.match(/preferred_cli_agent:\s*([a-zA-Z0-9_-]+)/i);
          if (prefMatch) {
            preferredAgent = prefMatch[1].toLowerCase();
            break;
          }
        }
      }
    } catch {}
  }

  // Apply the dynamic preference
  if (preferredAgent) {
    const idx = config.agents.findIndex(a => a.name === preferredAgent);
    if (idx >= 0) {
      config.agents[idx].priority = 0;
      config.agents.sort((a, b) => a.priority - b.priority);
      logger.info({ subsystem: 'runtime', message: `Dynamically prioritized user preferred agent: ${preferredAgent}` });
    }
  }
  if (process.env.TR_CLI_MODEL) {
    if (config.agents.length > 0) {
      config.agents[0].model = process.env.TR_CLI_MODEL;
    }
  }
  if (process.env.TR_CLI_TIMEOUT) {
    config.timeout = parseInt(process.env.TR_CLI_TIMEOUT, 10);
  }

  return config;
}

// ─── Health check ────────────────────────────────────────────────────────────

/**
 * Check which configured CLI agents are available on the system.
 */
export async function checkRuntimeHealth(config) {
  const agents = config?.agents || DEFAULT_AGENTS;
  const available = [];

  for (const agent of agents) {
    if (!agent.enabled) continue;
    const binaryPath = findBinaryInPath(agent.binary);
    if (binaryPath) {
      available.push({
        name: agent.name,
        binary: binaryPath,
        priority: agent.priority,
      });
    }
  }

  if (available.length === 0) {
    return {
      status: 'degraded',
      reason: 'No CLI agents found. Install antigravity, claude, or codex.',
      available: [],
    };
  }

  return {
    status: 'healthy',
    available,
    primary: available[0].name,
  };
}

// ─── Agent resolution ────────────────────────────────────────────────────────

/**
 * Find the best available CLI agent from the config registry.
 * Tries agents in priority order, returns the first one found on $PATH.
 */
function resolveAgent(config) {
  const agents = config?.agents || DEFAULT_AGENTS;

  for (const agent of agents.sort((a, b) => a.priority - b.priority)) {
    if (!agent.enabled) continue;
    const binaryPath = findBinaryInPath(agent.binary);
    if (binaryPath) {
      return {
        ...agent,
        binaryPath,
      };
    }
  }

  return null;
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

/**
 * Execute a prompt against the best available CLI agent headlessly.
 * Drop-in replacement for the old Ollama callLocalRuntime().
 *
 * @param {string} prompt - The user prompt
 * @param {string} system - System prompt (prepended to the user prompt)
 * @param {object} config - Runtime config from loadRuntimeConfig()
 * @returns {string} The agent's text response
 */
export async function callLocalRuntime(prompt, system, config) {
  // Pre-flight budget watchdog safety check
  checkBudgetSafety();

  const agents = config?.agents || DEFAULT_AGENTS;
  const timeout = (config?.timeout || 300) * 1000;
  const maxRetries = config?.maxRetries ?? 2;

  // Combine system + user prompt
  const fullPrompt = system
    ? `${system}\n\n---\n\n${prompt}`
    : prompt;

  let lastError;

  // Try agents in priority order with retry budget
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const agent = attempt === 0 ? resolveAgent(config) : resolveAgent({
      ...config,
      agents: agents.filter(a => a.name !== lastError?.agentName),
    });

    if (!agent) {
      throw new Error('No CLI agents available. Install antigravity, claude, or codex.');
    }

    const modelFlag = agent.model ? `-m ${agent.model}` : '';

    let cmd;
    if (agent.exec === 'subcommand') {
      cmd = `${agent.binaryPath} exec "${escapeShell(fullPrompt)}" ${agent.flags} ${modelFlag}`.trim();
    } else {
      cmd = `${agent.binaryPath} -p "${escapeShell(fullPrompt)}" ${agent.flags} ${modelFlag}`.trim();
    }

    logger.info({
      subsystem: 'runtime',
      message: `Dispatching to ${agent.name} (attempt ${attempt + 1})`,
      promptLength: fullPrompt.length,
    });

    // Pre-flight command execution validation
    validateCommand(cmd);

    const result = spawnSync('sh', ['-c', cmd], {
      encoding: 'utf8',
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env },
      cwd: process.cwd(),
    });

    if (result.status === 0) {
      const output = result.stdout?.trim() || '';
      return parseAgentOutput(output);
    }

    const err = result.stderr || result.stdout || 'Unknown error';
    logger.error({
      subsystem: 'runtime',
      message: `${agent.name} failed (exit ${result.status})`,
      error: err.slice(0, 500),
    });
    lastError = { agentName: agent.name, error: err.slice(0, 500) };
  }

  throw new Error(`All CLI agents failed. Last error: ${lastError?.error || 'unknown'}`);
}

/**
 * Raw message-based dispatch (for callers that need message arrays).
 * Flattens messages into a single prompt for CLI dispatch.
 */
export async function callLocalRuntimeRaw(messages, config, _tools = undefined) {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const user = messages.filter(m => m.role !== 'system').map(m => m.content).join('\n');
  const content = await callLocalRuntime(user, system, config);
  return { role: 'assistant', content };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeShell(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
}

/**
 * Parse JSON or text output from a CLI agent into plain text.
 */
function parseAgentOutput(output) {
  try {
    const parsed = JSON.parse(output);
    if (parsed.response) return parsed.response;
    if (parsed.result) return parsed.result;
    if (parsed.content) return parsed.content;
    if (parsed.text) return parsed.text;
    if (Array.isArray(parsed) && parsed.length > 0) {
      const last = parsed[parsed.length - 1];
      return last.content || last.text || last.response || JSON.stringify(last);
    }
  } catch {
    // Not JSON — return raw text
  }
  return output;
}

/**
 * Safely clean and parse JSON produced by LLMs, which might contain
 * trailing commas, standalone placeholder lines, or other formatting quirks.
 */
export function cleanAndParseJSON(jsonStr) {
  if (typeof jsonStr !== 'string') {
    return jsonStr;
  }

  let str = jsonStr.trim();

  // 1. Extract JSON from markdown code block if present
  const codeBlockMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    str = codeBlockMatch[1].trim();
  } else {
    const firstBrace = str.indexOf('{');
    const firstBracket = str.indexOf('[');
    let startIdx = -1;
    if (firstBrace !== -1 && firstBracket !== -1) {
      startIdx = Math.min(firstBrace, firstBracket);
    } else if (firstBrace !== -1) {
      startIdx = firstBrace;
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
    }
    if (startIdx !== -1) {
      str = str.slice(startIdx).trim();
    }
  }

  // 2. Strip comments while respecting strings
  let commentStripped = '';
  let i = 0;
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let escaped = false;

  while (i < str.length) {
    const char = str[i];
    const nextChar = str[i + 1];

    if (escaped) { commentStripped += char; escaped = false; i++; continue; }
    if (char === '\\') { commentStripped += char; escaped = true; i++; continue; }
    if (inDoubleQuote) { if (char === '"') inDoubleQuote = false; commentStripped += char; i++; continue; }
    if (inSingleQuote) { if (char === "'") inSingleQuote = false; commentStripped += char; i++; continue; }

    if (char === '/') {
      if (nextChar === '/') {
        i += 2;
        while (i < str.length && str[i] !== '\n' && str[i] !== '\r') i++;
        continue;
      } else if (nextChar === '*') {
        i += 2;
        while (i < str.length && !(str[i] === '*' && str[i + 1] === '/')) i++;
        i += 2;
        continue;
      } else {
        i++;
        while (i < str.length && str[i] !== '\n' && str[i] !== '\r') i++;
        continue;
      }
    }

    if (char === '"') inDoubleQuote = true;
    if (char === "'") inSingleQuote = true;
    commentStripped += char;
    i++;
  }

  // 3. Remove placeholder lines
  const lines = commentStripped.split('\n');
  const cleanedLines = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '_' || trimmed === '_,' || trimmed === ',_' || trimmed === '...' || trimmed === '...,') continue;
    cleanedLines.push(line);
  }
  const cleaned = cleanedLines.join('\n');

  // 4. Tokenize into string literals and structural code blocks
  const segments = [];
  let lastIdx = 0;
  i = 0;
  let inQuote = false;
  let quoteChar = null;
  escaped = false;

  while (i < cleaned.length) {
    const char = cleaned[i];
    if (escaped) { escaped = false; i++; continue; }
    if (char === '\\') { escaped = true; i++; continue; }
    if (inQuote) {
      if (char === quoteChar) {
        segments.push({ type: 'string', value: cleaned.slice(lastIdx, i + 1), quoteChar });
        inQuote = false;
        lastIdx = i + 1;
      }
      i++;
      continue;
    }
    if (char === '"' || char === "'") {
      if (i > lastIdx) segments.push({ type: 'code', value: cleaned.slice(lastIdx, i) });
      inQuote = true;
      quoteChar = char;
      lastIdx = i;
      i++;
      continue;
    }
    i++;
  }
  if (i > lastIdx) {
    if (inQuote) {
      segments.push({ type: 'string', value: cleaned.slice(lastIdx) + quoteChar, quoteChar });
    } else {
      segments.push({ type: 'code', value: cleaned.slice(lastIdx) });
    }
  }

  // 5. Transform segments
  for (const seg of segments) {
    if (seg.type === 'string') {
      if (seg.quoteChar === "'") {
        let content = seg.value.slice(1, -1);
        content = content.replace(/\\'/g, "'").replace(/"/g, '\\"');
        seg.value = `"${content}"`;
        seg.quoteChar = '"';
      }
    } else if (seg.type === 'code') {
      seg.value = seg.value.replace(/\b([a-zA-Z_$][a-zA-Z0-9_$-]*)\s*:/g, '"$1":');
      seg.value = seg.value.replace(/(:\s*)(?!true\b|false\b|null\b)\b([a-zA-Z_$][a-zA-Z0-9_$.-]*)\b(?!\s*:)/g, '$1"$2"');
    }
  }

  let repaired = segments.map(seg => seg.value).join('');
  repaired = repaired.replace(/,\s*([\]}])/g, '$1');

  // 6. Auto-balance braces/brackets
  const stack = [];
  escaped = false;
  let inStr = false;
  for (let j = 0; j < repaired.length; j++) {
    const c = repaired[j];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (inStr) { if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === '{' || c === '[') stack.push(c);
    else if (c === '}') { if (stack[stack.length - 1] === '{') stack.pop(); }
    else if (c === ']') { if (stack[stack.length - 1] === '[') stack.pop(); }
  }
  while (stack.length > 0) {
    const open = stack.pop();
    repaired += open === '{' ? '}' : ']';
  }

  try {
    return JSON.parse(repaired);
  } catch (err) {
    logger.error('cleanAndParseJSON failed to parse repaired JSON', {
      original: jsonStr,
      repaired,
      error: err.message
    });
    throw err;
  }
}
