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
