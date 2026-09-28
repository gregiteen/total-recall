# Operator Alerts

Operator alerts from agents, scripts and scheduled tasks.

**Channels:** `os` (terminal-notifier, osascript, notify-send), `email`
(SMTP2GO), `sms` (Telnyx), `webhook`, `github`. `slack`, `discord`, `telegram`
and `expo` are stubs: they report `stub` and send nothing.

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

**Network access:** api.smtp2go.com, api.telnyx.com, api.github.com, and the
webhook URL you configure. Nothing else.
