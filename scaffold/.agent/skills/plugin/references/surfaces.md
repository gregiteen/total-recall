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
  "author": "Your Name",
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
"reuse": {
  "commands": ["total-recall auth secret"],
  "owned": "Connects to the service and translates its records into the plugin's read model."
},
"requires": [ { "id": "mesh", "version": "^0.2.0" } ]
```

Copy exact command strings from `total-recall plugin library --json` for the installed owners this project uses. In `owned`, explain the capability the plugin supplies after the ecosystem inventory. Use an empty command list when the inventory supports that decision.

A plugin that declares secrets names `total-recall auth secret` as its credential interface. Auth itself owns that interface.

Declare portable dependencies with `requires`. Use the supported source with `total-recall plugin vendor` and inspect `total-recall plugin bricks --json` for the project-owned copy. Use `requires` only for bricks the capability actually imports. The vendor resolver checks the version constraint when it assembles a consuming project.

The full Creator check verifies these declarations against the installed commands and recorded brick payloads. Verify actual reuse through the plugin and fresh-project workflow tests.

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

## Startup check — what a session should see when it starts

```json
"startup_check": { "command": "unmerged", "args": ["--json"], "timeout_ms": 20000 }
```

Optional. `command` must be a declared `read` subcommand; `args` are at most 8 plain arguments; `timeout_ms` is 1000–30000 (default 15000). `total-recall startup check` and `brief` run it in the session's directory and show its `summary` when `outstanding` is above zero. The command prints one JSON object `{ "ok": true, "outstanding": 0, "summary": "one line: what and where" }`. A failure, a timeout or any other shape is shown as unavailable, never as clean. Declare it only for something that needs attention at the start of work, and keep it fast.

## Gate — how work reaches your plugin

Every plugin declares this, even one with nothing to claim. Write it by hand from what your plugin actually does.

```json
"gate": {
  "tasks": ["Run a command on another machine", "Enroll a machine in the mesh"],
  "owned_commands": [
    { "pattern": "ssh\\s", "use": "total-recall mesh exec <node> \"<command>\"" }
  ]
}
```

`tasks` are short phrases for the work that belongs here. Agents read them in the instruction table.

`owned_commands` lists raw shell commands your plugin replaces. Use `[]` if it replaces none, which is common. `pattern` is a regular expression matched at the start of a shell command, and text in quotes or a heredoc never matches. `use` is a real command in your CLI, starting with `total-recall <your namespace>`. Before blocking, the gate runs your `--help` if `cli.answers_help` is set, or otherwise the read-only command named by `status.command`. A plugin with neither is never blocked on.

Add a README section named `## Using this from an agent` that says what to send here, which commands to run, and what your plugin owns. `total-recall preflight coverage` lists any plugin that is missing these.

The gate warns by default. See `docs/guides/preflight-gate.md`.

`--help` never runs your plugin by default: core answers from your manifest, so keep each subcommand's `description`, `args` and `effect` accurate. If every command in your plugin answers `--help` itself and does no work, set `cli.answers_help` to `true`, and prove it with `node scripts/audit-help.mjs`.

A default plugin reaches existing installs only when its version goes up, so raise `version` in `plugin.json` and `package.json` with every change. `npm run check:plugin-versions` fails a release that forgets.

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
