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

