import { z } from 'zod';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { detectProjectBrain } from './brain-locate.mjs';

export { detectProjectBrain };

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
  embedModel: z.string().default('gemini-embedding-2'),
  searxngBaseUrl: z.string().optional(),
  dailySearchLimit: z.preprocess((val) => val === undefined || val === '' ? 50 : parseInt(String(val), 10), z.number().int().default(50)),
  researchCooldownMs: z.preprocess((val) => val === undefined || val === '' ? 3600000 : parseInt(String(val), 10), z.number().int().default(3600000)),
  nodeEnv: z.string().default('production'),
  port: z.preprocess((val) => val === undefined || val === '' ? 3000 : parseInt(String(val), 10), z.number().int().default(3000)),
  // No default: when HOST is unset, the server auto-binds to the mesh IP if
  // available (see resolveServerHost), falling back to loopback otherwise.
  host: z.string().optional(),
  display: z.string().optional(),
  trBrain: z.string().optional(),
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

// Local configuration must remain usable without unlocking Auth.
const rawConfig = {
  agentDir: process.env.AGENT_DIR,
  cliAgent: process.env.TR_CLI_AGENT,
  cliModel: process.env.TR_CLI_MODEL,
  cliTimeout: process.env.TR_CLI_TIMEOUT,
  embedModel: process.env.TR_EMBED_MODEL,
  searxngBaseUrl: process.env.SEARXNG_BASE_URL,
  dailySearchLimit: process.env.TR_DAILY_SEARCH_LIMIT,
  researchCooldownMs: process.env.RESEARCH_COOLDOWN_MS,
  nodeEnv: process.env.NODE_ENV,
  port: process.env.PORT,
  host: process.env.HOST,
  display: process.env.DISPLAY,
  trBrain: process.env.TR_BRAIN,
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
  embedModel,
  searxngBaseUrl,
  dailySearchLimit,
  researchCooldownMs,
  nodeEnv,
  port,
  host,
  display,
  trBrain,
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
