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
