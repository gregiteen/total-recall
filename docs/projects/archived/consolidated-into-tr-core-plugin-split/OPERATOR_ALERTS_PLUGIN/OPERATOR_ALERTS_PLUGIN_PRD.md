---
type: project_document
title: OPERATOR_ALERTS_PLUGIN — Prd
description: Prd with current implementation reconciliation and correction acceptance.
timestamp: 2026-09-30T16:30:00Z
tags: [project-management, plugins, corrections]
---
> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.


# OPERATOR_ALERTS_PLUGIN — PRD

> **Project Prefix**: `OPERATOR_ALERTS_PLUGIN`
> **Kanban State**: 🏗️ In Progress
> **Author**: Total Recall
> **Date**: 2026-09-28

---

## Problem
Agents, scripts and scheduled tasks need to reach the operator (the person who owns the machine or app) reliably, on the right channel, without duplicates, and with evidence of what happened. Each repo re-implemented this with hardcoded recipients and keys.

## Goals
- One generic, installable plugin: `total-recall alerts send|test|config|log`.
- Real providers: desktop (OS), email (SMTP2GO), SMS (Telnyx), webhook, GitHub issue.
- Keys only from the secret store; recipients and senders only from config.
- Dedupe by event id, quiet hours with critical bypass, dry-run, a ledger and a log.
- Honest evidence: `accepted` is not `delivered`.

## Non-goals (this project)
- Slack, Discord, Telegram, Expo: stubs that report `stub` and send nothing.
- Voice / AI assistant calls, Web Push senders, WhatsApp/RCS.
- Customer-facing sends. Operator alerts only; third-party messages need explicit operator approval in the app.

## Users
Any Total Recall user. The plugin contains nothing specific to one person, machine, repo or provider account.

## Acceptance
- Installs from a clean project and runs every subcommand.
- Dry-run resolves config and secrets and sends nothing.
- Provider failure on one channel does not stop the others and sets a non-zero exit.
- Spec covers dedupe, quiet hours, failure isolation, stubs, and the manifest.


## 2026-09-30 current-state reconciliation

This correction section supersedes unsupported readiness claims above; historical verification records remain intact. Static review covers the current `plugins/operator-alerts/notify-core.mjs`, `cli.mjs`, manifest and test source. No gates, providers or live sends ran during this documentation pass. Current readiness audit: **In progress — exact-tree sanctioned baseline and installed/provider verification outstanding**. Earlier reference-deployment delivery claims do not prove the current tree or every channel.

OS/email/SMS/webhook/GitHub have adapter source. Slack and Discord now have webhook adapter source, but their literal URL configuration is broken. Telegram and Expo remain explicit stubs. CLI success currently excludes only `failed`, allowing `stub` results to exit successfully. Durable event/deduplication state remains raw JSONL, not canonical SSSS operations. Therefore the plugin is **not verified ready**.

Corrections are coordinated by the [central correction tracker](../PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md). Owner for PIC-006/007/008/022: Operator Alerts implementation and tests in Total Recall; host SSSS adapter/registry ownership: Total Recall kernel interface. No external repository edits or release are part of this documentation reconciliation.

### Binding current acceptance

Supported channels perform a real operation or report explicit failure/unavailability. No stubs ship as working capabilities. Successful exit means all requested channels reached their documented valid disposition; a stub, malformed provider response or failed canonical-state commit cannot silently pass. Every accepted result is backed by validated provider evidence and remains distinct from delivery. State and idempotency are canonical SSSS operations with secret/recipient privacy.

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
