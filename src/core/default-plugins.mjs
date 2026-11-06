/** Default runtime foundation and routine agent-development tools. */
export const DEFAULT_PLUGIN_IDS = Object.freeze([
  'auth', 'ssss', 'mesh', 'openwiki', 'composable-cli', 'meta-harness',
  'code-quality', 'security', 'embeddings', 'git-sentinel',
]);

/** Required defaults that own additional installation payloads. */
export const REQUIRED_INSTALLATION_PLUGIN_IDS = Object.freeze(['ssss']);
