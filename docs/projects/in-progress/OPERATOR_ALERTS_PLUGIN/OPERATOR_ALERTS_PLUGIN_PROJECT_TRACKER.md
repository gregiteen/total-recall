# OPERATOR_ALERTS_PLUGIN — Project Tracker

> **Project Prefix**: `OPERATOR_ALERTS_PLUGIN`
> **Kanban State**: 🏗️ In Progress
> **Author**: Total Recall
> **Date**: 2026-09-28

---

## ✅ Phase 1: Core

- [x] `notify-core.mjs`: config merge, secret resolution, dedupe ledger, quiet hours, dry-run, log
- [x] Adapters: os, email (SMTP2GO), sms (Telnyx), webhook, github
- [x] Stubs: slack, discord, telegram, expo (report `stub`, send nothing)
- [x] `cli.mjs` and `plugin.json`: send, test, config, log

## ✅ Phase 2: Verification

- [x] `alerts.spec.mjs` 7 tests: dry-run, header-only key, dedupe, failure isolation, quiet hours, stubs, unknown channel, manifest
- [x] Installed into a clean temp project; `alerts config` and `alerts test` ran
- [x] Live proof (reference deployment): email accepted by SMTP2GO, SMS confirmed `delivered` by Telnyx, desktop alert shown
- [ ] Full suite and gates on the Mac mini with the plugin in the tree
- [ ] Released in the package

## ⏳ Phase 3: Channels and evidence

- [ ] Slack and Discord webhooks
- [ ] Telegram bot
- [ ] Expo push and receipts
- [ ] `alerts status <provider_id>` delivery lookup
- [ ] Web Push (VAPID) sender
- [ ] Voice via Telnyx AI Assistant (deferred)
- [ ] Skill `notify.mjs` delegates to the plugin

## ⏳ Phase 4: Testing and verification

- [ ] Each new adapter: mocked spec plus one live send to the operator
- [ ] Readiness walkthrough: fresh machine, `plugin install operator-alerts`, configure, `alerts test`, one real send

## Verification Log

- 2026-09-28: `npx vitest run plugins/operator-alerts` — 7 passed
- 2026-09-28: clean-project install, `alerts config`, `alerts test` — ok
