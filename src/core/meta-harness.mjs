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
    defaultFlags: ['--output-format', 'json', '--permission-mode', 'bypassPermissions', '--setting-sources', 'local', '--tools', '', '-p'],
    execType: 'flag_last',
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

      const flags = spec.defaultFlags.join(' ');
      const remoteCmd = spec.execType === 'pipe_stdin'
        ? `echo ${JSON.stringify(taskPrompt)} | ${spec.binary} ${flags}`
        : `${spec.binary} ${flags} ${JSON.stringify(taskPrompt)}`;
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
  const args = [...spec.defaultFlags];

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
        ...process.env,
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
