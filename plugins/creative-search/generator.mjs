import { loadConfig } from './config.mjs';

// Compilation reads settings only; external health probes are explicit CLI work.
export async function generateContext(host) {
  try {
    const config = await loadConfig(host);
    return config.searxngUrl
      ? 'Creative Search: configured SearXNG metasearch. Query: total-recall csearch query <terms>. Health: total-recall csearch health.'
      : 'Creative Search: instance URL unset. Configure with total-recall csearch config set searxngUrl <URL>.';
  } catch {
    return 'Creative Search: configuration unavailable; inspect total-recall csearch config show.';
  }
}
