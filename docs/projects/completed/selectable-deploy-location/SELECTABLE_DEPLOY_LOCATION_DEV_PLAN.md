# Selectable UI Deploy Location — Development Plan

## Phase 1: Interactive Init Wizard Prompt

1. Add `readline` interactive prompt to `init.mjs` after Step 3.6
2. Present 4 deploy mode options: local, quick-tunnel, named-tunnel, custom-domain
3. Persist choice as `deploy-mode` in `wizard-config.json`
4. For `quick-tunnel`: check for cloudflared, offer to install via brew if missing
5. For `named-tunnel`: prompt for tunnel name and credentials path
6. For `custom-domain`: prompt for domain string
7. Refactor existing tunnel spawner to respect the chosen mode

## Phase 2: Server Auto-Start Tunnel

1. In `src/server/index.mjs`, after server bind, read `wizard-config.json`
2. If `deploy-mode` is `quick-tunnel` or `named-tunnel` and `tunnel-auto-start` is true:
   - Spawn `cloudflared` as a detached child process
   - Poll for the URL (reuse existing pattern from init.mjs)
   - Update `wizard-config.json` with the new URL
   - Log the dashboard URL prominently
3. If tunnel process dies, log a warning but don't crash the server

## Phase 3: Status Command

1. Create `src/cli/status.mjs` with:
   - Server health check (GET /health)
   - Deploy mode from wizard-config.json
   - Current dashboard URL
   - Tunnel process status (check PID file or ps)
   - Daemon status
2. Register in `bin/total-recall.mjs` command router

## Phase 4: Testing & Verification

1. Add unit tests for deploy mode prompt logic (mock readline)
2. Add integration test for server tunnel auto-start (mock cloudflared)
3. Test `npx total-recall status` output
4. Manual: run `npx total-recall init` on a clean machine, verify wizard prompt
5. Manual: restart server, verify tunnel auto-starts
