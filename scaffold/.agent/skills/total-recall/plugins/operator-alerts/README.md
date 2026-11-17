# Operator Alerts

Operator alerts from agents, scripts and scheduled tasks.

**Channels:** `os` (terminal-notifier, osascript, notify-send), `email`
(SMTP2GO), `sms` (Telnyx), `telegram` (Bot API), `webhook`, `github`. `slack` and `discord` require an Auth-backed webhook URL reference. Unsupported channels return a failed result.

**Config** (later wins): native host settings,
`<repo>/.agent/notify.json`, `--config <file>`.

```json
{
  "email": { "key_secret": "SMTP2GO_KEY", "to": "secret:OPERATOR_EMAIL", "from": "alerts@your-verified-domain" },
  "sms":   { "key_secret": "TELNYX_KEY", "to": "secret:OPERATOR_PHONE", "from": "+1XXXXXXXXXX" }
}
```

`*_secret` values are references resolved through `total-recall auth secret`.
`to` is a literal or `secret:NAME`.

**Commands** are `alerts send|test|config|log|status`. `status: accepted` means the
provider accepted the request. Each supplied `--event-id` is reserved per channel before delivery. An uncertain submission remains pending for reconciliation. `alerts send --json` emits one receipt per channel and `alerts log --json` returns an array. `TR_NOTIFY_HOME` controls the logical native state location.

**Network access in current adapters:** api.smtp2go.com, api.telnyx.com, api.github.com, and configured generic/Slack/Discord webhook endpoints.


## Current readiness — 2026-11-05

Use `total-recall alerts`. `alerts test` is a dry run. Provider acceptance and recipient delivery are separate results. Current backend requirements and test evidence are in the owner project. [Owner audit](docs/projects/in-progress/OPERATOR_ALERTS_CARD/OPERATOR_ALERTS_CARD_AUDIT.md#2026-11-05-capability-audit) · [Readiness tracker](docs/projects/in-progress/OPERATOR_ALERTS_CARD/OPERATOR_ALERTS_CARD_PROJECT_TRACKER.md#cli-and-backend-gate-before-final-card-acceptance).

Config, reservations, ledger and history use the native state bridge. Provider delivery verification and recovery from an ambiguous submission remain open.

## Dispatch Watch

Open the plugin Home to see configured route names and the recent receipt timeline. The optional dry check runs the existing local channel checks and shows their states. `total-recall alerts status --json` provides the same redacted read model. `--check` adds dry-run results. The full settings, receipts and live send remain available through the operator CLI.

The Home theme lives in [DESIGN.md](DESIGN.md). Four [SSSS UI blocks](ui/chunks) cover route policy, dry-run checks, the receipt ledger and the dispatch workflow.

## Use it two ways

A project can vendor the plugin source through Total Recall.

**Add it to a project (for apps you build and ship).** From the project directory:

```sh
total-recall plugin vendor https://github.com/gregiteen/tr-plugin-operator-alerts.git 
```

This records copied source in `bricks/operator-alerts` and `tr-bricks.json`. Run the capability's own acceptance checks with the dependencies required by the selected entry point. Use `total-recall plugin bricks` to inspect installed bricks.

**Use it directly with Total Recall (for your own machines and workflow).** Install it with `total-recall plugin install https://github.com/gregiteen/tr-plugin-operator-alerts.git` and run `total-recall alerts`. Manage its credentials with `total-recall auth secret` and its skills with `total-recall skill`.

Native-only state: new installations use validated SSSS records and the shared auth owner. Legacy imports and compatibility fallback formats are not supported.

## Using this from an agent

Send anything meant to reach the operator here, whichever channel it uses. `status: accepted` means the provider took the alert, not that it arrived.

```bash
total-recall alerts send --title <title> --message <message>
total-recall alerts test
total-recall alerts log
```

Raw commands this plugin owns: `terminal-notifier` and `notify-send`.
