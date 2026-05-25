import { z } from 'zod';
import path from 'path';
import os from 'os';

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
  embedModel: z.string().default('text-embedding-004'),
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
  )
});

// Capture raw configuration values from process.env
const rawConfig = {
  agentDir: process.env.AGENT_DIR,
  cliAgent: process.env.TR_CLI_AGENT,
  cliModel: process.env.TR_CLI_MODEL,
  cliTimeout: process.env.TR_CLI_TIMEOUT,
  googleApiKey: process.env.GOOGLE_API_KEY,
  embedModel: process.env.TR_EMBED_MODEL,
  searxngBaseUrl: process.env.SEARXNG_BASE_URL,
  braveApiKey: process.env.BRAVE_API_KEY,
  braveSearchApiKey: process.env.BRAVE_SEARCH_API_KEY,
  exaApiKey: process.env.EXA_API_KEY,
  githubToken: process.env.GITHUB_TOKEN,
  serperApiKey: process.env.SERPER_API_KEY,
  tavilyApiKey: process.env.TAVILY_API_KEY,
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
  xdgConfigHome
} = config;

export function getEnvVar(name) {
  return process.env[name];
}

// ─── Layered Brain Resolution ───────────────────────────────────────────────

import fs from 'fs';

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
