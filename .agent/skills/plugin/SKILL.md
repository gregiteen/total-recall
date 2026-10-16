---
name: plugin
description: Create, scaffold, design, test and distribute Total Recall plugins that load correctly and render a functional, uniquely designed card. Use when an agent builds, changes or reviews a tr-plugin-*.
repo_scoped: false
---

# Total Recall plugins

Run `total-recall plugin --help` first. A plugin is a standalone repository (`tr-plugin-<id>`) with a `plugin.json`, a CLI handler, tests, and optionally a live panel. Core Total Recall holds portable memory and generic loading; every capability lives in a plugin.

## Decide how the plugin will be used

1. **Brick in a project (default for apps).** `total-recall plugin vendor <id | git-url | path> [dir]` copies the source into `bricks/<id>` and records it in `tr-bricks.json`. The project owns the copy and ships with no runtime dependency on the plugin or Total Recall. Plugins exist so nobody starts from zero.
2. **Direct use.** `total-recall plugin install <source>` then `total-recall <id> ...` for your own machines and workflow.
3. **New project.** Prefer adding bricks to starting from an empty folder. Run `total-recall plugin bricks` to see what a project already has.

Declare how yours is distributed: `distribution: { "tier": "core|official|personal|community", "license": "open|closed" }`. Closed means an operated service behind a thin client; see [distribution](references/distribution.md). Never rely on a local license check for protection.

## Build order

1. `total-recall plugin create <id> --name "<neutral name>" --description "<one concrete sentence>" --with-cli`.
2. Write the CLI first. Every subcommand prints JSON with `--json` and returns a non-zero exit on failure. Required subcommands where relevant: `status --json`, `config get|set --json`, `secrets status --json`. Details: [manifest contract](references/manifest-contract.md).
3. Declare every command in `plugin.json` with typed arguments and an effect (`read`, `write`, `destructive`, `send`). The card builds its forms from these, so an undeclared command is invisible to users and agents.
4. Declare `configuration.fields` for every setting and `secrets[]` for every credential. Credentials go through `total-recall auth secret`, never ambient environment variables, argv, files or logs.
5. Design the card: pick a template and widgets that fit the function, set brand tokens, write `ui/DESIGN.md`. Details: [card design](references/card-design.md).
6. Test (see below), then run the validator: `total-recall plugin info <id>` must report no errors.

## Rules that make a plugin compatible

- **Real data only.** A value appears on the card only if a command or the host returned it. Never hard-code metrics such as "ONLINE" or sample numbers. If a source fails, show the failure and the time of the last attempt.
- **Functional first.** The card must show what the plugin can do (all declared commands), all of its settings, all of its credentials, and its real status. Decoration comes after, never instead.
- **Unique design per plugin.** Layout and brand follow the plugin's function. Two plugins with different jobs must not look alike. No decorative animation, no emoji as icons, no skins that imitate hardware.
- **Neutral, descriptive name.** No invented brand. The name says what the plugin does.
- **Tokens only.** No hard-coded colors in plugin UI code; use the brand tokens and the design tokens in `ui/DESIGN.md`.
- **Accessible and touch ready.** Controls are at least 44 px, keyboard reachable, with visible focus, contrast-checked state colors, and reduced motion respected.
- **Secrets stay secret.** Set from the card over stdin for declared secret arguments only. Show present or missing, never the value.
- **State through the vault contracts.** No unmanaged raw file writes for records; use SSSS operations.
- **Fail closed.** Missing credentials, failed providers and unavailable peers produce explicit errors, never a success badge.
- **Copy.** No filler words, and no sentence ends with a preposition.

## Test before you share

- Unit tests for each subcommand, including failure paths and `--json` shape.
- A manifest test that loads `plugin.json` with the validator and checks that every `card_layout` source command and every `status.command` is a declared subcommand.
- A secrets test proving no secret value appears in argv, stdout, logs or the card state.
- Run suites in the background on the configured test node and read the real exit status. A passing health probe is not a test result.

## Distribution

- Open plugins are vendorable and can be shared with `plugin share`. Closed service-backed plugins list price and usage in the manifest `monetization` block. See [distribution](references/distribution.md).
- Third parties publish with the same manifest and conformance tests. The store lists signed, immutable versions and never runs plugin code.

## References

- [Manifest contract](references/manifest-contract.md): every field, with a complete example.
- [Card design](references/card-design.md): templates, widgets, brand tokens, the design process, anti-patterns.
- [Distribution](references/distribution.md): bricks, tiers, license class, monetization, store, third-party authoring.
