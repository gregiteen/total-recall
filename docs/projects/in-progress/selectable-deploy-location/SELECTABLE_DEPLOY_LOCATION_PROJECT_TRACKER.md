# Selectable UI Deploy Location — Project Tracker

## ✅ Phase 0: Project Setup

- [x] Create PRD
- [x] Create Architecture doc
- [x] Create Dev Plan
- [x] Create Project Tracker
- [x] Research current init/deploy flow

---

## ⏳ Phase 1: Interactive Init Wizard Prompt

- [ ] Add `readline` interactive prompt to `init.mjs` after Step 3.6
- [ ] Present 4 deploy mode options: local, quick-tunnel, named-tunnel, custom-domain
- [ ] Persist choice as `deploy-mode` in `wizard-config.json`
- [ ] For `quick-tunnel`: check for cloudflared, offer to install via brew if missing
- [ ] For `named-tunnel`: prompt for tunnel name and credentials path
- [ ] For `custom-domain`: prompt for domain string
- [ ] Refactor existing tunnel spawner to respect the chosen mode

---

## ⏳ Phase 2: Server Auto-Start Tunnel

- [ ] Read `deploy-mode` from `wizard-config.json` on server boot
- [ ] If quick-tunnel + auto-start: spawn cloudflared as detached child
- [ ] Poll for URL and update wizard-config.json
- [ ] Log dashboard URL prominently in server output
- [ ] Handle tunnel process death gracefully

---

## ⏳ Phase 3: Status Command

- [ ] Create `src/cli/status.mjs`
- [ ] Show server health, deploy mode, dashboard URL, tunnel PID, daemon status
- [ ] Register `status` in `bin/total-recall.mjs`

---

## ⏳ Phase 4: Testing & Verification

- [ ] Unit tests for deploy mode prompt logic
- [ ] Integration test for server tunnel auto-start
- [ ] Test `npx total-recall status` output
- [ ] Manual: run init on clean machine, verify wizard
- [ ] Manual: restart server, verify tunnel auto-starts
- [ ] Run full test suite — all tests pass
