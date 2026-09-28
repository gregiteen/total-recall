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
