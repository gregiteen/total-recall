# tr-plugin-composable-cli

Total Recall composable CLI plugin: create, compose, register, test and safely run custom verbs; every command listed in the instruction surfaces.

## Status: v0.2.0 — Implementation in progress

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

## Readiness reconciliation — 2026-09-30

[Canonical correction plan](docs/projects/in-progress/COMPOSABLE_CLI_PLUGIN/COMPOSABLE_CLI_PLUGIN_PROJECT_TRACKER.md). No fresh suite was run against this external repository HEAD during the documentation review. Run `npm test` and configured gates on the Mac mini in a bounded background job. The Total Recall central preview is unwired static UI and is not an operational demonstration of this plugin.

- **PIC-042:** src/registry.mjs rollback restores a code snapshot but its fm rewrite preserves the old code_sha256 (line 230); writes bypass the host SSSS operation path.
- **PIC-043:** cli.mjs:256 test only prints a filename; promote at line 271 copies files without registering a plugin manifest command. Central ComposableCLIPreview.tsx:122 is a read-only terminal.

Durable capability state must use validated SSSS operations. Delivery requires a real clean-install command/UI walkthrough, explicit unavailable/error states and actual result provenance. Tests may use synthetic fixtures; shipped capability behavior may not.

## Use it two ways

This plugin is a reusable brick, so a new project does not start from zero.

**Add it to a project (for apps you build and ship).** From the project directory:

```sh
total-recall plugin vendor https://github.com/gregiteen/tr-plugin-composable-cli.git 
```

This copies the plugin's source, skills, tests and docs into `bricks/composable-cli` and records it in `tr-bricks.json`. Your project then owns that code: edit it, test it in your own gates, and ship it with no runtime dependency on this plugin or on Total Recall. Combine as many bricks as the project needs. List them with `total-recall plugin bricks`.

**Use it directly with Total Recall (for your own machines and workflow).** Install it with `total-recall plugin install https://github.com/gregiteen/tr-plugin-composable-cli.git` and run `total-recall composable-cli`. Manage its credentials with `total-recall auth secret` and its skills with `total-recall skill`.
