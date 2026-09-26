---
name: plugins
description: Create, validate, install, run, and share Total Recall plugins. Use when a user wants a plugin that adds a useful command, scheduled task, agent context, or SSSS memory category.
---

# Total Recall plugins

Build a plugin for a concrete user job. Start by stating the command, context, task, or memory category it adds and how a user will tell that it works. Do not add a plugin solely to populate a gallery.

## Where to work

Run `total-recall plugin create <id> --name "..." --description "..." --use-case <tag> --with-cli` to scaffold an installed plugin. The CLI creates a directory under the current project's `.agent/skills/total-recall/plugins/`; `--global` creates a machine-wide plugin. A plugin is a folder containing `plugin.json` and the files its manifest names. For a plugin intended to ship with Total Recall itself, use the package's `plugins/<id>/` folder and add a real install and use test.

Inspect the installed package's `metadata.plugin.schema.json` and `src/core/plugin-loader.mjs` for the current executable contract before changing a manifest. The schema supports:

```json
{
  "id": "example-plugin",
  "name": "Example Plugin",
  "version": "1.0.0",
  "description": "The specific job this plugin does.",
  "author": "Author name",
  "license": "MIT",
  "use_cases": ["research"],
  "cli": {
    "command": "example-plugin",
    "handler": "./cli.mjs",
    "subcommands": [{ "name": "status", "description": "Show current status" }]
  }
}
```

An ID is lowercase kebab case, starts with a letter, and is 2–64 characters. `use_cases` are descriptive kebab-case tags. Keep the manifest honest: declare only features the plugin implements. `README.md` should explain the user job, prerequisites, commands, outputs, and any data or network access.

## Implement a capability

- **Command:** export `async function run(argv)` from the `cli.handler` module. It receives `['node', 'total-recall', '<command>', '<subcommand>', ...]`. A default-exported function is also supported and receives arguments after the command. Return a result or set `process.exitCode` on failure. The runner isolates the handler in a child process, with a timeout and output cap.
- **Scheduled task:** add `tasks: [{ "intent": "...", "schedule": "*/15 * * * *", "command": "sample" }]`. `command` is a subcommand implemented by the plugin's CLI handler. The daemon runs it once per due minute slot and records the outcome as a `plugin.task_run` event. Keep tasks bounded and idempotent.
- **Agent context:** add `compile: { "generator": "./generator.mjs", "auto": true }` and export `generateContext()` from that file. Only include information useful to the agent; avoid secrets and noisy telemetry.
- **Memory category:** declare it under `ssss_schemas.categories` using the current manifest schema. Preserve SSSS Markdown and operation-contract writes; do not write vault documents directly.

## Validate the actual job

1. Validate `plugin.json` against the installed schema and `total-recall plugin info <id>`.
2. Install in a clean temporary project, then run the declared command through `total-recall <command> <subcommand>`. For tasks, verify one due run and its event. For context generators, compile and inspect the resulting block.
3. Exercise failure paths: missing prerequisite, invalid input, timeout, and any network failure. A plugin that installs but cannot do its advertised job is unfinished.
4. Review the plugin's file set before sharing. Plugin code has the recipient's process permissions when run. Never bundle secrets, browser profiles, vault data, or machine-specific paths.

## Share with another user

`total-recall plugin share <id>` marks an installed plugin shareable. Configure `TR_PUBLIC_BASE_URL` as the node's externally reachable HTTPS origin; the command and dashboard then show a direct link ending in `#sha256=<content hash>`. Send that link to the recipient. They install with `total-recall plugin install '<link>'`. The installer requires HTTPS, rejects private destination addresses and redirects, caps the bundle size, and verifies the pinned SHA-256 before writing files. There is no central catalog. The hosting node must actually be reachable at its configured HTTPS origin.

`total-recall plugin unshare <id>` stops serving the bundle. Existing installations remain on recipients' machines. Users on one private mesh may also use `peer:<host>/<id>`; mesh membership is not required for public sharing.
