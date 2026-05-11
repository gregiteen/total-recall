/**
 * totalrecall.config.mjs — Per-Repo Configuration
 *
 * Drop this file in any repo root to configure Total Recall.
 * All values shown are defaults — only override what you need.
 */
export default {
  // Where memory data lives (relative to repo root)
  dataDir: '.agent',

  // ── SSSS 3-Tier paths (relative to repo root) ──────────────────────────────
  // vaultDir: '.agent/memory-vault',         // override to move vault elsewhere
  // skillsDir: '.agent/skills',              // or '.agents/skills' for dual layout
  // derivedDir: '.agent/memory-derived',     // JSONL indexes (rebuildable)
  // instructionsFile: 'INSTRUCTIONS.md',     // Tier 1 output

  // System prompt file to inject behavioral surface into (legacy + new)
  systemPromptFile: 'INSTRUCTIONS.md',

  // IDE watcher type — how the agent reads memory
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

  // Dream Cycle daemon configuration
  coprocessor: {
    enabled: true,
    schedule: '0 3 * * *',  // cron: 03:00 UTC nightly
    analysisModel: 'gemini-2.5-flash',
    researchEnabled: false,
    notificationsEnabled: false,
  },

  // CLI agent configuration
  agents: {
    archivist: { binary: 'gemini', model: 'gemini-2.5-pro' },
    synthesizer: { binary: 'gemini', model: 'gemini-2.5-pro' },
    factChecker: { binary: 'gemini', model: 'gemini-2.5-flash' },
  },
};

