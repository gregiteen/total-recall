# tr-plugin-composable-cli

Total Recall composable CLI plugin: create, compose, register, test and safely run custom verbs; every command listed in the instruction surfaces.

## Status — Implementation in progress

See `docs/projects/in-progress/` for the audit, PRD, architecture, development plan and tracker.

## Architecture

```
src/
  command.mjs      — Core CRUD for command files (create/read/update/remove/list)
  contract.mjs     — Standard CLI contract: --help, --json envelope, exit codes 0/1/2/3, --background
  compose.mjs      — tr() composition helper (in-process for native custom commands, subprocess + --json for built-ins)
  risk.mjs         — Risk classes (read/write/money/dns-cert/production-deploy/secret-revoke), dry-run gate
  registry.mjs     — cli_command SSSS documents, version history, rollback
  resolve.mjs      — Scope search (project→group→global), shadow detection, group membership
schemas/
  cli_command.schema.json  — SSSS document schema for registered commands
cli.mjs                   — Plugin CLI entry point (composable-cli create|read|update|...)
```

## Key Concepts

### v2 Command Format
Commands export both `meta` (name, description, risk class, version) and a default function receiving `(args, context)` with `tr`, `json`, `dryRun`, and `log`:

```js
export const meta = { name: 'my-cmd', description: '...', risk: 'read', version: 2 };
export default async function main(args, { tr, json, dryRun, log }) { ... }
```

### Risk Gate
Commands of class `money`, `dns-cert`, `production-deploy`, or `secret-revoke` require `--yes` to execute. Without `--yes`, they print a plan and exit 3.

### Registry
Every command has a sibling `cli_command` SSSS document (`<name>.md`) beside its code, with provenance, risk class, version, author, and timestamps. History is kept in `.history/<name>/v*.mjs`.

## Install

Into a Total Recall brain: `total-recall plugin install <git url of this repo>`.

## Tests

```bash
node --test test/*.test.mjs
```

Existing test files cover: CRUD operations, shadow detection, risk gate, native-only command validation, registry round-trip, history, composition contract, and scope resolution.

## Current readiness

The [Composable CLI tracker](docs/projects/in-progress/COMPOSABLE_CLI_CARD/COMPOSABLE_CLI_CARD_PROJECT_TRACKER.md) holds the current backend and card work. The earlier [extraction project](docs/projects/archived/COMPOSABLE_CLI_PLUGIN/COMPOSABLE_CLI_PLUGIN_PROJECT_TRACKER.md) is historical. The current rollback code recomputes the restored source digest. Test discovery, promotion registration, scope/effects and native state still require end-to-end verification.

## Install in Total Recall

Install with `total-recall plugin install <git URL of this repository>`. The manifest declares Total Recall commands and does not declare an independent application brick.

`composable-cli test-path <name> --json` locates a test in the selected scope. `composable-cli test <name> --json` executes the test in a bounded Node subprocess and returns its exit status and output. Tests are executable code. `composable-cli promote <name> --to-plugin <dir>` registers a digest-matching inline read or write command in the target manifest. Gated commands require a destination integration that preserves their confirmation boundary.

## Using this from an agent

Send work here when you repeat a sequence and it should become a command, or to list, test or roll back one that exists.

```bash
total-recall composable-cli library --json
total-recall composable-cli create <name> "<code>"
total-recall composable-cli test <name>
total-recall composable-cli rollback <name>
```

This plugin owns no raw commands.
