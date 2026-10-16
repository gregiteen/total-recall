## 1. Discover before dispatch

1. Read the user's scope and the repository's own instructions, tracker, test and release rules.
2. Run `node <skill-dir>/scripts/inspect-agents.mjs` for PATH discovery and bounded version probes. Additional terminal binaries can be supplied with repeated `--binary NAME`. Use absolute helper paths discovered from this SKILL.md location; do not assume the current working directory is the skill folder.
3. Inspect the installed CLI's `--help` and headless-subcommand help before using its flags. Resolve symlinks and distinguish vendor CLI from a same-name wrapper. In particular, `agy` and an `antigravity` API wrapper are different programs.
4. Keep six separate states: documented, binary discovered, version verified, authenticated, host adapter supported, execution verified. No step silently upgrades another.

Do not auto-install every catalog agent or enable every discovered executable. Follow the user's chosen account/provider restrictions. A blocked metered Google API does not prohibit an independently authorized Google subscription CLI, but it never authorizes switching routes.

