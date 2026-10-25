import { loadPluginModule as __loadOwnedPlugin } from './plugin-runtime.mjs';
import { z } from 'zod';
import path from 'path';
import os from 'os';
import fs from 'fs';

// ─── Robust PATH-Expansion for LaunchAgents & background processes ─────────────
try {
  const HOME = os.homedir();
  const commonPaths = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(HOME, '.local/bin'),
    path.join(HOME, '.nvm/versions/node/v24.12.0/bin'),
    path.join(HOME, '.npm-global/bin'),
    path.join(HOME, 'bin'),
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ];

  const nvmVersionsDir = path.join(HOME, '.nvm', 'versions', 'node');
  if (fs.existsSync(nvmVersionsDir)) {
    const versions = fs.readdirSync(nvmVersionsDir);
    for (const v of versions) {
      commonPaths.unshift(path.join(nvmVersionsDir, v, 'bin'));
    }
  }

  const activePaths = process.env.PATH ? process.env.PATH.split(path.delimiter) : [];
  const uniquePaths = Array.from(new Set([...activePaths, ...commonPaths])).filter(p => fs.existsSync(p));
  process.env.PATH = uniquePaths.join(path.delimiter);
} catch (e) {
  // Silent fallback
}


/**
 * Central Configuration Schema
 * Uses Zod to validate and parse environment variables into a strongly typed system.
 */
const configSchema = z.object({
  agentDir: z.preprocess(
    (val) => val || process.env._TR_TEST_AGENT_DIR || path.join(os.homedir(), '.agent'),
    z.string()
  ),
  cliAgent: z.string().optional(),
  cliModel: z.string().optional(),
  cliTimeout: z.preprocess((val) => val === undefined || val === '' ? 300 : parseInt(String(val), 10), z.number().int().default(300)),
  googleApiKey: z.string().optional(),
  openAiApiKey: z.string().optional(),
  openRouterApiKey: z.string().optional(),
  embedModel: z.string().default('gemini-embedding-2'),
  searxngBaseUrl: z.string().optional(),
  braveApiKey: z.string().optional(),
  braveSearchApiKey: z.string().optional(),
  exaApiKey: z.string().optional(),
  githubToken: z.string().optional(),
  serperApiKey: z.string().optional(),
  tavilyApiKey: z.string().optional(),
  dailySearchLimit: z.preprocess((val) => val === undefined || val === '' ? 50 : parseInt(String(val), 10), z.number().int().default(50)),
  researchCooldownMs: z.preprocess((val) => val === undefined || val === '' ? 3600000 : parseInt(String(val), 10), z.number().int().default(3600000)),
  nodeEnv: z.string().default('production'),
  port: z.preprocess((val) => val === undefined || val === '' ? 3000 : parseInt(String(val), 10), z.number().int().default(3000)),
  // No default: when HOST is unset, the server auto-binds to the mesh IP if
  // available (see resolveServerHost), falling back to loopback otherwise.
  host: z.string().optional(),
  display: z.string().optional(),
  totalRecallToken: z.string().optional(),
  trBrain: z.string().optional(),
  trPat: z.string().optional(),
  xdgConfigHome: z.preprocess(
    (val) => val || path.join(os.homedir(), '.config'),
    z.string()
  ),
  // Optional remote vault/content sync — env-driven only; no host-app or product defaults.
  remoteVaultSync: z.object({
    enabled: z.boolean().default(
      process.env.TR_REMOTE_VAULT_SYNC === '1' || process.env.TR_REMOTE_VAULT_SYNC === 'true',
    ),
    baseUrl: z.string().default(process.env.TR_REMOTE_VAULT_URL || ''),
    tokenRef: z.string().default(process.env.TR_REMOTE_VAULT_TOKEN_REF || 'TR_REMOTE_VAULT_TOKEN'),
    intervalMinutes: z.number().int().default(
      process.env.TR_REMOTE_VAULT_INTERVAL_MIN
        ? parseInt(process.env.TR_REMOTE_VAULT_INTERVAL_MIN, 10)
        : 30,
    ),
    vaultDir: z.string().default(
      process.env.TR_REMOTE_VAULT_DIR ||
        path.join(os.homedir(), '.agent', 'tenants', 'default', 'vault'),
    ),
    assetsDir: z.string().default(
      process.env.TR_REMOTE_ASSETS_DIR ||
        path.join(os.homedir(), '.agent', 'tenants', 'default', 'assets'),
    ),
    registryDir: z.string().default(process.env.TR_REMOTE_REGISTRY_DIR || ''),
    keepAssets: z.number().int().default(7),
  }).default({
    enabled: false,
    baseUrl: '',
    tokenRef: 'TR_REMOTE_VAULT_TOKEN',
    intervalMinutes: 30,
    vaultDir: path.join(os.homedir(), '.agent', 'tenants', 'default', 'vault'),
    assetsDir: path.join(os.homedir(), '.agent', 'tenants', 'default', 'assets'),
    registryDir: '',
    keepAssets: 7,
  }),
});

// Resolve brainDir paths
const resolvedAgentDir = process.env.AGENT_DIR || process.env._TR_TEST_AGENT_DIR || path.join(os.homedir(), '.agent');
const tempGlobalBrainDir = path.join(resolvedAgentDir, 'skills', 'total-recall');

// Auto-detect project brain if any
let projectBrainDir = null;
if (!process.env._TR_TEST_AGENT_DIR && !process.env.AGENT_DIR) {
  let dir = process.cwd();
  const homeDir = os.homedir();
  while (dir !== path.dirname(dir)) {
    if (dir === homeDir) break;
    const candidate = path.join(dir, '.agent', 'skills', 'total-recall');
    if (fs.existsSync(path.join(candidate, 'SKILL.md'))) {
      projectBrainDir = candidate;
      break;
    }
    dir = path.dirname(dir);
  }
}

// Runtime credential configuration is owned by the required auth plugin.
const { runtimeConfiguration } = await __loadOwnedPlugin('auth', 'configuration');
const credentialConfiguration = runtimeConfiguration({ brainDir: process.env.TR_SECRETS_BRAIN || tempGlobalBrainDir });

// Capture raw configuration values from process.env and secrets.enc
const rawConfig = {
  agentDir: process.env.AGENT_DIR,
  cliAgent: process.env.TR_CLI_AGENT,
  cliModel: process.env.TR_CLI_MODEL,
  cliTimeout: process.env.TR_CLI_TIMEOUT,
  googleApiKey: credentialConfiguration.googleApiKey,
  openAiApiKey: credentialConfiguration.openAiApiKey,
  openRouterApiKey: credentialConfiguration.openRouterApiKey,
  embedModel: process.env.TR_EMBED_MODEL,
  searxngBaseUrl: process.env.SEARXNG_BASE_URL,
  braveApiKey: credentialConfiguration.braveApiKey,
  braveSearchApiKey: credentialConfiguration.braveSearchApiKey,
  exaApiKey: credentialConfiguration.exaApiKey,
  githubToken: credentialConfiguration.githubToken,
  serperApiKey: credentialConfiguration.serperApiKey,
  tavilyApiKey: credentialConfiguration.tavilyApiKey,
  dailySearchLimit: process.env.TR_DAILY_SEARCH_LIMIT,
  researchCooldownMs: process.env.RESEARCH_COOLDOWN_MS,
  nodeEnv: process.env.NODE_ENV,
  port: process.env.PORT,
  host: process.env.HOST,
  display: process.env.DISPLAY,
  totalRecallToken: credentialConfiguration.totalRecallToken,
  trBrain: process.env.TR_BRAIN,
  trPat: credentialConfiguration.trPat,
  xdgConfigHome: process.env.XDG_CONFIG_HOME
};

let validated;
try {
  validated = configSchema.parse(rawConfig);
} catch (err) {
  const issues = err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
  throw new Error(`Configuration validation failed: ${issues}`);
}

const config = Object.freeze(validated);

export default config;

/**
 * brainDir — The Total Recall meta-skill directory.
 * This IS the user's brain. ALL user data (memory-vault, config, sessions,
 * scheduler, memory-derived, memory-inbox, logs, .backups) lives inside here.
 * Backup backs up this one directory and gets everything.
 */
export const brainDir = path.join(config.agentDir, 'skills', 'total-recall');

export const {
  agentDir,
  cliAgent,
  cliModel,
  cliTimeout,
  googleApiKey,
  openAiApiKey,
  openRouterApiKey,
  embedModel,
  searxngBaseUrl,
  braveApiKey,
  braveSearchApiKey,
  exaApiKey,
  githubToken,
  serperApiKey,
  tavilyApiKey,
  dailySearchLimit,
  researchCooldownMs,
  nodeEnv,
  port,
  host,
  display,
  totalRecallToken,
  trBrain,
  trPat,
  xdgConfigHome,
  remoteVaultSync,
} = config;

/**
 * The directory the compiled instruction surface belongs in.
 *
 * This is the WORKSPACE ROOT, which is not always the agent dir:
 *   global  -> <home>/.agent   (there the agent dir IS the workspace root)
 *   project -> <projectRoot>   (the repo root, NOT <repo>/.agent)
 *
 * Harnesses read `AGENTS.md`/`CLAUDE.md` at the workspace root, so a surface
 * written into `<repo>/.agent/` is never loaded -- yet the write succeeds and
 * the command reports success. Core modules must use this rather than
 * `agentDir`, and must not each re-derive the rule.
 */
export function surfaceDir() {
  if (process.env.AGENT_DIR || process.env._TR_TEST_AGENT_DIR) {
    return process.env.AGENT_DIR || process.env._TR_TEST_AGENT_DIR;
  }
  const project = detectProjectBrain();
  return project?.projectRoot || agentDir;
}

/** Absolute path of the canonical instruction surface for the active layer. */
export function instructionsFilePath() {
  return path.join(surfaceDir(), 'INSTRUCTIONS.md');
}

// ─── Layered Brain Resolution ───────────────────────────────────────────────

/**
 * Global brain — always at ~/.agent/skills/total-recall/
 * Holds identity: universal preferences, invariants, corrections, coding principles.
 */
export const globalAgentDir = resolvedAgentDir;
export const globalBrainDir = path.join(globalAgentDir, 'skills', 'total-recall');

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
  // Resolved live rather than from the module constant above: the agent dir can
  // be overridden per process, and the guard must follow the folder actually in
  // use.
  const agentDirLive = process.env.AGENT_DIR || process.env._TR_TEST_AGENT_DIR || path.join(homeDir, '.agent');
  const pluginsRoot = path.join(agentDirLive, 'skills', 'total-recall', 'plugins');
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

/**
 * Get both brain layers for the current context.
 *
 * @returns {{ global: { agentDir: string, brainDir: string, layer: 'global' },
 *             project: { agentDir: string, brainDir: string, projectRoot: string, layer: 'project' } | null }}
 */
export function getActiveBrains(targetPath = process.cwd()) {
  const global = { agentDir: globalAgentDir, brainDir: globalBrainDir, layer: 'global' };
  const project = detectProjectBrain(targetPath);
  return {
    global,
    project: project ? { ...project, layer: 'project' } : null,
  };
}

/**
 * Resolve which brain to use for a given operation.
 *
 * @param {'global' | 'project' | 'auto'} layer - Explicit layer choice or auto-detect
 * @param {string} [category] - Memory category (used for auto-detect heuristic)
 * @returns {{ agentDir: string, brainDir: string, layer: 'global' | 'project' }}
 */
export function resolveBrainLayer(layer = 'auto', category, targetPath = process.cwd()) {
  const { global, project } = getActiveBrains(targetPath);

  if (layer === 'global') return global;
  if (layer === 'project') {
    // The explicit root pins CLI operations, matching cli/agent-dir.mjs.
    // Never discover another workspace or silently use the home brain.
    if (process.env.AGENT_DIR) return { ...global, layer: 'project' };
    if (!project) {
      throw new Error('No project brain found. Run `npx total-recall init --project` to create one.');
    }
    return project;
  }

  // Auto-detect by category heuristic
  if (project && category) {
    const projectCategories = new Set(['fact', 'concept', 'pattern', 'anti-pattern', 'decision']);
    if (projectCategories.has(category)) return project;
  }

  // Default: project if exists, else global
  return global;
}
