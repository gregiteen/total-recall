/** Strict authenticated runtime configuration. Local callers use local-config.mjs. */
import { z } from 'zod';
import localConfig, { globalBrainDir } from './local-config.mjs';
import { loadPluginModule } from './plugin-runtime.mjs';

export * from './local-config.mjs';

const optionalSecret = z.string().optional();
const schema = z.object({
  googleApiKey: optionalSecret,
  openAiApiKey: optionalSecret,
  openRouterApiKey: optionalSecret,
  braveApiKey: optionalSecret,
  braveSearchApiKey: optionalSecret,
  exaApiKey: optionalSecret,
  githubToken: optionalSecret,
  serperApiKey: optionalSecret,
  tavilyApiKey: optionalSecret,
  totalRecallToken: optionalSecret,
  trPat: optionalSecret,
});
const { runtimeConfiguration } = await loadPluginModule('auth', 'configuration');
const result = schema.safeParse(runtimeConfiguration({ brainDir: process.env.TR_SECRETS_BRAIN || globalBrainDir }));
if (!result.success) {
  const issues = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ');
  throw new Error(`Configuration validation failed: ${issues}`);
}

export const {
  googleApiKey, openAiApiKey, openRouterApiKey, braveApiKey, braveSearchApiKey, exaApiKey, githubToken,
  serperApiKey, tavilyApiKey, totalRecallToken, trPat,
} = result.data;

export default Object.freeze({ ...localConfig, ...result.data });
