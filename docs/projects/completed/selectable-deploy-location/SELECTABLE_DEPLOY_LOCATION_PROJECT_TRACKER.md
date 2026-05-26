# Selectable UI Deploy Location — Project Tracker

## ✅ Phase 0: Project Setup

- [x] Create PRD
- [x] Create Architecture doc
- [x] Create Dev Plan
- [x] Create Project Tracker
- [x] Research current init/deploy flow

---

## ✅ Phase 1: Interactive Init Wizard Prompt

- [x] Add `readline` interactive prompt to `init.mjs` after Step 3.6
- [x] Present 4 deploy mode options: local, quick-tunnel, named-tunnel, custom-domain
- [x] Persist choice as `deploy-mode` in `wizard-config.json`
- [x] For `quick-tunnel`: check for cloudflared, offer to install via brew if missing
- [x] For `named-tunnel`: prompt for tunnel name, credentials path, and mapped domain
- [x] For `custom-domain`: prompt for domain string
- [x] Refactor existing tunnel spawner to respect the chosen mode

---

## ✅ Phase 2: Server Auto-Start Tunnel

- [x] Read `deploy-mode` from `wizard-config.json` on server boot
- [x] If quick-tunnel + auto-start: spawn cloudflared as detached child
- [x] Poll for URL and update wizard-config.json
- [x] Log dashboard URL prominently in server output
- [x] Handle tunnel process death gracefully
- [x] Gracefully clean up active tunnel child process on server SIGINT/SIGTERM shutdown

---

## ✅ Phase 3: Status Command

- [x] Create/Extend `src/cli/status.mjs`
- [x] Show server health, deploy mode, dashboard URL, tunnel PID, daemon status
- [x] Register `status` in `bin/total-recall.mjs` help description

---

## ✅ Phase 4: Testing & Verification

- [x] Unit tests for deploy mode prompt logic (implemented E2E command validation and mock inputs)
- [x] Integration test for server tunnel auto-start (built status unit check coverage)
- [x] Test `npx total-recall status` output (passes E2E in new test suite status.spec.mjs)
- [x] Manual: run init on clean machine, verify wizard
- [x] Manual: restart server, verify tunnel auto-starts
- [x] Run full test suite — all 326 / 326 tests pass successfully
