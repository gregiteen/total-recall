/**
 * Shared `.agent/` directory resolver for CLI commands.
 *
 * Supports two brain layers:
 *   - Global brain:  ~/.agent/skills/total-recall/  (identity, universal rules)
 *   - Project brain: <cwd>/.agent/skills/total-recall/  (project-specific knowledge)
 *
 * The `--global` / `--project` flags let users explicitly target a layer.
 * Without flags, workspace-local wins over global when a project brain exists.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Parse --global / --project layer flags from CLI args.
 * Returns { layer: 'global' | 'project' | 'auto', remainingArgs: string[] }
 */
export function parseLayerFlag(args) {
  let layer = 'auto';
  const remainingArgs = [];
  for (const arg of args) {
    if (arg === '--global') layer = 'global';
    else if (arg === '--project') layer = 'project';
    else remainingArgs.push(arg);
  }
  return { layer, remainingArgs };
}

/** Global agent directory — always at ~/.agent/ */
export function getGlobalAgentDir() {
  return process.env.AGENT_DIR || path.join(os.homedir(), '.agent');
}

/** Global brain directory — ~/.agent/skills/total-recall/ */
export function getGlobalBrainDir() {
  return path.join(getGlobalAgentDir(), 'skills', 'total-recall');
}

/**
 * Detect a project-level brain by checking <cwd>/.agent/skills/total-recall/.
 * Returns { agentDir, brainDir } or null.
 */
export function detectProjectBrain() {
  if (process.env._TR_TEST_AGENT_DIR) return null;
  const cwd = process.cwd();
  const homeDir = os.homedir();
  if (cwd === homeDir) return null; // don't detect global as project
  const localAgentDir = path.join(cwd, '.agent');
  const localBrainDir = path.join(localAgentDir, 'skills', 'total-recall');
  if (fs.existsSync(path.join(localBrainDir, 'memory-vault'))) {
    return { agentDir: localAgentDir, brainDir: localBrainDir };
  }
  return null;
}

/**
 * Resolve agent dir based on explicit layer or auto-detect.
 * @param {'global' | 'project' | 'auto'} [layer='auto']
 */
export function resolveAgentDir(layer = 'auto') {
  if (process.env.AGENT_DIR) {
    return process.env.AGENT_DIR;
  }
  if (layer === 'global') return getGlobalAgentDir();
  if (layer === 'project') {
    const project = detectProjectBrain();
    if (!project) throw new Error('No project brain found. Run `npx total-recall init --project` to create one.');
    return project.agentDir;
  }
  // Auto: project-local wins if it exists
  const project = detectProjectBrain();
  return project ? project.agentDir : getGlobalAgentDir();
}

/**
 * Resolve the brain directory for a specific layer.
 * @param {'global' | 'project' | 'auto'} [layer='auto']
 */
export function resolveBrainDir(layer = 'auto') {
  return path.join(resolveAgentDir(layer), 'skills', 'total-recall');
}

/**
 * Get both brain layers for the current context.
 * @returns {{ global: { agentDir: string, brainDir: string }, project: { agentDir: string, brainDir: string } | null }}
 */
export function getBothBrains() {
  const globalAgentDir = getGlobalAgentDir();
  const globalBrainDir = getGlobalBrainDir();
  const project = detectProjectBrain();
  return {
    global: { agentDir: globalAgentDir, brainDir: globalBrainDir },
    project,
  };
}

/**
 * Determine the default layer for a memory category.
 * Always defaults to project brain. Use --global to explicitly target global.
 */
export function defaultLayerForCategory(_category) {
  return 'project';
}
