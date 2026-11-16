/** Human-authored labels. Never derived from a router response. */
export const ROUTER_CORPUS = {
  schemaVersion: 1, id: 'metaharness-router-efficiency', version: '1.1.0',
  cases: [
    { id: 'credentials', intent: 'Inspect encrypted auth credentials', groups: [['plugin:auth:status', 'plugin:auth:secret']], kind: 'ambiguous' },
    { id: 'models', intent: 'List live AI models with their pricing', groups: [['plugin:ai-models:models']], kind: 'semantic' },
    { id: 'quota', intent: 'Show coding harness quotas and readiness', groups: [['plugin:meta-harness:quota']], kind: 'semantic' },
    { id: 'catalog', intent: 'Discover all installed plugin operations', groups: [['core:plugin', 'plugin:composable-cli:library']], kind: 'ambiguous' },
    { id: 'two-steps', intent: 'List live AI model prices then inspect coding harness quota', groups: [['plugin:ai-models:models'], ['plugin:meta-harness:quota']], kind: 'multi-step' },
    { id: 'absent', intent: 'Teleport a physical bicycle to Mars', groups: [], kind: 'unavailable' },
    { id: 'underspecified', intent: 'Do the thing', groups: [], kind: 'ambiguous' },
    { id: 'frontier', layer: 'harness', intent: 'Audit authentication security architecture across all modules', expected: ['codex', 'claude'], scenario: 'ready', kind: 'frontier' },
    { id: 'inactive', layer: 'harness', intent: 'Audit authentication security architecture', expected: [], scenario: 'inactive', kind: 'inactive' },
    { id: 'quota-wall', layer: 'harness', intent: 'Audit authentication security architecture', expected: [], scenario: 'quota', kind: 'quota' },
  ].map(c => ({ layer: 'capability', surface: 'cli', provenance: 'independent:operator-task-and-declared-contracts', ...c })),
};
