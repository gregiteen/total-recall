---
type: project_document
title: OPERATOR_ALERTS_PLUGIN — Development Plan
description: Development Plan with current implementation reconciliation and correction acceptance.
timestamp: 2026-09-30T16:30:00Z
tags: [project-management, plugins, corrections]
---

# OPERATOR_ALERTS_PLUGIN — Development Plan

> **Project Prefix**: `OPERATOR_ALERTS_PLUGIN`
> **Kanban State**: 🏗️ In Progress
> **Author**: Total Recall
> **Date**: 2026-09-28

---

1. **Core + CLI**: adapters for os/email/sms/webhook/github, stubs for the rest. Done.
2. **Tests**: mocked-fetch spec. Done.
3. **Ship**: bundled in the package (`plugins/`), spec excluded from the tarball. Done in the next release.
4. **Chat adapters**: Slack/Discord webhooks, Telegram bot, once the user supplies webhook URLs/tokens.
5. **Expo push**: adapter plus receipt check, once a token exists.
6. **Delivery receipts**: `alerts status <provider_id>` (Telnyx `GET /v2/messages/{id}`, SMTP2GO activity search).
7. **Web Push sender** (VAPID) and **voice** (Telnyx AI Assistant with OpenRouter LLM; a reply counts as approval only when the repo says so).
8. **Skill delegation**: `scripts/notify.mjs` calls the plugin when installed.


## 2026-09-30 current-state reconciliation

This correction section supersedes unsupported readiness claims above; historical verification records remain intact. Static review covers the current `plugins/operator-alerts/notify-core.mjs`, `cli.mjs`, manifest and test source. No gates, providers or live sends ran during this documentation pass. Current readiness audit: **In progress — exact-tree sanctioned baseline and installed/provider verification outstanding**. Earlier reference-deployment delivery claims do not prove the current tree or every channel.

OS/email/SMS/webhook/GitHub have adapter source. Slack and Discord now have webhook adapter source, but their literal URL configuration is broken. Telegram and Expo remain explicit stubs. CLI success currently excludes only `failed`, allowing `stub` results to exit successfully. Durable event/deduplication state remains raw JSONL, not canonical SSSS operations. Therefore the plugin is **not verified ready**.

Corrections are coordinated by the [central correction tracker](../PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md). Owner for PIC-006/007/008/022: Operator Alerts implementation and tests in Total Recall; host SSSS adapter/registry ownership: Total Recall kernel interface. No external repository edits or release are part of this documentation reconciliation.

### Ordered correction execution

1. Capture exact-tree baseline and current primary provider contracts before implementation.
2. Add negative synthetic cases for PIC-006/007/008; fix channel capability, configuration and provider evidence handling.
3. Implement PIC-022 registered SSSS state and recovery/idempotency semantics through the host operation boundary.
4. Run installed-host dispatch/query verification and explicitly authorized live operator channel walkthroughs.
5. Close only evidence-backed tasks and synchronize audit/PRD/architecture/tracker.

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
