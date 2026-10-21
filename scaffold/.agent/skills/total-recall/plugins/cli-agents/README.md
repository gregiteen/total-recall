# Command Fleet

All nine adapters share one plugin: Claude Code, Codex, Antigravity, Cursor,
DSH, Grok, Muse, Pi and Hermes. `runtime <agent> ...` exposes their native runtime
commands; DSH observations and Hermes gateway management live here as well.

`total-recall cli-agents setup` connects all nine native instruction surfaces.
The declared setup operation also runs during daemon-owned plugin refresh.
Every dispatched agent receives a freshly checked Total Recall context, complete
core help, installed plugin operations and composed commands. Setup failure or
an unready context stops dispatch.

`docs-refresh`, `docs-ensure`, `docs-status`, `docs-read` and `docs-search` manage
downloaded official documentation rather than a list of links. Content is hashed,
bounded and refreshed after 24 hours. Maintenance uses the existing Total Recall
daemon's plugin task, refreshing one stale adapter per run. Failed pages remain
visible as failures and cannot certify complete coverage; successful cached
content remains readable. `setup --node <recorded-node>` selects maintenance
placement without creating a second scheduler.

Standalone Total Recall owner for CLI-agent discovery and explicit mesh command execution. Install with `total-recall plugin install <path-or-private-git-url>`. Installation rebuilds the plugin inventory, CLI library and connected instruction surfaces. No model account is created or selected automatically.

```sh
total-recall cli-agents catalog --json
total-recall cli-agents nodes --json
total-recall cli-agents inspect --node <recorded-node> --json
total-recall cli-agents run-command --stdin --json < request.json
```

`request.json` selects one installed plugin operation, its literal arguments, a node and an agent:

```json
{
  "pluginId": "git-sentinel",
  "subcommand": "status",
  "args": [],
  "execution": {
    "agent": "codex",
    "node": "local",
    "permissions": { "read": true, "write": false, "send": false, "destructive": false }
  }
}
```

For remote nodes, supply `execution.cwd` as an explicit absolute workspace. `agent: "direct"` runs the actual installed Total Recall CLI without a model. Remote access comes from recorded mesh entities and verified SSH configuration; unavailable nodes or binaries produce errors. Secrets are never accepted in an agent prompt. Existing account metadata is inspected without printing credentials or substituting provider API keys.

The four permissions are strict boolean **command-effect admission controls**. They allow or deny the selected plugin command before dispatch. They are not a network policy or an OS sandbox for every action a model might propose. Supported adapter write modes are scoped through the vendor CLI; vendor approval and sandbox defaults stay enabled. The host's authenticated authorization still applies.

A completed model turn is distinct from a completed plugin operation. Structured results return `commandExecutionVerified: false` for agent turns; only direct CLI execution returns a command exit receipt. Muse preserves its actual headless JSONL log and documented process exit status rather than treating session-protocol notifications as headless output. Do not infer working accounts, provider delivery or successful mutations from discovery or fixture tests.

## Primary contracts checked 2026-10-14

| Adapter | Contract |
| --- | --- |
| Claude Code | [Headless](https://code.claude.com/docs/en/headless) |
| Codex | [Non-interactive mode](https://developers.openai.com/codex/noninteractive) |
| Antigravity | [Headless CLI](https://antigravity.google/docs/cli/headless/) |
| Cursor | [CLI parameters](https://docs.cursor.com/en/cli/reference/parameters) |
| DSH | [Official CLI source](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md) |
| Grok | [Headless scripting](https://docs.x.ai/build/cli/headless-scripting) |
| Muse | [Headless and CI](https://dev.meta.ai/docs/muse-code/extending) |
| Pi | [Official CLI reference](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/cli.md) |
| Hermes | [Official command reference](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md) |

Cursor discovery uses `cursor-agent`; an ambiguous `agent` binary is not assumed to be Cursor. Missing installations are listed as unavailable. Unknown authentication requires explicit agent selection and remains unverified until a real run. Tests exercise literal stdin, bounded child-process cleanup, command admission, recorded SSH access, account checks and completed-result parsing. Run suites on the configured sanctioned test node.
