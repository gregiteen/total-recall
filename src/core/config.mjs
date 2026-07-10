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
  host: z.string().default('127.0.0.1'),
  display: z.string().optional(),
  totalRecallToken: z.string().optional(),
  trBrain: z.string().optional(),
  trPat: z.string().optional(),
  xdgConfigHome: z.preprocess(
    (val) => val || path.join(os.homedir(), '.config'),
    z.string()
  ),
  portfolioSync: z.object({
    enabled: z.boolean().default(true),
    baseUrl: z.string().default(process.env.PORTFOLIO_SYNC_URL || 'https://gregiteen.xyz'),
    tokenRef: z.string().default('PORTFOLIO_ADMIN_TOKEN'),
    intervalMinutes: z.number().int().default(30),
    vaultDir: z.string().default(path.join(os.homedir(), '.agent', 'tenants', 'portfolio-site', 'vault')),
    assetsDir: z.string().default(path.join(os.homedir(), '.agent', 'tenants', 'portfolio-site', 'assets')),
    keepAssets: z.number().int().default(7)
  }).default({
    enabled: true,
    baseUrl: process.env.PORTFOLIO_SYNC_URL || 'https://gregiteen.xyz',
    tokenRef: 'PORTFOLIO_ADMIN_TOKEN',
    intervalMinutes: 30,
    vaultDir: path.join(os.homedir(), '.agent', 'tenants', 'portfolio-site', 'vault'),
    assetsDir: path.join(os.homedir(), '.agent', 'tenants', 'portfolio-site', 'assets'),
    keepAssets: 7
  })
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
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8') || '{}');
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

// Tenant integrations keep their credentials in the same local secret store as
// provider keys. Expose this one only to the running process: the portfolio
// sync client reads it by configured reference and it is never returned by an
// HTTP route or written into repository configuration.
if (!process.env.PORTFOLIO_ADMIN_TOKEN && typeof secrets.portfolio_admin_token === 'string' && secrets.portfolio_admin_token) {
  process.env.PORTFOLIO_ADMIN_TOKEN = secrets.portfolio_admin_token;
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
  portfolioSync
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
        brainDir: candidate,
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
export function getActiveBrains() {
  const global = { agentDir: globalAgentDir, brainDir: globalBrainDir, layer: 'global' };
  const project = detectProjectBrain();
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
export function resolveBrainLayer(layer = 'auto', category) {
  const { global, project } = getActiveBrains();

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
  return project || global;
}
