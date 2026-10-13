import { importHostModule } from '../host-runtime.mjs';
const hostModule = await importHostModule('src/core/config.mjs');
export const { brainDir, globalAgentDir, globalBrainDir, detectProjectBrain, getActiveBrains, resolveBrainLayer, agentDir, cliAgent, cliModel, cliTimeout, googleApiKey, openAiApiKey, openRouterApiKey, embedModel, searxngBaseUrl, braveApiKey, braveSearchApiKey, exaApiKey, githubToken, serperApiKey, tavilyApiKey, dailySearchLimit, researchCooldownMs, nodeEnv, port, host, display, totalRecallToken, trBrain, trPat, xdgConfigHome, remoteVaultSync } = hostModule;
export default hostModule.default;
