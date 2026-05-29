# Development Plan: Dynamic CLI Agent Selection

## 🏗️ Design & Architecture
We will update `loadRuntimeConfig()` in `src/core/runtime.mjs` to resolve the preferred agent at config creation time. 

### Resolution Hierarchy
We resolve the preferred agent by checking these sources in order:
1. **CLI Argument**: Parse `process.argv` for `--agent=name` (e.g. `--agent=claude`).
2. **Environment Variable**: Check `process.env.TR_CLI_AGENT`.
3. **Central Configuration**: Try reading and parsing `~/.gemini/antigravity/config/brain.json` (or active `brainDir/config/brain.json`) for `preferred_agent`.
4. **SSSS Compiled Surface**: Search the active compiled memory surface (`INSTRUCTIONS.md` or `GEMINI.md`) for memory preferences matching `"preferred CLI agent is <agent>"`.

Once resolved, we elevate the matching agent's priority to `0` and re-sort the registry, ensuring that agent is selected for all subsequent `callLocalRuntime()` dispatches.

---

## 🛠️ Step-by-Step Implementation

### Step 1: Update `src/core/runtime.mjs`
- Modify `loadRuntimeConfig()`:
  - Add logic to find and parse `--agent` CLI parameter.
  - Add logic to safely read `brain.json` and parse `preferred_agent`.
  - Add logic to search the compiled surface `INSTRUCTIONS.md` for memory-injected preferences.
  - Dynamically elevate the matching agent's priority in the `config.agents` array and re-sort it.

### Step 2: Implement Unit Tests
- Add a new test suite inside `src/core/runtime.spec.mjs` or a new spec file to mock and verify:
  - CLI argument priority override.
  - `TR_CLI_AGENT` environment override.
  - `brain.json` preferred agent configuration.
  - `INSTRUCTIONS.md` memory surface preference match.

### Step 3: Verify and Build
- Run TypeScript quality compiler script.
- Run ESLint script.
- Run full Vitest suite.
