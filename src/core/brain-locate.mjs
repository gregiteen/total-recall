/**
 * Which project brain a folder uses. This is the only implementation, and it imports nothing but
 * Node, because the preflight gate asks on tool calls and the configuration module is too slow to
 * load there.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Detect a project-level brain by walking up from startDir looking for
 * .agent/skills/total-recall/. Skips the home directory (that's the global brain).
 *
 * @param {string} [startDir=process.cwd()] - Directory to start searching from
 * @returns {{ agentDir: string, brainDir: string, projectRoot: string } | null}
 */
export function detectProjectBrain(startDir = process.cwd()) {
  // In test mode, skip project detection
  if (process.env._TR_TEST_AGENT_DIR || process.env.AGENT_DIR) return null;

  let dir = startDir;
  const homeDir = os.homedir();
  const skillsRoot = path.join(homeDir, '.agent', 'skills');
  const globalSkills = safeRealpath(skillsRoot);
  const realStart = safeRealpath(startDir) || path.resolve(startDir);
  if (globalSkills && (realStart === globalSkills || realStart.startsWith(globalSkills + path.sep))) return null;
  const globalBrain = safeRealpath(path.join(skillsRoot, 'total-recall'));
  const pluginsRoot = path.join(skillsRoot, 'total-recall', 'plugins');
  // A shared plugin is either a directory inside the shared folder or a symlink
  // to its owner checkout. Working inside one — directly or through the link —
  // must never be treated as working in a project, or the plugin provisions a
  // complete nested brain into itself, one level deeper on every run. The owner
  // checkout's TOP LEVEL is the one exception: that is the plugin's repository,
  // registered and edited in its own right.
  const targets = pluginTargets(pluginsRoot);
  const reachedThroughPlugin = isInsideSharedFolder(startDir, pluginsRoot, targets);
  while (dir !== path.dirname(dir)) {
    if (dir === homeDir) break; // don't detect global as project
    if (dir === pluginsRoot || dir.startsWith(pluginsRoot + path.sep)) break;
    // A plugin's own checkout stops the walk unless it is a registered project.
    // The shared folder links every plugin to its owner repository, and those
    // repositories are registered and worked in directly, so reaching one is
    // only "a project" when the registry says it is.
    if (reachedThroughPlugin && targets.has(fs.existsSync(dir) ? safeRealpath(dir) : dir) && !isRegisteredProject(dir)) break;
    // Both `.agent` (canonical) and `.agents` (the upstream harness convention)
    // are supported. This function used to check only `.agent` while its former
    // sibling in src/cli/agent-dir.mjs checked both, so the two could disagree
    // about whether a project brain exists at all. It is now the single
    // implementation and the sibling delegates here.
    for (const name of ['.agent', '.agents']) {
      const candidate = path.join(dir, name, 'skills', 'total-recall');
      if (fs.existsSync(path.join(candidate, 'SKILL.md')) || fs.existsSync(path.join(candidate, 'memory-vault'))) {
        if (globalBrain && safeRealpath(candidate) === globalBrain) continue;
        return {
          agentDir: path.join(dir, name),
          // The project brain lives at the detected candidate — NEVER alias it to
          // globalBrainDir. This returned `globalBrainDir` once, so anything
          // routed through here silently operated on the GLOBAL vault while
          // reporting itself as the 'project' layer.
          brainDir: candidate,
          projectRoot: dir,
        };
      }
    }
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Whether a starting path belongs to a shared plugin rather than to a repository
 * in its own right.
 *
 * True when the caller's path lies beneath the shared folder literally, or when
 * it resolves into one of the folder's link targets — including the target root,
 * because a plugin that resolved its own directory asks from exactly there. The
 * registry is what separates that plugin's own repository from a plugin install;
 * this function only reports where the caller came from.
 */
function isInsideSharedFolder(startDir, pluginsRoot, targets) {
  const candidates = [startDir, safeRealpath(startDir)].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate === pluginsRoot || candidate.startsWith(pluginsRoot + path.sep)) return true;
    for (const target of targets) {
      if (candidate === target || candidate.startsWith(target + path.sep)) return true;
    }
  }
  return false;
}

/**
 * Whether this directory is a project the operator registered, read from the
 * brain registry. A registered repository is a real project even when it is also
 * installed as a shared plugin; anything else that is only reachable as a plugin
 * is a plugin. Unreadable registry metadata is treated as "not registered",
 * which keeps provisioning safe.
 */
function isRegisteredProject(dir) {
  try {
    const registry = path.join(
      process.env.AGENT_DIR || process.env._TR_TEST_AGENT_DIR || path.join(os.homedir(), '.agent'),
      'skills', 'total-recall', 'config', 'project-registry.json'
    );
    const rows = JSON.parse(fs.readFileSync(registry, 'utf8'));
    if (!Array.isArray(rows)) return false;
    const wanted = fs.existsSync(dir) ? safeRealpath(dir) : path.resolve(dir);
    return rows.some((row) => {
      const candidate = row?.path || row?.root;
      if (typeof candidate !== 'string' || !candidate) return false;
      return (fs.existsSync(candidate) ? safeRealpath(candidate) : path.resolve(candidate)) === wanted;
    });
  } catch { return false; }
}

function safeRealpath(target) {
  try { return fs.realpathSync(target); } catch { return null; }
}

/**
 * The real directories behind the shared plugin folder. Each entry is normally a
 * symlink to the plugin's owner checkout, which is where a nested brain would
 * actually be written once the link is resolved.
 */
function pluginTargets(pluginsRoot) {
  const targets = new Set();
  let entries = [];
  try { entries = fs.readdirSync(pluginsRoot, { withFileTypes: true }); } catch { return targets; }
  for (const entry of entries) {
    if (!entry.isSymbolicLink()) continue;
    try { targets.add(fs.realpathSync(path.join(pluginsRoot, entry.name))); } catch { /* broken link */ }
  }
  return targets;
}
