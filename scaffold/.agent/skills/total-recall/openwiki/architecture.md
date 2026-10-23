# Architecture (this brain)

Describe the systems this brain cares about: repos, stacks, deploy targets.

Project brains should document the local codebase; the global brain documents cross-repo identity and preferences.


## CLI inventory and required auth (3.40.2)

`src/core/cli-commands.mjs` owns the built-in routing inventory. Compiled shims start with that inventory, every installed plugin operation and composed commands before rules, startup prose and preserved authored content. Frontmatter remains first for clients that parse it.

Credentials use the auth plugin exclusively. Removed top-level names cannot fall through into generic API discovery. Bundled plugins resolve under scaffold/.agent/skills/total-recall/plugins. `required-plugins.mjs` validates the native auth manifest, handler and declared runtime files without opening credential state. Bootstrap seeds absent auth; readiness and fleet updates report missing or invalid auth as failure. Existing credential data is preserved.
