# Operator Alerts

Operator alerts from agents, scripts and scheduled tasks.

**Channels:** `os` (terminal-notifier, osascript, notify-send), `email`
(SMTP2GO), `sms` (Telnyx), `webhook`, `github`. `slack` and `discord` have webhook adapter source with a configuration defect; `telegram` and `expo` remain stubs that send nothing. Unsupported channels must not be treated as working capabilities.

**Config** (later wins): `~/.total-recall/notifications/config.json`,
`<repo>/.agent/notify.json`, `--config <file>`.

```json
{
  "email": { "key_secret": "SMTP2GO_KEY", "to": "secret:OPERATOR_EMAIL", "from": "alerts@your-verified-domain" },
  "sms":   { "key_secret": "TELNYX_KEY", "to": "secret:OPERATOR_PHONE", "from": "+1XXXXXXXXXX" }
}
```

`*_secret` values name Total Recall secrets read with `secret get` in-process.
`to` is a literal or `secret:NAME`.

**Commands:** `alerts send|test|config|log`. `status: accepted` means the
provider took it, not that it arrived. Ledger: `sent.jsonl` beside the log in
`~/.total-recall/notifications/` (override with `TR_NOTIFY_HOME`).

**Network access in current adapters:** api.smtp2go.com, api.telnyx.com, api.github.com, and configured generic/Slack/Discord webhook endpoints.


## Current readiness — 2026-09-30

Implementation is in progress. Slack/Discord literal URLs are accepted by the guard but not resolved by dispatch; Telegram/Expo stubs can exit successfully; malformed HTTP-200 email responses can be labelled accepted; canonical event/idempotency state is still raw JSONL. These are tracked as PIC-006/007/008/022 in the [plugin tracker](../../docs/projects/in-progress/OPERATOR_ALERTS_PLUGIN/OPERATOR_ALERTS_PLUGIN_PROJECT_TRACKER.md) and [central correction tracker](../../docs/projects/in-progress/PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md).

The ledger/log locations above describe current files, not demonstrated SSSS conformance. Test fixtures and historical reference-deployment proof do not establish current delivery or release readiness. Final verification requires fresh background gates on the Mac mini, clean/composed installation, validated canonical state and explicitly authorized real operator sends. This documentation pass performed no provider calls or new tests.
