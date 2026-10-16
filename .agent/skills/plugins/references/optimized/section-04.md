## Validate the actual job

1. Validate `plugin.json` against the installed schema and `total-recall plugin info <id>`.
2. Install in a clean temporary project, then run the declared command through `total-recall <command> <subcommand>`. For tasks, verify one due run and its event. For context generators, compile and inspect the resulting block.
3. Exercise failure paths: missing prerequisite, invalid input, timeout, and any network failure. A plugin that installs but cannot do its advertised job is unfinished.
4. Review the plugin's file set before sharing. Plugin code has the recipient's process permissions when run. Never bundle secrets, browser profiles, vault data, or machine-specific paths.

