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
