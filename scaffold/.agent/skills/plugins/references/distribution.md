# Distribution, monetization and third-party plugins

## Open plugins as bricks
`total-recall plugin vendor <source> [dir]` copies a plugin into `bricks/<id>` and records version, source and content hash in `tr-bricks.json`. `total-recall plugin bricks` reports each brick as unchanged, modified or missing. Edits are expected; the project owns the copy. Install the dependencies the command prints and add the brick's tests to the project gates. Do not edit the plugin repository to satisfy one project.

## Tiers and license class
- `core`: ships with Total Recall (memory, auth, mesh, project tooling).
- `official`: published by the maintainer, installed on demand.
- `personal`: one owner's own variant; keep operator-specific names and infrastructure here.
- `community`: published by a third party.
Open plugins carry their source. Closed plugins are services.

## Monetizable (closed) plugins
Source that runs on a user's machine cannot be protected by a local license check. A closed plugin is a thin client plus a hosted service that holds provider accounts, meters usage, enforces plan and credits, and bills. The client reads the license key from `total-recall auth secret`, sends signed requests, and reports a clear error when the license is missing, lapsed or out of credit. Show price and usage on the card. Typical candidates are wrappers over third-party APIs such as telephony, messaging, domains and mail, and metered AI access.

## Installations and usage
Adding a plugin to a project records the installation locally: plugin, version, content hash, project path, date. The host lists these in the drawer's Projects tab with status (unchanged, modified, missing). Each brick appends usage entries to `<project>/.tr/usage/<plugin>.jsonl`: time, command, exit state, duration, units and cost for metered calls, never payloads or secrets. Closed services meter on the server with one key per project. Nothing is sent anywhere unless the owner explicitly opts in. A brick's `usage` helper must not write request or response bodies.

## Third-party authoring
Anyone can build a plugin with `plugin create`, the manifest contract and the conformance checks, then submit it to the store. The store lists signed, immutable, hash-pinned versions, pays out to the manifest `monetization.recipient`, and never executes plugin code. API wrappers can be generated from an OpenAPI document with `plugin from-openapi` once it ships; the output is open and follows this contract.

## Status of these features
Implemented: `plugin vendor`, `plugin bricks`, the manifest validator for arguments, effects, status, layout, branding and distribution. In progress under the plugin-split project: the shared card engine, the slide-out drawer, installation and usage ledgers, logo rendering and templates, the host `stdin` channel for secrets, `new`, `plugin test`, `plugin from-openapi`, license verification and the store. Declare the contract fields now; they validate today and render as the engine lands.
