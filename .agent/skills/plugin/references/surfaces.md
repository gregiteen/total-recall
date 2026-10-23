# Surfaces

Every surface a plugin can declare, with the exact fields for each.

**Declare only what the capability needs.** An unused surface is noise; a missing one hides the capability. Identity is required; everything else is optional and independent.

---

## Identity — always required

```json
{
  "id": "host-telemetry",
  "name": "Host Telemetry",
  "version": "1.0.0",
  "description": "One concrete sentence saying what this adds.",
  "author": "Greg",
  "license": "MIT",
  "use_cases": ["operations", "self-hosting"]
}
```

| Field | Rule |
| --- | --- |
| `id` | lowercase kebab-case, matching the repository `tr-plugin-<id>` |
| `name` | plain and descriptive; never an invented brand for a wrapper of someone else's service |
| `version` | semver |
| `description` | at least five characters, one sentence, no filler |
| `author`, `license` | authorship and license, as shipped |
| `use_cases` | free-form tags used to filter discovery |

---

## CLI

```json
"cli": {
  "command": "host-telemetry",
  "handler": "./cli.mjs",
  "subcommands": [
    { "name": "sample", "description": "One telemetry reading from this machine",
      "effect": "read", "output": "json",
      "args": [ { "name": "json", "flag": "--json", "label": "JSON output", "type": "boolean" } ] },
    { "name": "charge", "description": "Create a payment", "effect": "send", "output": "json", "timeout_ms": 30000,
      "args": [
        { "name": "amount", "flag": "--amount", "label": "Amount", "type": "number", "required": true },
        { "name": "currency", "flag": "--currency", "label": "Currency", "type": "choice", "options": ["usd", "eur"] },
        { "name": "secretKey", "label": "Secret key", "type": "string", "secret": true }
      ] }
  ]
}
```

| Field | Required | Rule |
| --- | --- | --- |
| `name` | yes | kebab-case, unique, declared once |
| `description` | yes | what the operation does |
| `effect` | yes | `read`, `write`, `destructive`, `send` |
| `args[].name` | yes | camelCase |
| `args[].label` | yes | human label |
| `args[].type` | yes | `string`, `number`, `boolean`, `choice` |
| `args[].flag` | for non-secret | `--flag-name` |
| `args[].positional` | alternative to flag | `true` |
| `args[].required` | no | `true` when the operation cannot run without it |
| `args[].options` | for `choice` | non-empty array |
| `args[].secret` | for credentials | `true`; the value travels over **stdin**, never `argv`. Exactly one secret argument per command, a string, with no flag |
| `output` | no | `json` (default) or `text` |
| `timeout_ms` | no | 1–600000, for slow operations |

The handler must emit JSON under `--json` on **every** subcommand, exit non-zero on failure with the real error on stderr, and answer `--help` without resolving credentials.

## Memory

```json
"ssss_schemas": { "categories": [ { "name": "host-readings", "description": "…", "node_type": "memory" } ] }
```

Adds a category to the vault. Use when the capability contributes a new kind of knowledge.

## Context

```json
"compile": { "generator": "./generate.mjs", "watch": ["data"] }
```

`generator` is a safe relative path; `watch` lists plugin-owned directories the compiler re-reads. Use when the capability must change what agents read at the start of a task.

## Skills

```json
"skills": [ { "id": "host-telemetry", "path": "./skills/host-telemetry/SKILL.md" } ]
```

Instruction an agent loads on demand.

## Tasks

```json
"tasks": [ { "intent": "Sample every node", "schedule": "*/15 * * * *", "command": "fleet", "placement": "selected-node" } ]
```

Five-field cron. `command` must be a declared subcommand.

## Runtime

```json
"runtime": { "modules": { "sampler": "./runtime/sampler.mjs" }, "routers": ["./routes/readings.mjs"] }
```

Live behaviour rather than a command. Module keys are lowercase kebab-case.

## UI — the card face

```json
"ui": {
  "design_tokens": "ui/DESIGN.md",
  "elements": [
    { "id": "card", "kind": "card", "tag": "tr-host-telemetry-card", "module": "ui/card.js",
      "description": "Fleet telemetry board" }
  ]
}
```

**Every plugin has a card**: exactly one element of kind `card`, and **no `card_layout`** — a declared template is an error, not a fallback. `description` says what the element is. See [card](card.md).

## Deploy

```json
"deploy": { "targets": ["ssss-app", "nextjs"], "required_ssss_version": ">=0.9.3",
  "access_grants": ["ssss:vault:read"], "resources": { "db": "sqlite" } }
```

Use when the capability is deployed into other applications.

## Distribution and monetization

```json
"distribution": { "tier": "official", "license": "open" },
"monetization": { "model": "metered", "price_cents": 2, "currency": "usd", "period": "per-use",
  "license_key_secret": "SERVICE_LICENSE_KEY", "checkout_url": "https://…" }
```

`tier`: `core`, `official`, `personal`, `community`. `license`: `open` or `closed`. A closed plugin is an operated service behind a thin client; never rely on a local license check.

## Composition

```json
"requires": [ { "id": "auth", "range": "^1.0.0" } ]
```

Builds on other bricks instead of starting from zero.

## Credentials

```json
"secrets": [ { "key": "SERVICE_API_KEY", "description": "Reads and creates charges", "required": true } ]
```

Uppercase key. Resolved only through `total-recall auth secret`. No store of the plugin's own, and no ambient environment variable.

## Settings

```json
"configuration": { "fields": [ { "key": "region", "label": "Region", "type": "string", "default": "us-east" } ] }
```

Keys are camelCase and may not contain `password`, `secret`, `apiKey` or `token` — those belong in `secrets`.

## Status

```json
"status": { "command": "status", "refresh_seconds": 30 }
```

`command` must be a declared `read` subcommand. `refresh_seconds` is 5–86400.

## Branding

```json
"branding": {
  "name": "Host Telemetry", "color": "#059669", "accent": "#10b981",
  "font": "jetbrains-mono", "density": "compact", "radius": "sm", "header": "ledger-rule",
  "badge": "Telemetry", "logo": "ui/logo.svg",
  "provider": { "name": "Stripe", "url": "https://stripe.com" }
}
```

| Field | Values |
| --- | --- |
| `color`, `accent` | `#rrggbb` |
| `font` | `system`, `inter`, `ibm-plex`, `space-grotesk`, `jetbrains-mono`, `dm-sans`, `outfit`, `fraunces`, `newsreader`, `chivo-mono` |
| `density` | `compact`, `comfortable`, `spacious` |
| `radius` | `none`, `sm`, `md`, `lg`, `pill` |
| `header` | `plain`, `ledger-rule`, `band`, `tab-strip`, `badge-left` |
| `logo` | relative `.svg` or `.png` inside the plugin; a real mark, never an emoji or generic icon |
| `provider` | for a wrapper of someone else's API: set it and keep that provider's name and brand rather than inventing your own |

---

## Validating

```
total-recall plugin info <id>
```

No errors and no warnings before the plugin is done. `scripts/record.mjs` runs the same validation plus the checks the validator cannot make.
