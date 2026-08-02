import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import os from 'os';
import { spawnSync } from 'node:child_process';
import { logger } from './logger.mjs';
import { agentDir, brainDir, googleApiKey, tavilyApiKey, braveApiKey, exaApiKey, serperApiKey, githubToken, embedModel } from './config.mjs';
import { checkBudgetSafety } from './usage-tracker.mjs';
import { validateCommand } from './sandbox.mjs';

/**
 * Find the absolute path to a binary in process.env.PATH.
 * Bulletproof pure-JS replacement for the external 'which' command.
 */
export function findBinaryInPath(binaryName) {
  const pathEnv = process.env.PATH || '';
  const extra = [
    path.join(os.homedir(), '.local', 'bin'),
    path.join(os.homedir(), '.grok', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  const dirs = [...new Set([...pathEnv.split(path.delimiter), ...extra].filter(Boolean))];
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
 * Agent registry lives in the agents module (not an IDE skill):
 *   .agent/skills/total-recall/modules/agents/agents.yml
 */

// ─── Default agent registry (used when agents.yml doesn't exist) ─────────────

// NOTE ON FLAG ORDER AND MODEL PINS (verified by live probe 2026-08-01):
//   agy    — the REAL Google Antigravity CLI (AI Ultra). The binary named
//            `antigravity` is a metered Gemini API wrapper, NOT this. Disabled
//            below; enabling it bills an exhausted API budget (429s).
//   claude — `-p` is required for non-interactive AND must be LAST, because
//            `--tools` is variadic and otherwise swallows the prompt.
//   codex  — `-m` must be pinned; a config.toml model the account cannot use
//            fails with HTTP 400 at exit code 0.
const DEFAULT_AGENTS = [
  { name: 'agy',         binary: 'agy',         flags: '--output-format json -p', priority: 1, enabled: true, exec: 'flag' },
  { name: 'claude',      binary: 'claude',      flags: '--output-format json --permission-mode bypassPermissions --setting-sources local --tools "" -p', priority: 2, enabled: true, exec: 'flag' },
  { name: 'codex',       binary: 'codex',       flags: '-m gpt-5.5 --sandbox workspace-write --json --skip-git-repo-check', priority: 3, enabled: true, exec: 'subcommand' },
  { name: 'antigravity', binary: 'antigravity', flags: '--sandbox=false --yolo -o json', priority: 8, enabled: false, exec: 'flag' },
  { name: 'gemini',      binary: 'gemini',      flags: '--sandbox=false --yolo -o json', priority: 9, enabled: false, exec: 'flag' },
  { name: 'grok',        binary: 'grok',        flags: '--output-format plain --always-approve --permission-mode bypassPermissions', priority: 10, enabled: false, exec: 'flag' },
];

/**
 * Resolve the path to the cli-agents config file.
 */
function getAgentsConfigPath() {
  // Prefer modules/agents (TR_CORE_FOCUS). Fall back to legacy nested-skill paths.
  const candidates = [
    path.join(agentDir, 'skills', 'total-recall', 'modules', 'agents', 'agents.yml'),
    path.join(agentDir, 'skills', 'total-recall', 'skills', 'cli-agents', 'agents.yml'),
    path.join(agentDir, 'skills', 'cli-agents', 'agents.yml'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
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
    // Take the model from config, not a second hardcoded literal. This used to
    // read 'text-embedding-004' while embeddings.mjs defaulted to
    // 'gemini-embedding-2' — two different answers to the same question, and
    // nothing reconciled them.
    embedding:  agentConfig.embedding ?? { provider: 'google', model: embedModel },
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
  // Surfaces live at agent root / repo root — not under brainDir (…/skills/total-recall/)
  if (!preferredAgent) {
    try {
      const checkPaths = [
        path.join(agentDir, 'INSTRUCTIONS.md'),
        path.join(agentDir, 'AGENTS.md'),
        path.join(agentDir, 'GEMINI.md'),
        path.join(path.dirname(agentDir), 'INSTRUCTIONS.md'),
        path.join(path.dirname(agentDir), 'AGENTS.md'),
        path.join(process.cwd(), 'INSTRUCTIONS.md'),
        path.join(process.cwd(), 'AGENTS.md'),
        path.join(process.cwd(), 'Claude.md'),
        // legacy mistaken brainDir locations (kept as last resort)
        path.join(brainDir, 'INSTRUCTIONS.md'),
        path.join(brainDir, 'GEMINI.md'),
        path.join(brainDir, 'AGENTS.md'),
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
      reason: 'No CLI agents found. Install antigravity, grok, claude, or codex.',
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
 * Drop-in replacement for the old local_llm callLocalRuntime().
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

  // Load dynamic secrets from secrets.enc to ensure changes take effect immediately without server restart
  let dynamicSecrets = {};
  try {
    const pathsToCheck = [
      path.join(process.cwd(), '.agent', 'secrets.enc'),
      path.join(agentDir, 'secrets.enc'),
      path.join(os.homedir(), '.agent', 'skills', 'total-recall', 'config', 'secrets.enc'),
      path.join(agentDir, 'skills', 'total-recall', 'config', 'secrets.enc'),
    ];
    for (const p of pathsToCheck) {
      if (fs.existsSync(p)) {
        try {
          const { loadSecretsSync } = await import('./secrets-store.mjs');
          const isConfigPath = p.includes(path.join('config', 'secrets.enc'));
          const brainDir = isConfigPath ? path.dirname(path.dirname(p)) : path.dirname(p);
          dynamicSecrets = loadSecretsSync(brainDir);
          if (Object.keys(dynamicSecrets).length > 0) {
            break;
          }
        } catch {}
      }
    }
  } catch {}

  // Try agents in priority order, never re-trying one that already failed.
  //
  // The old filter excluded only `lastError.agentName` — the MOST RECENT
  // failure — so a chain of three could hand work back to an agent that had
  // already failed while a healthy one further down was never reached. Track
  // every failure instead.
  //
  // The iteration cap is `agents.length + maxRetries` so that each enabled
  // agent gets a turn even when the retry budget is smaller than the chain;
  // the loop exits as soon as the untried pool is empty.
  const failedAgents = new Set();
  const maxAttempts = agents.length + maxRetries;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const remaining = agents.filter(a => !failedAgents.has(a.name));
    const agent = remaining.length > 0
      ? resolveAgent({ ...config, agents: remaining })
      : null;

    if (!agent) {
      if (failedAgents.size > 0) {
        throw new Error(
          `All CLI agents failed (tried: ${[...failedAgents].join(', ')}). ` +
          `Last error: ${lastError?.error || 'unknown'}`,
        );
      }
      throw new Error(
        'No CLI agents available. Install agy (Google Antigravity), claude, or codex.',
      );
    }

    // The prompt goes LAST, after every flag. Pushing it first (the old
    // behaviour) broke the registry's own flag sets: it emitted a duplicate
    // `-p` for agents whose flags already carry one, and it defeats the
    // ordering that keeps a variadic flag (claude's `--tools <tools...>`) from
    // swallowing the prompt as one of its values.
    const args = [];
    if (agent.exec === 'subcommand') {
      args.push('exec');
    }
    if (agent.flags) {
      // spawnSync does not go through a shell, so quotes in the registry are
      // literal characters: `--tools ""` would pass a two-character string
      // rather than an empty one. Strip matched surrounding quotes per token.
      args.push(
        ...agent.flags
          .split(/\s+/)
          .filter(Boolean)
          .map(tok => tok.replace(/^(['"])(.*)\1$/, '$2')),
      );
    }
    if (agent.model) {
      args.push('-m', agent.model);
    }
    // `exec: flag` agents need an explicit `-p` only if their flags omit it.
    if (agent.exec !== 'subcommand' && !args.includes('-p') && !args.includes('--print')) {
      args.push('-p');
    }
    args.push(fullPrompt);

    const cmd = `${agent.binaryPath} ${args.map(a => a.includes(' ') || a.includes('\n') ? `"${a.replace(/"/g, '\\"')}"` : a).join(' ')}`;

    logger.info({
      subsystem: 'runtime',
      message: `Dispatching to ${agent.name} (attempt ${attempt + 1})`,
      promptLength: fullPrompt.length,
    });

    // Pre-flight command execution validation
    validateCommand(cmd);

    const xaiKey =
      process.env.XAI_API_KEY ||
      process.env.GROK_API_KEY ||
      dynamicSecrets.XAI_API_KEY ||
      dynamicSecrets.xai_api_key ||
      dynamicSecrets.GROK_API_KEY ||
      dynamicSecrets.grok_api_key ||
      '';

    const spawnEnv = {
      ...process.env,
      // Ensure common CLI install dirs are visible (e.g. ~/.local/bin/grok)
      PATH: [
        path.join(os.homedir(), '.local', 'bin'),
        path.join(os.homedir(), '.grok', 'bin'),
        process.env.PATH || '',
      ].filter(Boolean).join(path.delimiter),
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || dynamicSecrets.google_api_key || googleApiKey,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || dynamicSecrets.google_api_key || googleApiKey,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || dynamicSecrets.anthropic_api_key,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || dynamicSecrets.openai_api_key,
      XAI_API_KEY: xaiKey || process.env.XAI_API_KEY,
      GROK_API_KEY: xaiKey || process.env.GROK_API_KEY,
      TAVILY_API_KEY: process.env.TAVILY_API_KEY || dynamicSecrets.tavily_api_key || tavilyApiKey,
      BRAVE_API_KEY: process.env.BRAVE_API_KEY || dynamicSecrets.brave_api_key || braveApiKey,
      EXA_API_KEY: process.env.EXA_API_KEY || dynamicSecrets.exa_api_key || exaApiKey,
      SERPER_API_KEY: process.env.SERPER_API_KEY || dynamicSecrets.serper_api_key || serperApiKey,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN || dynamicSecrets.github_token || githubToken,
    };

    logger.info('api', 'SPAWN_ENV GOOGLE_API_KEY length: ' + (spawnEnv.GOOGLE_API_KEY ? spawnEnv.GOOGLE_API_KEY.length : 0));
    const result = spawnSync(agent.binaryPath, args, {
      encoding: 'utf8',
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      env: spawnEnv,
      cwd: process.cwd(),
    });

    const softFailure = detectAgentFailure(result.stdout || '');

    if (result.status === 0 && !softFailure) {
      const output = result.stdout?.trim() || '';
      return parseAgentOutput(output);
    }

    if (softFailure) {
      // Exit code 0 but the payload says the run failed. Auth and model-config
      // failures are not transient, so record and move to the next agent
      // instead of burning the remaining retries on the same broken agent.
      logger.error({
        subsystem: 'runtime',
        message: `${agent.name} reported failure despite exit 0`,
        error: softFailure.slice(0, 500),
      });
      lastError = { agentName: agent.name, error: softFailure.slice(0, 500) };
      failedAgents.add(agent.name);
      continue;
    }

    const err = result.stderr || result.stdout || 'Unknown error';
    logger.error({
      subsystem: 'runtime',
      message: `${agent.name} failed (exit ${result.status})`,
      error: err.slice(0, 500),
    });
    lastError = { agentName: agent.name, error: err.slice(0, 500) };
    failedAgents.add(agent.name);
  }

  throw new Error(
    `All CLI agents failed (tried: ${[...failedAgents].join(', ') || 'none'}). ` +
    `Last error: ${lastError?.error || 'unknown'}`,
  );
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

/**
 * Parse JSON or text output from a CLI agent into plain text.
 */
/**
 * Control-frame `type` values in codex's `--json` event stream. None of them
 * carry the model's answer.
 */
const STREAM_CONTROL_TYPES = new Set([
  'thread.started', 'turn.started', 'turn.completed', 'turn.failed',
  'item.started', 'item.updated', 'item.completed', 'error',
]);

/**
 * Detects a failure the exit code did not report.
 *
 * CLI agents exit 0 on failed runs and describe the failure only in the
 * payload (verified 2026-08-01):
 *   claude → {"subtype":"success","is_error":true,"result":"Not logged in …"}
 *   codex  → {"type":"turn.failed","error":{"message":"…"}}
 *   agy    → {"status":"ERROR"|"CANCELED","error":"…"}
 *
 * Without this, `status === 0` accepts the error text as the model's answer —
 * e.g. "Not logged in · Please run /login" gets stored as a memory node.
 *
 * @param {string} output raw stdout
 * @returns {string|null} failure reason, or null if the run looks clean
 */
function detectAgentFailure(output) {
  if (!output) return null;
  for (const line of output.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    let parsed;
    try {
      parsed = JSON.parse(t);
    } catch {
      continue;
    }
    if (parsed.is_error === true) {
      return typeof parsed.result === 'string' ? parsed.result : 'is_error: true';
    }
    if (parsed.type === 'turn.failed' || parsed.type === 'error') {
      const msg = parsed.error?.message ?? parsed.message;
      return typeof msg === 'string' ? msg : String(parsed.type);
    }
    if (typeof parsed.status === 'string' && parsed.status.toUpperCase() !== 'SUCCESS') {
      return typeof parsed.error === 'string'
        ? `${parsed.status}: ${parsed.error}`
        : `status=${parsed.status}`;
    }
  }
  return null;
}

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
    // Not a single JSON document. It may still be a JSONL event stream —
    // codex `--json` emits one frame per line, so a whole-output JSON.parse
    // always throws and the raw stream used to be returned as the "answer".
    const answers = [];
    for (const line of output.split('\n')) {
      const t = line.trim();
      if (!t.startsWith('{')) continue;
      let frame;
      try {
        frame = JSON.parse(t);
      } catch {
        continue;
      }
      // codex: the reply is item.text of the `agent_message` item.
      if (frame.item?.type === 'agent_message' && typeof frame.item.text === 'string') {
        answers.push(frame.item.text);
        continue;
      }
      if (STREAM_CONTROL_TYPES.has(frame.type)) continue;
      for (const key of ['response', 'result', 'content', 'text']) {
        if (typeof frame[key] === 'string') {
          answers.push(frame[key]);
          break;
        }
      }
    }
    // Last message wins: earlier frames are partial or superseded.
    if (answers.length > 0) return answers[answers.length - 1];
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
