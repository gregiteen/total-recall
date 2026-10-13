import { loadSecretsSync } from './secrets-gateway.mjs';
/** One explicitly selected auth store; decryption failures propagate. */
export function runtimeConfiguration({ brainDir }) {
  if (!brainDir) throw new Error('Select an auth store');
  const secrets = loadSecretsSync(brainDir);
  return {
    googleApiKey: secrets.GOOGLE_API_KEY,
    openAiApiKey: secrets.OPENAI_API_KEY,
    openRouterApiKey: secrets.OPENROUTER_API_KEY,
    braveApiKey: secrets.BRAVE_SEARCH_API_KEY,
    braveSearchApiKey: secrets.BRAVE_SEARCH_API_KEY,
    exaApiKey: secrets.EXA_API_KEY,
    githubToken: secrets.GITHUB_TOKEN,
    serperApiKey: secrets.SERPER_API_KEY,
    tavilyApiKey: secrets.TAVILY_API_KEY,
    totalRecallToken: secrets.TOTAL_RECALL_TOKEN,
    trPat: secrets.TR_PAT,
  };
}
