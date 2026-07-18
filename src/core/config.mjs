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
  sessionSecret: z.string().optional(),
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
const tempGlobalBrainDir = path.join(os.homedir(), '.agent', 'skills', 'total-recall');

// Auto-detect project brain if any
let projectBrainDir = null;
if (!process.env._TR_TEST_AGENT_DIR) {
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

// Load secrets from project or global
let secrets = {};
try {
  const pathsToCheck = [];
  // 1. Prioritize workspace-local root secrets
  pathsToCheck.push(path.join(process.cwd(), '.agent', 'secrets.enc'));
  if (resolvedAgentDir) {
    pathsToCheck.push(path.join(resolvedAgentDir, 'secrets.enc'));
  }
  // 2. Fallbacks
  if (projectBrainDir) {
    pathsToCheck.push(path.join(projectBrainDir, 'config', 'secrets.enc'));
  }
  pathsToCheck.push(path.join(tempGlobalBrainDir, 'config', 'secrets.enc'));
  pathsToCheck.push(path.join(resolvedAgentDir, 'skills', 'total-recall', 'config', 'secrets.enc'));
  for (const p of pathsToCheck) {
    if (fs.existsSync(p)) {
      try {
        const { loadSecretsSync } = await import('./secrets-store.mjs');
        // Actually, loadSecretsSync expects brainDir (e.g. /config/secrets.enc -> parent of config)
        // Let's pass the exact brainDir derived from p.
        // p is something like <brainDir>/config/secrets.enc or <brainDir>/secrets.enc
        const isConfigPath = p.includes(path.join('config', 'secrets.enc'));
        const brainDir = isConfigPath ? path.dirname(path.dirname(p)) : path.dirname(p);
        const parsed = loadSecretsSync(brainDir);
        if (Object.keys(parsed).length > 0) {
          secrets = parsed;
          break; // Found valid secrets!
        }
      } catch {}
    }
  }
} catch (e) {
  // Ignore
}

// Optional remote-vault token from secrets store (generic key only)
if (
  !process.env.TR_REMOTE_VAULT_TOKEN &&
  typeof secrets.remote_vault_token === 'string' &&
  secrets.remote_vault_token
) {
  process.env.TR_REMOTE_VAULT_TOKEN = secrets.remote_vault_token;
}

// Capture raw configuration values from process.env and secrets.enc
const rawConfig = {
  agentDir: process.env.AGENT_DIR,
  cliAgent: process.env.TR_CLI_AGENT,
  cliModel: process.env.TR_CLI_MODEL,
  cliTimeout: process.env.TR_CLI_TIMEOUT,
  googleApiKey: process.env.GOOGLE_API_KEY || secrets.google_api_key,
  embedModel: process.env.TR_EMBED_MODEL,
  searxngBaseUrl: process.env.SEARXNG_BASE_URL,
  braveApiKey: process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY || secrets.brave_api_key,
  braveSearchApiKey: process.env.BRAVE_SEARCH_API_KEY || secrets.brave_api_key,
  exaApiKey: process.env.EXA_API_KEY || secrets.exa_api_key,
  githubToken: process.env.GITHUB_TOKEN || secrets.github_token,
  serperApiKey: process.env.SERPER_API_KEY || secrets.serper_api_key,
  tavilyApiKey: process.env.TAVILY_API_KEY || secrets.tavily_api_key,
  dailySearchLimit: process.env.TR_DAILY_SEARCH_LIMIT,
  researchCooldownMs: process.env.RESEARCH_COOLDOWN_MS,
  sessionSecret: process.env.SESSION_SECRET,
  nodeEnv: process.env.NODE_ENV,
  port: process.env.PORT,
  host: process.env.HOST,
  display: process.env.DISPLAY,
  totalRecallToken: process.env.TOTAL_RECALL_TOKEN,
  trBrain: process.env.TR_BRAIN,
  trPat: process.env.TR_PAT,
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
  sessionSecret,
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

export function getEnvVar(name) {
  return process.env[name];
}

// ─── Layered Brain Resolution ───────────────────────────────────────────────

/**
 * Global brain — always at ~/.agent/skills/total-recall/
 * Holds identity: universal preferences, invariants, corrections, coding principles.
 */
export const globalAgentDir = path.join(os.homedir(), '.agent');
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
  if (process.env._TR_TEST_AGENT_DIR) return null;

  let dir = startDir;
  const homeDir = os.homedir();
  while (dir !== path.dirname(dir)) {
    if (dir === homeDir) break; // don't detect global as project
    const candidate = path.join(dir, '.agent', 'skills', 'total-recall');
    if (fs.existsSync(path.join(candidate, 'SKILL.md'))) {
      return {
        agentDir: path.join(dir, '.agent'),
        brainDir: globalBrainDir,
        projectRoot: dir,
      };
    }
    dir = path.dirname(dir);
  }
  return null;
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
