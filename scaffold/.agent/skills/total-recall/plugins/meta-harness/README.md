# Meta Harness

Built-in and validated custom adapters share one plugin. Use `dispatch` or
`route --execute` for agent work. `runtime <agent> ...` accepts supported maintenance
commands such as `codex login status`, `hermes gateway status`, and `dsh models`.
Manage gateway services through their owning plugins. `cli-agents` is an alias
for `meta-harness`.

`total-recall cli-agents setup` connects all nine native instruction surfaces.
The declared setup operation also runs during daemon-owned plugin refresh.
Every dispatched agent receives freshly assembled Total Recall task context and
a preflight receipt. The configured context budget is honored. Complete CLI,
plugin and composed-command inventories are supplied in a private temporary
reference file, keeping their full metadata out of the inline prompt. That file
is removed after execution. Setup failure or an unready context stops dispatch.

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

Check adoption without launching a model:

```sh
total-recall meta-harness adoption --json
total-recall meta-harness adoption --node <recorded-node> --json
total-recall meta-harness adoption --all --json
```

The report separates native login and hook configuration from recent hook
decisions and completed managed runs. Its run evidence is historical; use the
timestamps and last attempt to see whether an agent has since stopped working.
Native hook activity alone does not prove that an agent was launched through
Meta Harness. A fleet report lists offline nodes, missing CLI access, and
installed versions that cannot provide adoption evidence.

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

For remote nodes, supply `execution.cwd` as an explicit absolute workspace. `agent: "direct"` runs the actual installed Total Recall CLI without a model. A remote agent task enters the destination's installed Meta Harness and records its receipt there. Remote access comes from recorded mesh entities and verified SSH configuration; unavailable nodes or binaries produce errors. Secrets are never accepted in an agent prompt. Existing account metadata is inspected without printing credentials or substituting provider API keys.

The four permissions are strict boolean **command-effect admission controls**. They allow or deny the selected plugin command before dispatch. They are not a network policy or an OS sandbox for every action a model might propose. Supported adapter write modes are scoped through the vendor CLI; vendor approval and sandbox defaults stay enabled. The host's authenticated authorization still applies.

The foreground `dispatch --stdin` request accepts `timeoutMs` from 1 to 540000, defaulting to 300000. Use the managed process or background execution commands for longer jobs. A Claude write request can include explicit `allowedTools` rules such as `["Bash(git status *)"]`. Native permission denials surface as failed dispatch receipts. Agent turn completion and command verification are separate fields.

A native login probe reads account metadata. A headless request can still fail if the provider rejects that login. Signed-out and expired Claude subscription sessions produce a failed receipt with `failureKind: "auth"`. Renew the subscription sign-in on the dispatch node and retry a scoped dispatch to verify execution. See [Claude Code authentication](https://code.claude.com/docs/en/iam#renew-an-expiring-login).

### Included usage

Run `total-recall meta-harness included-enforce` to limit this node's managed dispatches to included usage. Use `included-status --probe --json` to see whether Claude has a verified binding and read current Codex allowance without an agent turn. Codex uses the built-in ChatGPT route and requires the signed-in plan to report no paid credit.

Before using `included-bind-claude --stdin`, verify the Max credit grant, key hint and organization in Claude Console. Supply `keyName` (the Total Recall Auth entry), `organization`, the masked `keyHint`, `expiresAt`, `creditSource: "claude-max"`, `paidBalanceCents: 0` and false values for `autoReload`, `paymentMethod` and `invoiced`. The binding expires with the observed grant. Reverify after a key or billing change.

`usage-queue --json` lists deferred jobs. Use `usage-retry <id>` after the reported reset to run a replayable job through the same policy, or `usage-cancel <id>` to cancel it. Review a job marked `needsReview` in the original workspace before resubmitting it. A queued result has `queued: true` and a `queueId` and has not succeeded.

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

## Isolated task workflows

```sh
total-recall meta-harness route "describe the task" --json
total-recall meta-harness route "describe the task" --execute --gate --background --json
total-recall meta-harness coordinate "describe the task" --mode pipeline --execute --gate --background --json
total-recall meta-harness review --staged --author <author-harness> --json
```

Pipeline stages use isolated branches and independent verification. Council
assessments run concurrently; race candidates require a passing deterministic
gate. Failed stages stop subsequent work and clean failed checkouts. Deliverable
branches remain available for review and are never merged automatically. Empty
diffs return `NO_DIFF`; unreadable reviews never become approvals. Unknown login
state requires explicit `--allow-unknown-auth`.

Single-agent remote commands use recorded mesh access and an explicit absolute
workspace. Coordinated isolated work and gates reject unsupported remote placement;
remote worktree/gate transport remains an acceptance gap.

All agent dispatch paths, including agent-mediated plugin commands, append native
SSSS execution receipts. Actual process exit and finish metadata are distinct from
verification results; unavailable model metadata remains null. Thread operations
include list, show, create, update, close and delete, using native SSSS state.

Custom adapter declarations preserve scoped credentials, optional authentication
probes and HTTPS documentation URLs. IDs and paths reject traversal and symbolic
links. Credentials reach only the declaring runner through the auth store. A
changed documentation URL invalidates old cache freshness.

## Hooks in each harness

This plugin owns the adapter for each harness: how a hook call is read, how an answer is written, and where the hook is installed. Total Recall core owns the decision. It warns by default. `total-recall preflight mode` shows or changes that, and shows whether a warning can reach the agent in each harness.

`total-recall preflight install --all` installs the hook for every harness present, and maintenance repeats it. `preflight verify` reports `not wired` for Cline, which runs hooks only from plugin code that has not been built. OpenClaw also runs hooks only from plugin code, so this plugin ships one in `src/gate-adapters/openclaw-plugin/`. The installer copies it to `~/.openclaw/total-recall-gate`, registers it through OpenClaw's own CLI, and reloads it in the running gateway. A written file is not proof that a harness runs it, so check `preflight report` for decisions from a real session.

Codex skips a new hook until you trust it in `/hooks`. Native subagents are never gated.

See `docs/guides/preflight-gate.md` in Total Recall for the full table.

## Verification status

The active five-file suite and evidence live in
`docs/projects/in-progress/META_HARNESS_UNIFICATION/`. Completion requires current
owner/core suites, plugin/scaffold validation, real dashboard inspection and
recorded acceptance evidence. Fixture tests do not certify live accounts, remote
execution or recurring maintenance. The operator requires completing verification
before Meta Harness runs task work.

Cloudroom setup material remains under `cloudroom/`. Its plugin implementation
follows this foundation and requires its own current audit and plan.

### Installed and standalone verification

Use the installed plugin for CLI execution and maintenance. The repository has a pure planning capability under `capability/`. The current manifest does not declare it for vendoring. See the [Meta Harness tracker](docs/projects/in-progress/META_HARNESS_UNIFICATION/META_HARNESS_UNIFICATION_PROJECT_TRACKER.md) for current package, execution and hook acceptance.

## Using this from an agent

Send work here to run it in another agent harness, or to find out which harness should take it. Native subagents are separate and never need this.

```bash
total-recall meta-harness route "<task>" --json
total-recall meta-harness route "<task>" --execute --json
total-recall meta-harness status
total-recall meta-harness docs-search --agent <agent> --query "<terms>"
```

Raw commands this plugin owns: direct harness runs such as `codex exec`, `claude -p`, `agy -p` and `dsh --profile headless`. It also declares the router, so the gate points agents at `route` once per task.
