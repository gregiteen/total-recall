# Manifest contract

`plugin.json` is validated by Total Recall (`total-recall plugin info <id>` shows errors and warnings). Fields marked optional change what the card can show; omitting them still yields a card that lists commands and secrets.

## Identity and distribution
```json
{
  "id": "payments",
  "name": "Payments",
  "version": "0.1.0",
  "description": "One concrete sentence about the job this plugin performs.",
  "license": "MIT",
  "use_cases": ["commerce"],
  "distribution": { "tier": "official", "license": "open" }
}
```
`id` is lowercase kebab-case. `name` is neutral and descriptive. `tier` is `core`, `official`, `personal` or `community`. `license` is `open` (source can be vendored) or `closed` (operated service).

## Commands
```json
"cli": {
  "command": "payments",
  "handler": "./cli.mjs",
  "subcommands": [
    { "name": "status", "description": "Connection and credential state", "effect": "read", "output": "json" },
    { "name": "refund", "description": "Refund a payment", "effect": "destructive", "output": "json", "timeout_ms": 30000,
      "args": [
        { "name": "paymentId", "flag": "--payment", "label": "Payment", "type": "string", "required": true },
        { "name": "reason", "flag": "--reason", "label": "Reason", "type": "choice", "options": ["duplicate", "fraud", "requested"] },
        { "name": "amount", "flag": "--amount", "label": "Amount", "type": "number", "description": "Leave empty for a full refund" }
      ] },
    { "name": "token-set", "description": "Store the API key", "effect": "write",
      "args": [{ "name": "value", "label": "API key", "type": "string", "secret": true, "positional": true, "required": true }] }
  ]
}
```
- **Argument types:** `string`, `number`, `boolean`, `choice` (requires `options`). Each needs `name` (camelCase), `label`, and either `flag` (`--kebab-case`) or `positional: true`.
- **Effects:** `read` (default), `write`, `destructive`, `send`. The card asks for confirmation before `destructive` and `send`, and never auto-runs anything but `read`.
- **Secret arguments** are read from stdin by the CLI, never from a flag. A secret argument must not declare a `flag`.
- Duplicate command or argument names are rejected.

## Status
```json
"status": { "command": "status", "refresh_seconds": 30 }
```
The command must be declared and must be a `read` command. It prints:
```json
{ "ok": true, "summary": "Connected, live mode", "items": [
  { "label": "Account", "value": "acct_123", "state": "ok" },
  { "label": "Webhook secret", "value": "missing", "state": "warn" } ] }
```
States are `ok`, `warn`, `error`, `unknown`. Do not use `card_face.metrics`: fixed text cannot reflect state, and the validator warns about it.

## Settings and credentials
```json
"configuration": { "fields": [
  { "name": "mode", "type": "string", "label": "Mode", "options": ["test", "live"], "default": "test", "required": true },
  { "name": "currency", "type": "string", "label": "Default currency", "default": "usd" },
  { "name": "sendReceipts", "type": "boolean", "label": "Email receipts", "default": true } ] },
"secrets": [
  { "key": "PAYMENTS_SECRET_KEY", "description": "Secret key for payment processing", "required": true },
  { "key": "PAYMENTS_WEBHOOK_SECRET", "description": "Signs incoming webhooks", "required": false } ]
```
Field names are camelCase and may not contain password, secret, apiKey or token; those belong in `secrets` with uppercase keys. Declare every setting and credential the plugin really reads, so the card shows all of them.

## Layout and branding
See [card design](card-design.md) for `card_layout` and `branding`.

## Monetization (optional)
```json
"monetization": { "model": "metered", "price_cents": 2, "currency": "usd", "period": "per-use",
  "license_key_secret": "PAYMENTS_LICENSE_KEY", "checkout_url": "https://example.com/plugins/payments" }
```
Models: `free`, `one-time`, `subscription`, `metered`, `take-rate` (with `take_rate_basis_points`). Enforcement belongs to the operated service; see [distribution](distribution.md).

## Runtime, tasks and UI elements
`tasks` run a declared subcommand on a cron schedule; each needs `intent`, `schedule`, `command`. `ui.elements` lists the optional live panel (`kind: "panel"` or `"card-face"`, `tag`, `module`). A plugin does not need `ui` at all for the standard card.
