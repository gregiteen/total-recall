# Plugins

Use `plugin list --json` and `plugin info <id>` to inspect the actual installed owner, version, validity, handler, configuration, tasks and UI declarations. Read CLI help before installation/authoring operations. Each substantive capability has one source repository. Total Recall exposes generic manifest validation, runtime module/router loading, process execution and memory contracts. Declared runtime files must resolve inside the plugin directory; missing/invalid plugins fail without built-in behavior.

Auth is the required scaffold credential owner. Consumers request its runtime or `auth secret` CLI. Do not directly import deleted core secret modules, maintain copied encrypted stores, read ambient provider-key variables as a bypass, or place secret values in argv/UI messages. Manifest declarations must be checked against real code. Credential UI saves through auth, optionally after the owning provider verifier succeeds; no format-only fake verification.

Plugin UI is purpose-specific and belongs in its repository. Bind cards to actual observations, preserve errors and timestamps, show honest unavailable/empty states, and never report ready from a resolved failed runner response. Generic hosts use opaque scripts-only frames, blocked network CSP and source-bound declared-command bridges. UI isolation is not an OS sandbox for installed native plugin code.

The bridge rejects undeclared commands even when a manifest declares no commands. Cards execute only explicitly declared read effects. Owner panels may submit one declared secret string with `host.run(command, args, { stdin: value })`; the authenticated server validates the declaration and 64 KiB UTF-8 bound, pipes it with `--stdin`, and suppresses child output. Workspace components resolve to owner UI element ids/tags; missing interfaces and unsupported device access stay unavailable. Live card regions mount owner panels. Full provider behavior and audio sessions still require separate end-to-end verification.

Configuration uses validated records/SSSS contracts. A manifest task schedule is not an active runner. Resolve node placement and daemon evidence; do not run recurring work on an arbitrary laptop. Verify tests/package provenance separately from install/runtime readiness. Keep the owner skill and this router's relevant reference synchronized whenever capabilities change.


All 29 installed manifests declare auth. This is declaration evidence only: the expanded source audit fails while CRM Python/local credential paths remain. Sixteen affected service-owner suites have passing isolated results; these do not certify all 29 plugins or live providers.

## Two ways to use a plugin: scaffold or direct

Plugins exist so developers do not start from zero on every project: each repository is a reusable, tested brick. A developer can use one of two ways. Know which one the work calls for before touching it.

1. **Scaffold into a project (the intended path for apps).** The plugin's source is the starting point for code that lives in the developer's own project. Copy or generate it once, then the project owns, tests and releases that code. A product built this way never loads, installs or calls the plugin in production, and it has no dependency on a Total Recall release, validator or brain. Use this for anything shipped to customers, for example billing, signing, calling and texting, maps, a credential vault, or a CRM runtime.
2. **Use directly with Total Recall.** Install and run the plugin through `total-recall <plugin>` for the developer's or operator's own machines: memory, mesh, project gates, personal credential storage, automation.

Rules that follow:
- When a task is "build or change a product", default to scaffolding. Do not plan a production install of Total Recall or a plugin for that product, and do not make the product import a plugin by path.
- When a task is "operate my own machines or workflow", default to direct use.
- If unclear, ask which one is meant before choosing.
- The prohibition above on copied encrypted stores applies to code that reimplements Total Recall's own secret modules for Total Recall consumers. A scaffolded project vault is owned by that project, scoped to that project, and is the correct outcome of scaffolding the auth plugin.
- A scaffolded copy is a fork: record its source plugin and version in the project, test it in the project's gates, and do not edit the plugin repository to satisfy one project's needs.

Bricks: add a plugin's functionality to a project with the CLI.
- `total-recall plugin vendor <bundled-id | git-url | path> [dir]` copies the plugin's source (including its skills, tests and docs) into the project as a brick, default `bricks/<id>`, and records it in `tr-bricks.json` with its version and content hash. It refuses a non-empty directory, a duplicate brick, and a destination outside the project, and it prints the dependencies to add.
- Add as many bricks as the project needs; each is independent. `total-recall plugin bricks [--json]` lists them and marks each `unchanged`, `modified` (edited locally, which is expected) or `missing`.
- Skills in a brick are managed with `total-recall skill`; credentials a brick needs are managed with `total-recall auth secret` during development and provisioned to the deployed project through its own configuration.
- `plugin create` makes a new empty plugin; `plugin vendor` adds an existing one to a project.
