import { loadSecretsSync, META_KEY } from './secrets-gateway.mjs';
const PROVIDERS = ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY', 'GROK_API_KEY', 'TAVILY_API_KEY', 'BRAVE_API_KEY', 'BRAVE_SEARCH_API_KEY', 'EXA_API_KEY', 'SERPER_API_KEY', 'GITHUB_TOKEN', 'OPENROUTER_API_KEY'];
/** Selected-store projection for harnesses; no session/password/master material. */
export function runtimeCredentials({ brainDir }) {
  if (!brainDir) throw new Error('Explicit auth store required');
  const stored = loadSecretsSync(brainDir), result = {};
  for (const key of PROVIDERS) {
    const item = stored[key] ?? stored[key.toLowerCase()];
    const value = typeof item === 'object' && item !== null ? item.value : item;
    if (typeof value === 'string' && value) result[key.toLowerCase()] = value;
  }
  delete result[META_KEY];
  return result;
}

/** Never inherit master/session/provider/password material from the host shell. */
export function sanitizeRuntimeEnvironment(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !/(?:API_KEY|TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE_KEY)$/i.test(name)));
}
