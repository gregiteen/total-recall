# Implementation Plan — Selectable UI Deploy Location

This document details the complete design, code modifications, and verification plan for adding configurable dashboard deploy strategy selections to the Total Recall initialization wizard, server auto-startup mechanics, and status reporting system.

## 🎯 Goals

1. **Interactive Init Choice**: Let users pick how they want to access the dashboard (`local`, `quick-tunnel`, `named-tunnel`, or `custom-domain`) during `npx total-recall init`.
2. **Auto-Start on Server Boot**: Server automatically spawns and manages `cloudflared` tunnels at startup if configured, preventing ephemeral tunnel urls from breaking on restarts.
3. **Graceful Tunnel Lifecycle**: The server tracks the tunnel process via a PID file and kills the child process cleanly on SIGINT/SIGTERM shutdown.
4. **Interactive status CLI command**: Implement a comprehensive `status` CLI subcommand showing server health, active deploy modes, tunnel PIDs, and background daemon states.

---

## 🛠️ Proposed Changes

### 1. Init Command Refactoring
#### [MODIFY] [src/cli/init.mjs](file:///Users/greg/Github/total-recall/src/cli/init.mjs)
- Update `parseArgs(args)` to support:
  - `--deploy-mode <local | quick-tunnel | named-tunnel | custom-domain>`
  - `--domain <domain>`
  - `--tunnel-name <name>`
  - `--tunnel-credentials <path>`
- Insert a step after default password generation that prompts the user interactively (if stdin is a TTY and `--yes` / `--deploy-mode` are not set):
  ```
  How would you like to access your dashboard?
    1. Local only (http://localhost:3000)
    2. Cloudflare Quick Tunnel (random public URL, changes on restart)
    3. Cloudflare Named Tunnel (permanent subdomain, requires cloudflare auth)
    4. Custom domain (you provide the domain, uses Caddy for TLS)
  Choice [1]:
  ```
- If a Cloudflare tunnel mode is selected, check for the presence of the `cloudflared` binary. If missing, prompt macOS users to install via Homebrew, or provide fallback installation guidance.
- Refactor the trailing tunnel spawner inside `init()`:
  - If `local` or `custom-domain`: Skip spawning the quick tunnel.
  - If `quick-tunnel`: Spawn the tunnel immediately for the onboarding walkthrough and write the domain stats to `wizard-config.json`.
  - If `named-tunnel`: Save details to `wizard-config.json` and configure `tunnel-auto-start: true`.
- Normalize and print the correct onboarding/dashboard UI link at the end of the init log.

### 2. Server Auto-Start Tunnel
#### [MODIFY] [src/server/index.mjs](file:///Users/greg/Github/total-recall/src/server/index.mjs)
- Read `wizard-config.json` from the active `brainDir` on server startup.
- If `deploy-mode` is `quick-tunnel` or `named-tunnel` and `tunnel-auto-start` is true:
  - Scan `logs/cloudflared.pid` to check if a tunnel is already running to avoid duplicate processes.
  - Spawn `cloudflared` as a detached child process:
    - `quick-tunnel`: `cloudflared tunnel --url http://localhost:${PORT}`
    - `named-tunnel`: `cloudflared tunnel --credentials-file <credentials-path> run <tunnel-name>`
  - Save the PID to `logs/cloudflared.pid`.
  - For `quick-tunnel`, run an asynchronous poller to extract the `*.trycloudflare.com` URL from `logs/cloudflared.log` and update the active URLs in `wizard-config.json` on the fly.
- Register a hook in `handleShutdown` to send a clean `SIGTERM` to the active tunnel process group or PID, preventing orphaned background cloudflared processes.

### 3. Deploy Integration
#### [MODIFY] [src/cli/deploy.mjs](file:///Users/greg/Github/total-recall/src/cli/deploy.mjs)
- Align local reverse proxy deployment logic with the new `deploy-mode` keys. When `--domain` is supplied, ensure `deploy-mode: custom-domain` is written to `wizard-config.json`.

### 4. Comprehensive Status Subcommand
#### [MODIFY] [src/cli/status.mjs](file:///Users/greg/Github/total-recall/src/cli/status.mjs)
- Incorporate `wizard-config.json` options in the printed layout.
- Perform a live HTTP health check against `/health` (via local port or remote URL) to confirm if the server is online.
- Inspect the status of the background tunnel by checking if the process ID in `logs/cloudflared.pid` is alive.
- Check the status of the intelligence daemon using `getDaemonStatus()` and report it cleanly.
- Output this nicely in the plain-text status report, and include it under a structured `status` key in `--json` output.

---

## 🧪 Verification Plan

### Automated Tests
- Run `node .agent/skills/code-quality/scripts/start-here-ts.mjs` to ensure the codebase remains clean of TypeScript audit errors.
- Run `node .agent/skills/code-quality/scripts/start-here-lint.mjs` to run the ESLint linter audit.
- Run `npm test` to run the Vitest test suite.

### Manual Verification
1. Run `npx total-recall init` interactively (in a clean sandbox/directory) and check the prompt layout. Verify choosing `local` doesn't spawn any cloudflared tunnels, and choosing `quick-tunnel` automatically sets up and registers the tunnel.
2. Run `npm run dev` or start the server directly, verify it spawns a detached `cloudflared` tunnel, outputs the allocated URL, and gracefully terminates the tunnel process when stopping the server (SIGINT/SIGTERM).
3. Run `npx total-recall status` to check if it reports the correct active deploy mode, server status, tunnel PID, and daemon state.
