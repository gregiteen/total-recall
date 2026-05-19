# Total Recall — Session Handoff 2026-05-19 (updated)

**Branch:** `main` — all work committed and pushed to `gregiteen/total-recall`  
**Vast.ai instance:** ssh6.vast.ai:14194, instance 37044195, RTX 3060 12GB, $0.066/hr  
**SSH tunnel (run on Mac):** `ssh -f -N -o ServerAliveInterval=30 -L 3000:127.0.0.1:3000 -p 14194 root@ssh6.vast.ai`

---

## ✅ COMPLETED LAST SESSION (continuation): Additional features

### `src/server/api.mjs` — Self-aware API reference in system prompt
The AI now receives its own brain URL and a full REST API cheat sheet in its system prompt on every request. Uses `baseUrl(req)` so it works whether hosted locally or remotely.

### `src/cli/connect.mjs` — Slash commands written on `connect claude-code`
Running `npx total-recall connect claude-code --brain <url> --token <PAT>` now also writes 4 slash command stubs to `~/.claude/commands/`:
- `/memory` — search/manage memory nodes
- `/brain` — health check and status
- `/vault` — compile and inspect vault
- `/recall` — send a message to the brain

### `src/core/session-watcher.mjs` + `src/cli/relay.mjs` — Local relay daemon
Background daemon on user's Mac watches all 5 IDE session dirs (Claude Code, Codex, Antigravity, VS Code, Cursor) and ships new sessions to brain via `POST /api/sessions/ingest`. Install with `npx total-recall relay install`.

### `src/server/rest.mjs` — Sessions ingest endpoint
Accepts both raw file format (relay) and pre-parsed format. sha256 dedup to avoid re-ingesting unchanged sessions.

### `.remember/` plugin path bug fix
`save-session.sh` and `run-consolidation.sh` fixed to use `CLAUDE_PROJECT_DIR` env var instead of broken relative path derivation.

### `.claude/commands/` — Dev skill slash commands
All `.agent/skills/` are now accessible as slash commands: `/docs`, `/refactor`, `/code-quality`, `/push`, `/ssss`, `/test`, `/repo-expert`, `/skill`, etc.

---

## ✅ COMPLETED EARLIER: Setup Wizard (`src/cli/deploy-ui.mjs`)

The wizard is fully implemented as a 7-phase single-file HTML wizard (vanilla JS, no framework). `deploy.mjs --ui` now blocks on `waitForInstallOptions()` until the user clicks Install in Phase 1.

### What the wizard must include:
> "walkthrough, interaction with the different install options and integrations, obsidian set up, any api keys or auth, an overview of how it works, etc... everything"

### Wizard phases (single HTML file, vanilla JS, no framework):

**Phase 0 — Welcome / How It Works**
- What Total Recall is: private AI brain, SSSS file-based memory, no database
- Architecture: `~/.agent/` VFS → INSTRUCTIONS.md → injected into every chat → IDEs + chat apps connect via OpenAI-compatible API at `/v1/chat/completions`
- "Start Setup" button → Phase 1

**Phase 1 — Configure Install**
Form POSTs to `/api/start-install` which releases the `waitForInstallOptions()` promise in deploy.mjs:
- Domain (text input, e.g. `myname.duckdns.org`) — link to duckdns.org
- HTTPS method radio: DuckDNS (shows token field) / Cloudflare Tunnel (shows token field) / Local only
- Model radio: gemma4:26b 16GB recommended / gemma4:12b 8GB / Skip (already pulled)
- Skip checkboxes: SearXNG, Caddy, compile
- "Install Now" button → POST `/api/start-install` → transition to Phase 2

**Phase 2 — Live Install Progress**
- SSE stream from `/events` → progress bar + step log (this part already works)
- Auto-advances to Phase 3 on `type: 'done'` event

**Phase 3 — Auth: Generate Your API Key**
- Explanation of PATs and scopes
- Form: key name, scope preset (Full Access /* / Chat Only / Read Only)
- "Generate Key" → POST to brain's `POST /api/keys` (at `http://localhost:3000/api/keys`)
- Shows token in copyable box, "Save this — shown only once"
- Stores PAT in `window._wizardPat` for substitution in later phases
- "Continue" → Phase 4

**Phase 4 — Integrations (tabbed)**
Tabs: Claude Code | Cursor/Windsurf | UltraChat | MCP | Obsidian | Other IDEs

All code examples auto-substitute the domain from Phase 1 and PAT from Phase 3.

*Claude Code:*
```bash
npx total-recall connect claude-code --brain https://DOMAIN --token PAT
npx total-recall ingest --sources claude-code --watch
```
MCP config for Claude Code (`~/.claude/claude_desktop_config.json` or `.mcp.json`):
```json
{ "mcpServers": { "total-recall": { "type": "http", "url": "https://DOMAIN/mcp", "headers": { "Authorization": "Bearer PAT" } } } }
```

*Cursor / Windsurf:*
```bash
npx total-recall connect cursor --brain https://DOMAIN --token PAT
```
Cursor Settings → OpenAI Base URL: `https://DOMAIN/v1`, Key: PAT, Model: `total-recall`

*UltraChat:*
- Base URL: `https://DOMAIN/v1`
- Model: `total-recall/gemma4`
- API Key: PAT
- Auto-config: `https://DOMAIN/.well-known/total-recall.json`

*MCP:*
```json
{ "mcpServers": { "total-recall": { "type": "http", "url": "https://DOMAIN/mcp", "headers": { "Authorization": "Bearer PAT" } } } }
```
MCP tools: `read_memory`, `write_memory`, `search_memory`, `list_memory`, `run_sandbox`, `recompile_surface`

*Obsidian:*
- Plugin: Smart Connections or Text Generator → set base URL to `https://DOMAIN/v1`, key to PAT
- Vault sync: `npx total-recall deploy --backup-obsidian ~/path/to/ObsidianVault`

*Other IDEs (Aider, Codex, Gemini):*
```bash
npx total-recall connect aider --brain https://DOMAIN --token PAT
npx total-recall connect codex --brain https://DOMAIN --token PAT
```

**Phase 5 — API Reference**
Full endpoint table (fetched from `GET /api` on the brain), curl examples with domain/PAT substituted, auth header, scope list.

**Phase 6 — Done!**
- Your URLs (API, Dashboard, Health, MCP, Discovery manifest)
- Quick health check button → green/red
- "Open Dashboard" button

### Architecture change needed in deploy.mjs for `--ui` mode:
```js
// deploy.mjs --ui must WAIT for user to click Install before running steps
if (opts.ui) {
  const { startDeployUI, waitForInstallOptions, openBrowser } = await import('./deploy-ui.mjs');
  const uiUrl = await startDeployUI(opts.uiPort);
  openBrowser(uiUrl);
  const wizardOpts = await waitForInstallOptions(); // blocks until user clicks Install
  Object.assign(opts, wizardOpts); // merges domain, duckdnsToken, cloudflareToken, etc.
}
// then run deploy steps as normal
```

Add to deploy-ui.mjs server:
```js
let _resolveInstallOptions;
export const waitForInstallOptions = () => new Promise(r => { _resolveInstallOptions = r; });

app.post('/api/start-install', express.json(), (req, res) => {
  _resolveInstallOptions(req.body); // unblocks deploy.mjs
  res.json({ ok: true });
});

// For PAT generation (proxies to brain server on localhost:3000):
app.post('/api/generate-pat', express.json(), async (req, res) => {
  const r = await fetch('http://localhost:3000/api/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer local' },
    body: JSON.stringify(req.body)
  });
  res.status(r.status).json(await r.json());
});
```

---

## What Was Completed This Session

### 1. Fork-as-backup
- `src/cli/setup.mjs`: forks `gregiteen/total-recall` to user's GitHub, stores `github_token` in `secrets.enc`
- `src/cli/sync.mjs`: `--push` mode uses `git add -f` on vault files
- `.agent/skills/push/SKILL.md`: new skill (aliases: backup, sync, fork, github)
- `src/core/surface.mjs`: skill aliases support in routing table

### 2. Brain tools (`src/server/tools.mjs`)
Browser tools (Playwright, persistent `_browser`/`_page`): `search_web`, `browser_navigate`, `browser_click`, `browser_type`, `browser_get_content`, `browser_screenshot`, `browser_eval`

Computer use (xdotool + scrot + Xvfb): `computer_screenshot`, `computer_left_click`, `computer_double_click`, `computer_right_click`, `computer_mouse_move`, `computer_type`, `computer_key`, `computer_scroll` — auto-starts Xvfb on `:99` if no `$DISPLAY`

### 3. `deploy.mjs` fixes
- SearXNG: native Python pip to `/opt/searxng` (no Docker)
- Step 5.5: `npm install playwright`, `npx playwright install chromium`, `apt-get install xdotool scrot xvfb`
- `--ui` / `--ui-port` flags

### 4. Full REST API (`src/server/rest.mjs`) — NEW FILE, mounted in index.mjs
Memory CRUD, vault compile/status, keys CRUD, sessions CRUD, sandbox, config, `/v1/models`, `/.well-known/total-recall.json`, `GET /api` reference. All endpoints require Bearer PAT with appropriate scope.

### 5. Vast.ai Ollama setup
- Custom model: `FROM gemma4:26b` + `PARAMETER num_ctx 32768` (Modelfile at `/workspace/Modelfile`)
- **Do NOT add `PARAMETER num_gpu 999`** — causes CUDA OOM (12GB VRAM < 17GB model)
- Ollama auto-splits: ~10GB VRAM + ~7GB CPU RAM
- `/root/.agent/config/runtime.yml`: `model: total-recall`

### 6. `src/server/api.mjs` system prompt
Updated to document all browser + computer use tools with clear separation of browser tools vs desktop computer use tools.

---

## Server Commands

```bash
# Check if server is running
ssh -p 14194 root@ssh6.vast.ai "curl -s http://localhost:3000/health"

# Restart server
ssh -p 14194 root@ssh6.vast.ai "pkill -f 'node src/server' 2>/dev/null; cd /workspace/total-recall && nohup node src/server/index.mjs > /workspace/logs/server.log 2>&1 &"

# Pull latest code on Vast.ai
ssh -p 14194 root@ssh6.vast.ai "cd /workspace/total-recall && git pull"

# View server logs
ssh -p 14194 root@ssh6.vast.ai "tail -50 /workspace/logs/server.log"
```

---


## Project Tracker
`docs/projects/in-progress/sovereign-os-release-readiness/SOVEREIGN_OS_RELEASE_READINESS_PROJECT_TRACKER.md`

Phase 12 **COMPLETE**. All wizard items verified via browser E2E test 2026-05-19:
- [x] Rewrite deploy-ui.mjs as full wizard (all 7 phases implemented)
- [x] Wire deploy.mjs --ui to await wizard config
- [x] Test wizard end-to-end — all 7 phases pass, Copy buttons work, PAT generation works (placeholder when brain offline)

**Next priorities (Phase 13 pending):**
- [ ] Test full uninstall → reinstall end-to-end (all IDEs + UltraChat + Vast.ai)
- [ ] Delete GitHub fork and re-test fork creation workflow in `setup.mjs`
- [ ] UltraChat workspace generator not functional yet; SSSS data in Supabase (not local files) so relay has no local source to watch
