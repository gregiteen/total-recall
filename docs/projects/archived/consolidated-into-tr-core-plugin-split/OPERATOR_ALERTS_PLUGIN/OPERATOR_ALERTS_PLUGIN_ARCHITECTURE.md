---
type: project_document
title: OPERATOR_ALERTS_PLUGIN — Architecture
description: Architecture with current implementation reconciliation and correction acceptance.
timestamp: 2026-09-30T16:30:00Z
tags: [project-management, plugins, corrections]
---
> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.


# OPERATOR_ALERTS_PLUGIN — ARCHITECTURE

> **Project Prefix**: `OPERATOR_ALERTS_PLUGIN`
> **Kanban State**: 🏗️ In Progress
> **Author**: Total Recall
> **Date**: 2026-09-28

---

## Layout
`plugins/operator-alerts/`: `plugin.json` (command `alerts`), `cli.mjs` (`run(argv)`), `notify-core.mjs` (`loadConfig`, `sendNotification`, adapters), `alerts.spec.mjs`, `README.md`. The id is `operator-alerts` because `notifications` is already the built-in notification-rules API group.

## Flow
`send` → merge config (`~/.total-recall/notifications/config.json`, `<repo>/.agent/notify.json`, `--config`) → per channel: unknown? → quiet hours? → already sent for this event id? → adapter → record `{event_id, channel, status, provider_id, error, at}` in `sent.jsonl` → append `notification-log.md`.

## Secrets
`*_secret` config fields name secrets; read in-process with `total-recall secret get` (env var of the same name wins). Never printed, never in argv, never in request bodies (SMTP2GO key travels in a header).

## Statuses
`accepted` · `dry-run` · `duplicate` · `suppressed` · `stub` · `failed`. Stubs are not recorded in the ledger.

## Relationship to the notifications skill
The global `notifications` skill keeps its own `scripts/notify.mjs` so it works without the plugin. The plugin is the shippable form; the skill script can delegate to `total-recall alerts` once the plugin is broadly installed.

## State
Ledger and log are files under `TR_NOTIFY_HOME` (default `~/.total-recall/notifications/`). Per-machine delivery bookkeeping, not vault knowledge.


## 2026-09-30 current-state reconciliation

This correction section supersedes unsupported readiness claims above; historical verification records remain intact. Static review covers the current `plugins/operator-alerts/notify-core.mjs`, `cli.mjs`, manifest and test source. No gates, providers or live sends ran during this documentation pass. Current readiness audit: **In progress — exact-tree sanctioned baseline and installed/provider verification outstanding**. Earlier reference-deployment delivery claims do not prove the current tree or every channel.

OS/email/SMS/webhook/GitHub have adapter source. Slack and Discord now have webhook adapter source, but their literal URL configuration is broken. Telegram and Expo remain explicit stubs. CLI success currently excludes only `failed`, allowing `stub` results to exit successfully. Durable event/deduplication state remains raw JSONL, not canonical SSSS operations. Therefore the plugin is **not verified ready**.

Corrections are coordinated by the [central correction tracker](../PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md). Owner for PIC-006/007/008/022: Operator Alerts implementation and tests in Total Recall; host SSSS adapter/registry ownership: Total Recall kernel interface. No external repository edits or release are part of this documentation reconciliation.

### Actual versus corrected flow

Current flow: CLI/config → adapter → raw JSONL attempt record + Markdown log. Target: CLI/config → capability/config validation → authorized SSSS attempt/idempotency operation → provider adapter → response validation → SSSS result transition → projected query/log. Deduplication must survive restart and concurrent attempts; retries must not duplicate a confirmed provider send. Provider acceptance followed by state failure must remain a recoverable, visible uncertain outcome. Secrets are resolved by host credentials interfaces and excluded from persistent payloads. No ledger is exempt from canonical-state requirements merely because it is delivery bookkeeping.

| ID | Priority | Source evidence | Required correction |
|---|---|---|---|
| PIC-006 | P1 | `notify-core.mjs` Slack/Discord adapters accept `cfg.url` or `cfg.url_secret`, then always call `need(cfg, 'url_secret', ...)` | Resolve exactly the configured URL form consistently, or support secret-reference configuration only and remove literal URL claims. Reject missing/malformed configuration clearly. |
| PIC-007 | P1 | `notify-core.mjs` Telegram/Expo return `stub`; `cli.mjs` sets failure only when status is `failed` | Implement real channels or remove them from operational capabilities; unsupported requests must fail nonzero in every output mode. Dry-run cannot certify unavailable adapters. |
| PIC-008 | P1 | Email adapter tests only `r?.data?.succeeded < 1`; undefined comparison permits `{}` and other malformed successful HTTP responses | Validate provider response schema and explicit acceptance before recording accepted/provider identity. Keep accepted separate from delivered; do not dedupe on malformed success. |
| PIC-022 | P1 | `record()` appends `sent.jsonl`; `sentBefore()` reads it directly; `logMarkdown()` writes standalone Markdown | Canonical notification attempts/results/idempotency state must use registered SSSS documents and validated authorized operations. Logs remain disposable projections; state failures must remain visible. |
