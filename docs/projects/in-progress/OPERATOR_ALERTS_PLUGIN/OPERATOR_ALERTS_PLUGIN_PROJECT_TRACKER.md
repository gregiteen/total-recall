---
type: project_document
title: OPERATOR_ALERTS_PLUGIN — Project Tracker
description: Project Tracker with current implementation reconciliation and correction acceptance.
timestamp: 2026-09-30T16:30:00Z
tags: [project-management, plugins, corrections]
---

# OPERATOR_ALERTS_PLUGIN — Project Tracker

> **Project Prefix**: `OPERATOR_ALERTS_PLUGIN`
> **Kanban State**: 🏗️ In Progress
> **Author**: Total Recall
> **Date**: 2026-09-28

---

## ⏳ Phase 1: Core

- [x] `notify-core.mjs`: config merge, secret resolution, dedupe ledger, quiet hours, dry-run, log
- [x] Adapters: os, email (SMTP2GO), sms (Telnyx), webhook, github
- [ ] Replace/remove shipped stubs from operational channels (historical stub implementation retained as context; no readiness credit)
- [x] `cli.mjs` and `plugin.json`: send, test, config, log

## ⏳ Phase 2: Verification

- [x] `alerts.spec.mjs` 7 tests: dry-run, header-only key, dedupe, failure isolation, quiet hours, stubs, unknown channel, manifest
- [x] Installed into a clean temp project; `alerts config` and `alerts test` ran
- [x] Live proof (reference deployment): email accepted by SMTP2GO, SMS confirmed `delivered` by Telnyx, desktop alert shown
- [ ] Full suite and gates on the Mac mini with the plugin in the tree
- [ ] Released in the package

## ⏳ Phase 3: Channels and evidence

- [ ] Slack webhook configuration and installed send behavior (adapter source exists; PIC-006 remains)
- [ ] Discord webhook configuration and installed send behavior (adapter source exists; PIC-006 remains)
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


## 2026-09-30 current-state reconciliation

This correction section supersedes unsupported readiness claims above; historical verification records remain intact. Static review covers the current `plugins/operator-alerts/notify-core.mjs`, `cli.mjs`, manifest and test source. No gates, providers or live sends ran during this documentation pass. Current readiness audit: **In progress — exact-tree sanctioned baseline and installed/provider verification outstanding**. Earlier reference-deployment delivery claims do not prove the current tree or every channel.

OS/email/SMS/webhook/GitHub have adapter source. Slack and Discord now have webhook adapter source, but their literal URL configuration is broken. Telegram and Expo remain explicit stubs. CLI success currently excludes only `failed`, allowing `stub` results to exit successfully. Durable event/deduplication state remains raw JSONL, not canonical SSSS operations. Therefore the plugin is **not verified ready**.

Corrections are coordinated by the [central correction tracker](../PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md). Owner for PIC-006/007/008/022: Operator Alerts implementation and tests in Total Recall; host SSSS adapter/registry ownership: Total Recall kernel interface. No external repository edits or release are part of this documentation reconciliation.

### ⏳ Phase 0: Current audit evidence

- [x] Inspect current dispatch/CLI/state source and register four confirmed discrepancies.
- [ ] Complete exact-tree sanctioned baseline, installed-host and provider acceptance audit; do not equate historical live proof with current readiness.

### ⏳ Correction tasks

- [ ] **PIC-006** — align Slack/Discord URL resolution and configuration/help; test literal/reference/missing/invalid configuration and provider failures.
- [ ] **PIC-007** — implement or remove Telegram/Expo operational channels and stub success; test exit status through composed CLI, including mixed successful/unsupported channels.
- [ ] **PIC-008** — reject absent/wrong-type/zero acceptance and missing required provider evidence; test HTTP 200 `{}`, malformed JSON, provider denial, valid acceptance and retry after rejected response.
- [ ] **PIC-022** — register canonical notification primitives/operations, project ledger/log, test validation/authorization, duplicate attempts, concurrent dispatch/restart, and persistent-state failure visibility.

### Required final evidence

- [ ] Run full suite and plugin tests plus declared SSSS/quality gates as one-shot background jobs on the Mac mini for an isolated exact-tree snapshot; attach command, revision, exit status and counts.
- [ ] Install in a clean/composed host and prove configuration, dry-run, dispatch, CLI exits and canonical state query without bypasses.
- [ ] For each supported channel, perform an explicitly authorized operator send and record provider acceptance and separately observed delivery where available; no third-party messages or inferred delivery.
- [ ] Verify failure isolation, quiet-hour suppression and retry/deduplication without treating unsupported or malformed responses as sent.
- [ ] Verify secret redaction and notification/recipient privacy in logs and bundle exports; cleanup all disposable records.
- [ ] Reconcile all five documents before readiness/release closure.

Mocked network tests are legitimate synthetic verification; they do not prove live delivery, real installed configuration, provider feature availability or canonical state conformance. Validate external API contracts from current primary provider documentation before implementation. No test or delivery result is newly claimed here.
