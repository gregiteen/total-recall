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

Only an explicit `effect: "read"` permits execution from a card. Missing effects default to reference-only; names such as `config`, `list` or `check` do not establish that a command is read-only. Grouped commands that accept a write action must not be labeled read.

## Secret input through the owner interface

Declare exactly one argument with `type: "string"`, `secret: true` and no `flag`. A secret does not require positional metadata. The isolated owner interface can call `host.run('save-key', [], { stdin: value })`. The host authenticates and checks write scope, the server validates the manifest declaration and the 65,536-byte UTF-8 limit, and the child receives the value through stdin with `--stdin`. Empty, undeclared and ambiguous secret input is rejected. Child stdout/stderr is suppressed for this operation, and the owner interface receives only success or failure. Re-read nonsecret credential status through a separate command; never echo the submitted value.

## Workspaces

`workspace.component` identifies an owner-supplied `ui.elements` id or tag. The host mounts that interface through the same isolated panel boundary; core contains no plugin-specific workspace implementation. `workspace.permissions` may list `microphone`, `camera` or `notifications`, but a declaration does not grant device access. Device-backed workspaces remain explicitly unavailable until a safe host capability bridge exists. Never add `allow-same-origin` to the scripts-only iframe to bypass this limitation.

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
See [card design](card-design.md) for `card_layout` and `branding`. Branding also carries the real logo and, for wrappers, the provider:
```json
"branding": { "logo": "ui/logo.svg", "provider": { "name": "Stripe", "url": "https://stripe.com" }, "color": "#635bff" }
```

## Monetization (optional)
```json
"monetization": { "model": "metered", "price_cents": 2, "currency": "usd", "period": "per-use",
  "license_key_secret": "PAYMENTS_LICENSE_KEY", "checkout_url": "https://example.com/plugins/payments" }
```
Models: `free`, `one-time`, `subscription`, `metered`, `take-rate` (with `take_rate_basis_points`). Enforcement belongs to the operated service; see [distribution](distribution.md).

## Runtime, tasks and UI elements
`tasks` run a declared subcommand on a cron schedule; each needs `intent`, `schedule`, `command`. `ui.elements` lists the optional live panel (`kind: "panel"` or `"card-face"`, `tag`, `module`). A plugin does not need `ui` at all for the standard card.
