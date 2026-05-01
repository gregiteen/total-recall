/**
 * totalrecall.config.mjs — Per-Repo Configuration
 *
 * Drop this file in any repo root to configure Total Recall.
 * All values shown are defaults — only override what you need.
 */
export default {
  // Where memory data lives (relative to repo root)
  dataDir: '.agent',

  // System prompt file to inject behavioral surface into
  systemPromptFile: 'INSTRUCTIONS.md',

  // Section headers for in-place replacement
  activeContextHeader: '## ACTIVE CONTEXT',
  behavioralSurfaceHeader: '## DISTILLED MEMORY (SUBJECT STATES)',

  // IDE conversation watcher (for co-processor)
  // 'antigravity' | 'claude-code' | 'cursor' | 'cline' | 'generic'
  watcher: 'antigravity',

  // Ranking algorithm configuration
  ranking: {
    halfLife: {
      preference: 90,       // days — user tastes are durable
      'anti-pattern': 60,   // days — can become irrelevant
      pattern: 30,          // days — evolve with the codebase
      concept: 30,
      decision: 45,
      project: 14,          // days — context ages fastest
    },
    decayFloor: 0.1,        // minimum recency multiplier
    accessExponent: 0.5,    // (access_count + 1) ^ exponent
    surfaceCap: 30,         // max compiled rules in surface
    hotSlots: 5,            // max real-time steered rules
  },

  // Co-processor configuration (Phase 7)
  coprocessor: {
    enabled: true,
    intervalMs: 15000,
    analysisModel: 'gemini-2.5-flash',
    researchEnabled: true,
    notificationsEnabled: true,
  },

  // CLI agent configuration (Phase 4)
  agents: {
    archivist: { binary: 'gemini', model: 'gemini-2.5-flash' },
    synthesizer: { binary: 'claude', model: 'claude-sonnet-4-20250514' },
    factChecker: { binary: 'codex', model: 'o4-mini' },
  },
};
