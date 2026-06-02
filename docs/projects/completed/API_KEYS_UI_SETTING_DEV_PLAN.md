# Development Plan: API Keys & Integrations UI Setting

## 🏗️ Design & Architecture
We will create a dedicated interface section under the System Settings page in the React dashboard to configure API keys (Google/Gemini, Tavily, Brave, Exa, Serper, and GitHub). 

These keys will be saved securely to `.agent/secrets.enc` in plain JSON, and will be read dynamically by the server runtime on each LLM dispatch, ensuring changes take effect instantly without restarting the server.

### Configuration Storage
- Secrets are stored in `secrets.enc` inside the `.agent` directory.
- We will update the server config endpoints to load and save these key values.

### Dynamic Runtime Key Retrieval
To avoid caching issues with ES module imports in `src/core/config.mjs`, `src/core/runtime.mjs` will dynamically read `secrets.enc` on every dispatch to populate the environment variables `GOOGLE_API_KEY` and `GEMINI_API_KEY` for spawned CLI processes.

---

## 🛠️ Step-by-Step Implementation

### Step 1: Update GET and POST `/api/config-json` in `src/server/rest.mjs`
- **GET**: Read `.agent/secrets.enc` and include the API keys (`google_api_key`, `anthropic_api_key`, `openai_api_key`, `tavily_api_key`, `brave_api_key`, `exa_api_key`, `serper_api_key`, `github_token`) in the response under a `secrets` object.
- **POST**: Extract the `secrets` object, load existing entries from `.agent/secrets.enc` non-destructively, and merge the updated keys (`google_api_key`, `anthropic_api_key`, `openai_api_key`, `tavily_api_key`, `brave_api_key`, `exa_api_key`, `serper_api_key`, `github_token`) back into the file.

### Step 2: Update `src/core/runtime.mjs`
- Inside `callLocalRuntime()`, dynamically check and read `secrets.enc` on each invocation.
- Add these keys (including `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`) to the `env` object passed to `spawnSync` as fallbacks if they are not already in `process.env`.

### Step 3: Update `frontend/src/pages/SettingsPage.tsx`
- Add a new visual card "API Keys & Integrations" to the Control Panel view.
- Render input fields (password-style with togglable visibility) for each key:
  - Google Gemini API Key
  - Anthropic API Key
  - OpenAI API Key
  - Tavily API Key
  - Brave Search API Key
  - Exa API Key
  - Serper API Key
  - GitHub Token
- Bind these fields to the `secrets` property of `configData`.
- Update `handleSaveVisual` and validation logic to correctly send the updated `secrets` payload back to the backend.

### Step 4: Verify and Build
- Run linting and TypeScript checks.
- Test the key storage by saving a key in the UI and checking if the CLI wrapper receives it.
