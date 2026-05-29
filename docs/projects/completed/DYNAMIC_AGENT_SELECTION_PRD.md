# Product Requirement Document (PRD): Dynamic CLI Agent Selection

## 🎯 Goal
Enable users to dynamically select their preferred CLI agent (`claude`, `gemini`, `codex`, `antigravity`) for all background reasoning and research tasks. Hard-coded defaults are completely eliminated. The runtime resolves the user's active choice across four tiered layers of overrides.

## 🔑 Core Features & Priority Tiers
The runtime must resolve the preferred agent in the following strict order of priority:

1. **CLI Argument Override** (Highest priority)
   * The user runs a command passing `--agent=claude` or `-a claude`.
   * The runtime immediately overrides all other settings to use `claude`.
2. **Environment Variable Override**
   * The environment contains `TR_CLI_AGENT=gemini`.
   * The runtime prioritizes `gemini`.
3. **Central Configuration Override** (`brain.json`)
   * The user's local `config/brain.json` has `preferred_agent: "claude"`.
   * The runtime prioritizes `claude`.
4. **SSSS Memory Preference Override** (Lowest priority)
   * The user has recorded an active SSSS preference in their vault: `"Use gemini as my preferred CLI agent."`
   * The runtime parses this from the compiled active memory surface (`INSTRUCTIONS.md`).

## 📋 Acceptance Criteria
- [ ] `loadRuntimeConfig()` dynamically resolves all four priority tiers and reorganizes the agent priority queue accordingly.
- [ ] The CLI agent chosen by the user is elevated to priority `0` in the registry list if it is enabled and exists on the system `$PATH`.
- [ ] No hardcoded fallbacks are used if a higher-priority user preference is configured.
- [ ] Passes continuous TS compilation checks, ESLint, and all 339 Vitest unit tests.
- [ ] New unit tests are added verifying each override tier explicitly.
