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
import { detectProjectBrain as detectProjectBrainInConfig } from '../core/config.mjs';

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
  return process.env.AGENT_DIR || process.env._TR_TEST_AGENT_DIR || path.join(os.homedir(), '.agent');
}

/** Global brain directory — ~/.agent/skills/total-recall/ */
export function getGlobalBrainDir() {
  return path.join(getGlobalAgentDir(), 'skills', 'total-recall');
}

/**
 * Detect a project-level brain by checking `<dir>/.agent/skills/total-recall/`
 * (and the `.agents` spelling). Returns `{ agentDir, brainDir, projectRoot }`.
 *
 * Delegates to core/config.mjs so there is exactly ONE implementation of the
 * rule. These were two independent copies that had already diverged: one
 * checked `.agent` only, ignored `AGENT_DIR`, and required `SKILL.md`, so they
 * could disagree about whether a project brain exists at all — and their
 * callers then disagreed about where the surface belongs.
 */
export function detectProjectBrain(startDir = process.cwd()) {
  if (process.env._TR_TEST_AGENT_DIR) return null;
  return detectProjectBrainInConfig(startDir);
}

/**
 * Resolve agent dir based on explicit layer or auto-detect.
 * @param {'global' | 'project' | 'auto'} [layer='auto']
 */
export function resolveAgentDir(layer = 'auto', targetPath = process.cwd()) {
  if (process.env.AGENT_DIR || process.env._TR_TEST_AGENT_DIR) {
    return process.env.AGENT_DIR || process.env._TR_TEST_AGENT_DIR;
  }
  if (layer === 'global') return getGlobalAgentDir();
  if (layer === 'project') {
    const project = detectProjectBrain(targetPath);
    if (!project) throw new Error('No project brain found. Run `npx total-recall init --project` to create one.');
    return project.agentDir;
  }
  // Auto: project-local wins if it exists
  const project = detectProjectBrain(targetPath);
  return project ? project.agentDir : getGlobalAgentDir();
}

/**
 * Resolve the brain directory for a specific layer.
 * @param {'global' | 'project' | 'auto'} [layer='auto']
 */
export function resolveBrainDir(layer = 'auto', targetPath = process.cwd()) {
  // Match resolveAgentDir: AGENT_DIR override pins the agent root → brain under it.
  if (process.env.AGENT_DIR || process.env._TR_TEST_AGENT_DIR) {
    return path.join(process.env.AGENT_DIR || process.env._TR_TEST_AGENT_DIR, 'skills', 'total-recall');
  }
  if (layer === 'global') return getGlobalBrainDir();
  if (layer === 'project') {
    const project = detectProjectBrain(targetPath);
    if (!project) {
      throw new Error('No project brain found. Run `npx total-recall init --project` to create one.');
    }
    return project.brainDir;
  }
  // Auto: project-local wins if a project brain exists
  const project = detectProjectBrain(targetPath);
  return project ? project.brainDir : getGlobalBrainDir();
}

/**
 * Get both brain layers for the current context.
 * @returns {{ global: { agentDir: string, brainDir: string }, project: { agentDir: string, brainDir: string } | null }}
 */
export function getBothBrains(targetPath = process.cwd()) {
  const globalAgentDir = getGlobalAgentDir();
  const globalBrainDir = getGlobalBrainDir();
  const project = detectProjectBrain(targetPath);
  return {
    global: { agentDir: globalAgentDir, brainDir: globalBrainDir },
    project,
  };
}

/**
 * The directory an instruction surface belongs in, which is NOT always the
 * agent dir. Harnesses read `AGENTS.md`/`CLAUDE.md` at the workspace root:
 *   global  -> <home>/.agent      (the agent dir IS the workspace root)
 *   project -> <projectRoot>      (the repo root, NOT <repo>/.agent)
 *
 * Writing a project surface into `<repo>/.agent/` puts it where no harness
 * looks, while the compile still reports success and "0 drift". Every caller
 * that writes INSTRUCTIONS.md or client shims must use this instead of
 * `resolveAgentDir`, which names the brain's own directory.
 */
export function resolveSurfaceDir(layer = 'auto', targetPath = process.cwd()) {
  if (process.env.AGENT_DIR || process.env._TR_TEST_AGENT_DIR) {
    return process.env.AGENT_DIR || process.env._TR_TEST_AGENT_DIR;
  }
  if (layer === 'global') return getGlobalAgentDir();
  const project = detectProjectBrain(targetPath);
  if (!project) {
    if (layer === 'project') throw new Error('No project brain found. Run `npx total-recall init --project` to create one.');
    return getGlobalAgentDir();
  }
  return project.projectRoot || project.agentDir;
}

/**
 * The path of the canonical instruction surface for a layer.
 */
export function resolveInstructionsFile(layer = 'auto', targetPath = process.cwd()) {
  return path.join(resolveSurfaceDir(layer, targetPath), 'INSTRUCTIONS.md');
}

/**
 * Determine the default layer for a memory category.
 * Always defaults to project brain. Use --global to explicitly target global.
 */
export function defaultLayerForCategory(_category) {
  return 'project';
}
