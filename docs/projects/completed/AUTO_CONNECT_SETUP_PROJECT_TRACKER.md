# Project Tracker: Zero-Config Auto-Connection Setup for All Users

This project tracker implements a fully automatic, robust zero-config bootstrap experience for all new installations (local and remote). It ensures that:
1. Every local installation automatically configures loopback (`http://localhost:3000`) instead of volatile LAN IPs.
2. Every bootstrap automatically provisions, hashes, and registers a valid Developer PAT token inside `keys.jsonl` and populates `brain.json` with it out-of-the-box.
3. The Chrome Extension download API (`/api/extension/download`) dynamically packages a perfectly functional, pre-authorized client for all users with zero configuration required.

## 📋 Status & Checklist

- [x] **Phase 1: Local Setup URL and PAT Auto-Generation (`src/cli/setup.mjs`)**
  - [x] Update `local` deploy target to set `brainUrl` to `http://localhost:3000` instead of a volatile IP.
  - [x] Automatically generate and register a valid PAT token locally via `issueKey` during setup, saving it to `brain.json`.

- [x] **Phase 2: Bootstrap Zero-Config PAT (`src/cli/init.mjs`)**
  - [x] Update standard bootstrap to create `brain.json` defaulting to `http://localhost:3000` and an auto-generated, registered PAT token if no remote brain URL is supplied.

- [x] **Phase 3: Verify and Recheck**
  - [x] Run full TS compiler checks.
  - [x] Run ESLint quality checks.
  - [x] Run all Vitest unit tests to ensure zero regressions.

- [x] **Phase 4: Heal Active User Context**
  - [x] Regenerate a valid PAT for the current user's workspace, registers it in `keys.jsonl`, and updates `brain.json` to point to `http://localhost:3000` with the valid key.

---

## 🛠️ Proposed Changes

### [Component Name] Setup & Initialization

#### [MODIFY] [init.mjs](file:///Users/greg/Github/total-recall/src/cli/init.mjs)
- Modify standard bootstrap in `init(args)`: if `opts.brain` is not provided and `brain.json` does not exist, automatically issue a local developer key and write a default `brain.json` mapping to `http://localhost:3000` and the new token.

#### [MODIFY] [setup.mjs](file:///Users/greg/Github/total-recall/src/cli/setup.mjs)
- For the `local` deploy target, set `brainUrl = 'http://localhost:3000'`.
- Automatically invoke `issueKey` programmatically to resolve `pat`, ensuring `storeBrainConfig` writes a valid local developer token.

---

## 🧪 Verification Plan

### Automated Verification
- Run Vitest suite: `npm run test`
- Run quality checks: `node .agent/skills/code-quality/scripts/start-here-ts.mjs` and `node .agent/skills/code-quality/scripts/start-here-lint.mjs`

### Manual Verification
- Confirm that `brain.json` contains a valid PAT token matching the active registered prefix in `keys.jsonl`.
- Verify the extension zip download retrieves the exact pre-configured localhost connection and PAT token.
