import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { HARNESS_SPECS, buildHarnessArgs, normalizeToolSelection, resolveHarnessEnv, shellQuote } from './meta-harness.mjs';
import { findBinaryInPath } from './runtime.mjs';
import { logger } from './logger.mjs';

function resolveStateDir() {
  const stateDir = path.join(os.homedir(), '.agent', 'state');
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  return stateDir;
}

function resolveLogDir() {
  const logDir = path.join(os.homedir(), '.agent', 'logs', 'agents');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

function getStateFilePath() {
  return path.join(resolveStateDir(), 'active-agents.json');
}

export function loadAgentState() {
  const stateFile = getStateFilePath();
  if (!fs.existsSync(stateFile)) return [];
  try {
    const raw = fs.readFileSync(stateFile, 'utf8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveAgentState(list) {
  const stateFile = getStateFilePath();
  try {
    fs.writeFileSync(stateFile, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    logger.error('Failed to save agent state:', err.message);
  }
}

export function isProcessRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * List all active/recent spawned agents, pruning defunct processes.
 */
export function listAgents() {
  const agents = loadAgentState();
  const updated = [];

  for (const a of agents) {
    if (a.remote) {
      updated.push(a);
      continue;
    }
    const alive = isProcessRunning(a.pid);
    if (alive) {
      updated.push({ ...a, status: 'running' });
    } else {
      updated.push({ ...a, status: a.status === 'running' ? 'stopped' : a.status });
    }
  }

  saveAgentState(updated);
  return updated;
}

/** Tool selection as recorded in the agent registry. */
function describeTools(tools) {
  const selection = normalizeToolSelection(tools);
  return selection === null ? 'default' : selection || 'none';
}

/**
 * The `total-recall agent spawn` command line that recreates a spawn on another
 * node. Every value is shell-quoted: the prompt, name and paths are caller data.
 */
export function buildRemoteSpawnCommand(harnessId, taskPrompt, options = {}) {
  const parts = ['total-recall', 'agent', 'spawn', harnessId, taskPrompt];
  if (options.name) parts.push('--name', options.name);
  if (options.cwd) parts.push('--cwd', options.cwd);
  if (options.tools !== undefined && options.tools !== null) {
    parts.push('--tools', Array.isArray(options.tools) ? options.tools.join(',') : String(options.tools));
  }
  if (options.settingSources) parts.push('--setting-sources', options.settingSources);
  if (options.detach === false) parts.push('--no-detach');
  parts.push('--json');
  return parts.map(shellQuote).join(' ');
}

/**
 * Spawn an agent harness headlessly or in background detach mode.
 *
 * A spawn runs a workflow, so the harness keeps its full built-in tool set and
 * normal settings unless the caller narrows them:
 *   options.tools           'none' | 'default' | 'Bash,Read' | ['Bash', 'Read']
 *   options.settingSources  e.g. 'local' or 'user,project'
 *   options.cwd             working directory (on the target node for --node)
 */
export async function spawnAgent(harnessId, taskPrompt, options = {}) {
  const spec = HARNESS_SPECS[harnessId];
  if (!spec) {
    throw new Error(`Unknown harness ID "${harnessId}". Available: ${Object.keys(HARNESS_SPECS).join(', ')}`);
  }
  // Validate the tool/settings selection before touching any node.
  const harnessArgs = buildHarnessArgs(spec, { tools: options.tools, settingSources: options.settingSources });

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
      const id = `agent-${harnessId}-${Date.now().toString(36)}`;
      const remoteCmd = buildRemoteSpawnCommand(harnessId, taskPrompt, options);
      const execResult = await execMeshCommand(options.node, remoteCmd, {
        vaultRoot: options.vaultRoot,
        timeoutMs: options.timeoutMs,
      });

      let remoteRecord = null;
      try {
        const jsonMatch = execResult.stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) remoteRecord = JSON.parse(jsonMatch[0]);
      } catch {}

      const record = {
        ...(remoteRecord || {}),
        id: remoteRecord?.id || id,
        node: options.node,
        remote: true,
        status: execResult.success ? (remoteRecord?.status || 'running') : 'failed',
        ...(execResult.success ? {} : { error: (execResult.stderr || execResult.stdout || '').slice(-2000) }),
        startedAt: remoteRecord?.startedAt || new Date().toISOString(),
        task: taskPrompt,
        harness: harnessId,
      };

      const current = loadAgentState();
      current.unshift(record);
      saveAgentState(current);
      return record;
    }
  }

  const binPath = findBinaryInPath(spec.binary);
  if (!binPath) {
    throw new Error(`Binary "${spec.binary}" for harness "${spec.name}" not found on PATH.`);
  }

  // A remote caller sends `~/…` unexpanded; it means this node's home.
  const requestedCwd = options.cwd && /^~(?=$|\/)/.test(options.cwd) ? path.join(os.homedir(), options.cwd.slice(1)) : options.cwd;
  const cwd = requestedCwd ? path.resolve(requestedCwd) : process.cwd();
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
    throw new Error(`Working directory does not exist: ${cwd}`);
  }
  const env = await resolveHarnessEnv(spec, process.env, options);

  const id = `agent-${harnessId}-${Date.now().toString(36)}`;
  const logDir = resolveLogDir();
  const logFile = path.join(logDir, `${id}.log`);
  const logFd = fs.openSync(logFile, 'a');

  const args = [...harnessArgs, taskPrompt];

  const child = spawn(binPath, args, {
    cwd,
    detached: options.detach !== false,
    stdio: options.detach !== false ? ['ignore', logFd, logFd] : 'pipe',
    env: {
      ...env,
      TR_AGENT_ID: id,
      TR_HARNESS: harnessId
    }
  });

  const record = {
    id,
    name: options.name || `${spec.name} Worker`,
    harness: harnessId,
    binary: binPath,
    pid: child.pid,
    task: taskPrompt,
    cwd,
    tools: describeTools(options.tools),
    logFile,
    startedAt: new Date().toISOString(),
    status: 'running',
    detached: options.detach !== false
  };

  const current = loadAgentState();
  current.unshift(record);
  saveAgentState(current);

  if (options.detach !== false) {
    child.unref();
    return record;
  }

  // Foreground execution
  return new Promise((resolve, reject) => {
    let output = '';
    let errOutput = '';

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      fs.writeSync(logFd, chunk);
    });

    child.stderr.on('data', (chunk) => {
      errOutput += chunk.toString();
      fs.writeSync(logFd, chunk);
    });

    child.on('close', (code) => {
      fs.closeSync(logFd);
      const list = loadAgentState();
      const item = list.find(x => x.id === id);
      if (item) {
        item.status = code === 0 ? 'completed' : 'failed';
        item.exitCode = code;
        item.endedAt = new Date().toISOString();
        saveAgentState(list);
      }
      resolve({
        ...record,
        status: code === 0 ? 'completed' : 'failed',
        exitCode: code,
        output: output.trim(),
        stderr: errOutput.trim()
      });
    });

    child.on('error', (err) => {
      try { fs.closeSync(logFd); } catch {}
      reject(err);
    });
  });
}

/**
 * Kill a running agent by ID or PID.
 */
export async function killAgent(idOrPid) {
  const list = loadAgentState();
  const target = list.find(a => a.id === idOrPid || String(a.pid) === String(idOrPid));

  if (!target) {
    throw new Error(`Agent "${idOrPid}" not found in active agent registry.`);
  }

  if (target.remote && target.node) {
    const { execMeshCommand } = await import('./mesh.mjs');
    const remoteCmd = `total-recall agent kill ${target.id}`;
    await execMeshCommand(target.node, remoteCmd);
    target.status = 'killed';
    target.endedAt = new Date().toISOString();
    saveAgentState(list);
    return { success: true, message: `Terminated remote agent ${target.id} on mesh node "${target.node}"` };
  }

  if (isProcessRunning(target.pid)) {
    try {
      process.kill(target.pid, 'SIGTERM');
      target.status = 'killed';
      target.endedAt = new Date().toISOString();
      saveAgentState(list);
      return { success: true, message: `Terminated agent ${target.id} (PID ${target.pid})` };
    } catch (err) {
      throw new Error(`Failed to kill process ${target.pid}: ${err.message}`);
    }
  } else {
    target.status = 'stopped';
    saveAgentState(list);
    return { success: true, message: `Agent ${target.id} was already stopped.` };
  }
}

/**
 * Get recent log output for an agent.
 */
export async function getAgentLogs(idOrPid, tailLines = 50) {
  const list = loadAgentState();
  const target = list.find(a => a.id === idOrPid || String(a.pid) === String(idOrPid));

  if (!target) {
    throw new Error(`Agent "${idOrPid}" not found.`);
  }

  if (target.remote && target.node) {
    const { execMeshCommand } = await import('./mesh.mjs');
    const remoteCmd = `total-recall agent logs ${target.id} --tail ${tailLines}`;
    const res = await execMeshCommand(target.node, remoteCmd);
    return res.stdout || res.stderr || '(No logs returned from remote node)';
  }

  if (!fs.existsSync(target.logFile)) {
    return '(No log file found for this agent)';
  }

  try {
    const raw = fs.readFileSync(target.logFile, 'utf8');
    const lines = raw.split('\n');
    return lines.slice(-tailLines).join('\n');
  } catch (err) {
    return `Error reading logs: ${err.message}`;
  }
}

