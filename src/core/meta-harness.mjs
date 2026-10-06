import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { findBinaryInPath } from './runtime.mjs';
import { logger } from './logger.mjs';

/**
 * Total Recall Meta Harness & Agent Management Layer
 * 
 * Orchestrates external developer agent harnesses (Antigravity, Claude Code,
 * Codex CLI, Gemini CLI) and general computer/OS execution using a shared
 * portable brain and unified SSSS memory substrate.
 */

// Supported external harnesses with their verified execution contracts
export const HARNESS_SPECS = {
  agy: {
    id: 'agy',
    name: 'Google Antigravity CLI',
    binary: 'agy',
    category: 'frontier_reasoning',
    defaultFlags: ['--output-format', 'json', '-p'],
    execType: 'flag_last',
    description: 'Frontier reasoning and research on Google AI Ultra plan.'
  },
  claude: {
    id: 'claude',
    name: 'Claude Code CLI',
    binary: 'claude',
    category: 'code_engineering',
    defaultFlags: ['--output-format', 'json', '--permission-mode', 'bypassPermissions', '-p'],
    execType: 'flag_last',
    // Options the harness accepts for the built-in tool set and settings layers.
    toolsFlag: '--tools',
    settingSourcesFlag: '--setting-sources',
    // Headless subscription auth (`claude setup-token`), read from the secret
    // store when the caller's environment does not already carry it.
    authSecrets: ['CLAUDE_CODE_OAUTH_TOKEN'],
    description: 'Deep codebase editing, refactoring, and Unix command execution.'
  },
  codex: {
    id: 'codex',
    name: 'OpenAI Codex CLI',
    binary: 'codex',
    category: 'code_synthesis',
    defaultFlags: ['exec', '--sandbox', 'workspace-write', '--json', '--skip-git-repo-check'],
    execType: 'subcommand',
    description: 'Autonomous program synthesis and sandbox execution.'
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini CLI',
    binary: 'gemini',
    category: 'fast_utility',
    defaultFlags: ['--sandbox=false', '--yolo', '-o', 'json'],
    execType: 'flag_last',
    description: 'High-speed utility completions and tool chaining.'
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama Local LLM',
    binary: 'ollama',
    category: 'local_neural',
    defaultFlags: ['run', process.env.TR_OLLAMA_MODEL || 'gemma4:latest'],
    execType: 'pipe_stdin',
    description: 'Local neural inference, offline reasoning, zero API cost.'
  }
};

/**
 * Normalise a caller's tool selection.
 *   undefined | null | 'default' | 'all'  -> null (the harness's full built-in set)
 *   'none' | ''                            -> '' (no tools)
 *   'Bash,Read' | ['Bash', 'Read']         -> 'Bash,Read'
 */
export function normalizeToolSelection(tools) {
  if (tools === undefined || tools === null) return null;
  const list = (Array.isArray(tools) ? tools : String(tools).split(','))
    .map((t) => String(t).trim())
    .filter(Boolean);
  if (list.length === 0 || (list.length === 1 && list[0] === 'none')) return '';
  if (list.length === 1 && (list[0] === 'default' || list[0] === 'all')) return null;
  return list.join(',');
}

/**
 * Argument vector for a harness, before the task prompt.
 * `tools` and `settingSources` are only accepted by harnesses that declare the
 * matching flag; asking another harness for them is an error, not a silent no-op.
 */
export function buildHarnessArgs(spec, { tools, settingSources } = {}) {
  const args = [...spec.defaultFlags];
  const extra = [];
  const selection = normalizeToolSelection(tools);
  if (selection !== null) {
    if (!spec.toolsFlag) throw new Error(`Harness "${spec.name}" does not support choosing its tool set.`);
    extra.push(spec.toolsFlag, selection);
  }
  if (settingSources) {
    if (!spec.settingSourcesFlag) throw new Error(`Harness "${spec.name}" does not support --setting-sources.`);
    extra.push(spec.settingSourcesFlag, String(settingSources));
  }
  if (!extra.length) return args;
  // Prompt-mode flags such as `-p` stay last so the task follows them.
  const last = args[args.length - 1];
  return spec.execType === 'flag_last' && last && last.startsWith('-')
    ? [...args.slice(0, -1), ...extra, last]
    : [...args, ...extra];
}

/** POSIX single-quote a value for a remote shell command line. */
export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

async function readStoreSecret(key) {
  const { getSecret, defaultBrainDir } = await import('./secrets-store.mjs');
  const res = await getSecret(defaultBrainDir(), key, { actor: 'agent-harness', action: 'harness-auth' });
  return res.found ? res.value : null;
}

/**
 * Environment for a harness process. Headless auth secrets the harness declares
 * (for Claude Code, CLAUDE_CODE_OAUTH_TOKEN) are filled from the secret store
 * when the base environment lacks them, so a session without a login keychain
 * (SSH, launchd, cron) can still authenticate. A store that cannot be opened is
 * not fatal: the harness falls back to its own login. Values are never logged.
 */
export async function resolveHarnessEnv(spec, baseEnv = process.env, { readSecret = readStoreSecret } = {}) {
  const env = { ...baseEnv };
  for (const key of spec.authSecrets || []) {
    if (env[key]) continue;
    try {
      const value = await readSecret(key);
      if (value) env[key] = value;
    } catch {
      // Store locked or missing; leave auth to the harness.
    }
  }
  return env;
}

/**
 * Detect all installed and operational harnesses on this computer.
 */
export function detectHarnesses() {
  const detected = [];

  for (const [id, spec] of Object.entries(HARNESS_SPECS)) {
    const binPath = findBinaryInPath(spec.binary);
    detected.push({
      id: spec.id,
      name: spec.name,
      category: spec.category,
      available: binPath !== null,
      binaryPath: binPath,
      description: spec.description,
      execType: spec.execType
    });
  }

  return detected;
}

/**
 * Headlessly dispatch a task to a specific harness.
 */
export async function dispatchTask(harnessId, taskPrompt, options = {}) {
  const spec = HARNESS_SPECS[harnessId];
  if (!spec) {
    throw new Error(`Unknown harness ID: "${harnessId}". Available: ${Object.keys(HARNESS_SPECS).join(', ')}`);
  }

  const timeoutMs = options.timeoutMs || 180000; // 3 min default
  // A dispatch is a single answer, not a workflow: tool-less and isolated from
  // user/project settings unless the caller asks otherwise.
  const harnessArgs = buildHarnessArgs(spec, {
    tools: options.tools !== undefined ? options.tools : (spec.toolsFlag ? 'none' : undefined),
    settingSources: options.settingSources !== undefined ? options.settingSources : (spec.settingSourcesFlag ? 'local' : undefined),
  });

  // Remote mesh execution branch
  if (options.node) {
    const { findMeshNode, getMeshSelf, execMeshCommand } = await import('./mesh.mjs');
    const targetNode = findMeshNode(options.node, options.vaultRoot);
    if (!targetNode) {
      throw new Error(`Target mesh node "${options.node}" not found in mesh topology.`);
    }
    const selfNode = getMeshSelf();
    const isSelf = targetNode.self || (selfNode && targetNode.ip === selfNode.ip);

    if (!isSelf) {
      logger.info({
        subsystem: 'meta-harness',
        message: `Dispatching to ${spec.name} remotely on mesh node "${options.node}" (${targetNode.ip})...`
      });

      const flags = harnessArgs.map(shellQuote).join(' ');
      const cd = options.cwd ? `cd ${shellQuote(options.cwd)} && ` : '';
      const remoteCmd = spec.execType === 'pipe_stdin'
        ? `${cd}printf '%s' ${shellQuote(taskPrompt)} | ${spec.binary} ${flags}`
        : `${cd}${spec.binary} ${flags} ${shellQuote(taskPrompt)}`;
      const execResult = await execMeshCommand(options.node, remoteCmd, {
        vaultRoot: options.vaultRoot,
        timeoutMs,
      });

      return {
        harnessId,
        harnessName: spec.name,
        node: options.node,
        remote: true,
        exitCode: execResult.exitCode,
        success: execResult.success,
        response: execResult.stdout,
        rawOutput: execResult.stdout,
        stderr: execResult.stderr,
      };
    }
  }

  const binPath = findBinaryInPath(spec.binary);
  if (!binPath) {
    throw new Error(`Harness "${spec.name}" (${spec.binary}) is not installed or not found on PATH.`);
  }

  const cwd = options.cwd || process.cwd();
  const args = [...harnessArgs];
  const env = await resolveHarnessEnv(spec, process.env, options);

  if (spec.execType === 'subcommand' || spec.execType === 'flag_last') {
    args.push(taskPrompt);
  }

  logger.info({
    subsystem: 'meta-harness',
    message: `Dispatching to ${spec.name} [${binPath}]...`
  });

  return new Promise((resolve, reject) => {
    const proc = spawn(binPath, args, {
      cwd,
      stdio: spec.execType === 'pipe_stdin' ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      env: {
        ...env,
        TR_HARNESS_DISPATCH: '1'
      }
    });

    if (spec.execType === 'pipe_stdin') {
      proc.stdin.write(taskPrompt);
      proc.stdin.end();
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      reject(new Error(`Harness "${spec.name}" timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;

      const raw = stdout.trim();
      let parsed = null;

      // Attempt parsing JSON / JSONL output
      try {
        if (raw.startsWith('{') && raw.endsWith('}')) {
          parsed = JSON.parse(raw);
        } else if (raw.includes('\n')) {
          // Check for JSONL stream (e.g. Codex)
          const lines = raw.split('\n').filter(Boolean);
          for (let i = lines.length - 1; i >= 0; i--) {
            try {
              const obj = JSON.parse(lines[i]);
              if (obj.item?.text) {
                parsed = { response: obj.item.text };
                break;
              }
            } catch {}
          }
        }
      } catch {}

      const responseText = parsed?.response || parsed?.text || parsed?.content || raw;

      resolve({
        harnessId,
        harnessName: spec.name,
        exitCode: code,
        success: code === 0,
        response: responseText,
        rawOutput: raw,
        stderr: stderr.trim()
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Multi-Harness Council: Run a task across multiple harnesses concurrently
 * and return comparative findings for consensus or deliberation.
 */
export async function runCouncil(taskPrompt, harnessIds = ['agy', 'claude', 'codex'], options = {}) {
  const availableHarnesses = detectHarnesses().filter(h => h.available && harnessIds.includes(h.id));
  
  if (availableHarnesses.length === 0) {
    throw new Error('No requested harnesses are available on this system.');
  }

  const dispatches = availableHarnesses.map(h => 
    dispatchTask(h.id, taskPrompt, options)
      .then(res => ({ ...res, error: null }))
      .catch(err => ({ harnessId: h.id, harnessName: h.name, success: false, error: err.message, response: null }))
  );

  const results = await Promise.all(dispatches);
  return {
    prompt: taskPrompt,
    participants: availableHarnesses.map(h => h.name),
    results
  };
}
