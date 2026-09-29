---
type: project_document
title: OPERATOR_ALERTS_PLUGIN — AUDIT
description: Audit of operator alert implementations, notification paths, and credentials across repositories.
timestamp: 2026-09-28T20:08:00Z
tags: [project-management, audit, total-recall, operator-alerts, plugins]
---

# OPERATOR_ALERTS_PLUGIN — AUDIT

> **Project Prefix**: `OPERATOR_ALERTS_PLUGIN`
> **Kanban State**: 🏗️ In Progress
> **Author**: Total Recall
> **Date**: 2026-09-28

---

## 1. Executive Summary

This audit assesses the state of notification and alert mechanisms across the host environment, existing skills, and bundled plugin implementations. Prior to this consolidation, alert logic was fragmented across ad-hoc scripts (`scripts/notify.mjs`), custom HTTP calls to Telnyx and SMTP2GO, and unmanaged webhook invocations. This audit establishes the baseline for consolidating operator notification channels into the unified `operator-alerts` plugin (`plugins/operator-alerts/`).

## 2. Inventory of Alert Mechanisms and Implementations

### A. Repositories and Modules Audited
1. **Total Recall Core**: `src/server/notifications.mjs`, `plugins/operator-alerts/`
2. **Global Notification Skill**: `.agent/skills/notifications/` with `scripts/notify.mjs`
3. **Application Call Sites**:
   - `festech-modular`: Alerting for telecom provisioning and daemon errors
   - `moogie_crm`: Pipeline and appointment alert dispatch
   - `total-recall`: Daemon heartbeat and security alerting

### B. Provider Coverage & Credentials Audit
- **Desktop (OS)**: Terminal bell and AppleScript notification center dispatch. Working locally on macOS; no secrets required.
- **Email (SMTP2GO)**: `SMTP2GO_API_KEY` verified in Total Recall secrets store. Endpoints: `https://api.smtp2go.com/v3/email/send`.
- **SMS (Telnyx)**: `DEVELOPER_TELNYX_API_KEY` present in secret store. Endpoints: `https://api.telnyx.com/v2/messages`.
- **Webhook**: Generic HTTP POST with signature headers.
- **GitHub Issues**: Octokit REST API dispatch using repository tokens.

## 3. Gaps Identified

1. **Credential Leaks Risk**: Scripts previously passed tokens in CLI arguments or environment variables without centralized secret store lookup.
2. **Duplicate Dispatches**: Lack of deterministic event-ID deduplication led to repeated notifications during daemon retries.
3. **Missing Quiet Hours**: Alert storms occurred during overnight batch jobs without time-window suppression.
4. **Channel Isolation**: A failure in one external provider (e.g., SMTP2GO rate limit) would crash the caller before attempting secondary channels.

## 4. Current State of the Consolidated Plugin

The plugin is implemented at `plugins/operator-alerts/` with the following files:
- `plugin.json`: Declares `alerts` command and subcommands (`send`, `test`, `config`, `log`).
- `cli.mjs`: CLI runner handling argv, timeouts, and JSON error reporting.
- `notify-core.mjs`: Core dispatch engine implementing quiet hours, deduplication ledger (`sent.jsonl`), secret resolution, and provider adapters.
- `alerts.spec.mjs`: Unit test suite with mocked network calls verifying deduplication and error isolation.

## 5. Audit Conclusion

The consolidated `operator-alerts` plugin successfully satisfies the isolation, deduplication, and credential protection requirements. Next steps are tracking chat adapters (Slack/Discord/Telegram) and delivery receipt verification as outlined in the development plan.
