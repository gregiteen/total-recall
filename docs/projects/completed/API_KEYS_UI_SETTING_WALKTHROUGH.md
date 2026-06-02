# Walkthrough: API Keys & Integrations UI Setting

I have successfully implemented the **API Keys & Integrations** visual control panel inside System Settings.

## Changes Made

### 1. Backend Endpoint Integration
- Updated GET and POST `/api/config-json` in [rest.mjs](file:///Users/greg/Github/total-recall/src/server/rest.mjs#L1371) to load and save allowed keys (`google_api_key`, `anthropic_api_key`, `openai_api_key`, `tavily_api_key`, `brave_api_key`, `exa_api_key`, `serper_api_key`, `github_token`) non-destructively in `.agent/secrets.enc`.

### 2. Dynamic Secret Parsing
- Modified `callLocalRuntime()` in [runtime.mjs](file:///Users/greg/Github/total-recall/src/core/runtime.mjs#L257) to dynamically read `.agent/secrets.enc` on every CLI dispatch. This allows keys updated in the UI to take effect immediately in `antigravity` and other CLI agents without restarting the backend server.
- Supported mapping `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` for Claude Code and Codex dispatches.

### 3. Non-Blocking Wrapper Fallbacks
- Updated [bin/antigravity.mjs](file:///Users/greg/Github/total-recall/bin/antigravity.mjs#L83) to warn instead of hard-crashing when `GOOGLE_API_KEY` is not present, allowing local developers to rely on GCP Application Default Credentials, GCLOUD_TOKEN headers, or native ambient environments.

### 4. UI Dashboard Configuration Card
- Added a visual control panel section in [SettingsPage.tsx](file:///Users/greg/Github/total-recall/frontend/src/pages/SettingsPage.tsx#L552) containing password-hidden input fields for all major model provider and search engine keys.
- Supported leaving keys (like Codex/OpenAI) empty for locally running desktop applications that do not require authentication.

---

## Verification & Testing
- ✅ **Vitest**: The entire Vitest suite (337 tests across 45 files) passed successfully.
- ✅ **Linting**: Verified with ESLint start-here script with 0 code quality errors.
- ✅ **TypeScript**: Checked both frontend and backend compilations cleanly.
- ✅ **Frontend build**: Ran production Vite compilation successfully (`tsc -b && vite build` completed in ~1 second).
- ✅ **Daemon Integration**: Safely restarted the server via `kill` signals, confirming the `daemon-loop` hot-reloads modular server changes flawlessly.
