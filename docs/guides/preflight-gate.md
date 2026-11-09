# The preflight gate

The gate is a hook that runs before each tool call in your agent harness. It takes about 0.1s per call.

## What it requires

An agent must read the current rules before it starts work. It reads the context capsule, then runs:

```bash
total-recall tr-preflight --ack --task "<task>" --action read,edit,test
```

Without this receipt, working tools are denied. There is no setting to turn this off, and the commands that satisfy it are always allowed, so the gate cannot lock out its own repair.

Each session has to do this for itself. Where the harness sends a session id, another agent's receipt in the same repository does not count. Subagents and runs started by Metaharness are treated as delegated and are not stopped. In a harness that gives a subagent its own unlinked session, a new session counts as delegated for one receipt window after an acknowledged session starts a subagent, so an unrelated agent starting in that repository during the window also passes.

## When work goes around a plugin

Two more checks steer work toward the plugin that owns it:

- **Owned commands.** A plugin can declare raw commands it owns. For example, `git-sentinel` owns `git status`.
- **Routing.** A plugin can declare itself the router for tasks. Metaharness does.

Each one has a mode:

| Mode | What happens |
| --- | --- |
| `off` | Nothing. |
| `warn` | The call runs, and the agent is told which command to use. This is the default. |
| `enforce` | The call is blocked, as long as the plugin works. |

If a plugin fails its health check, `enforce` falls back to a warning, so a broken plugin cannot trap an agent. Routing warns once per receipt. Owned commands warn each time. Native subagents are never gated.

```bash
total-recall preflight mode
```

```bash
total-recall preflight mode enforce --plugin git-sentinel
```

```bash
total-recall preflight mode off --router --repo
```

`--repo` applies to the current repository and takes priority over the machine setting. `clear` in place of a mode removes a setting. Settings are stored in `config/gate.json` in each brain. A file that cannot be read counts as unset. Anyone who can edit that file can change the mode, so treat `enforce` as a guard rail for agents, not a security boundary.

## Installing

`total-recall init` and `total-recall update --all-brains --apply` set up every harness present on the machine, so there is nothing to configure by hand. Installing never changes or removes an existing memory file. The release check `npm run check:harness-install` proves both from a packed install: it runs `init` on an empty home, confirms each hook is in place and answers, then repeats every install path and compares each vault file byte for byte.

## Harness support

`total-recall init` and `total-recall update --all-brains --apply` install the hook for each harness present on the machine, and Metaharness maintenance keeps it installed. `total-recall preflight mode` shows whether a warning can reach the agent:

| Harness | Hook location | Warning reaches the agent through |
| --- | --- | --- |
| Claude Code | `~/.claude/settings.json` | `additionalContext` |
| Codex | `~/.codex/hooks.json` | `additionalContext` |
| Antigravity | `~/.gemini/config/hooks.json` | `reason` |
| Pi | `~/.pi/agent/extensions/total-recall-preflight.ts` | `pi.sendMessage` |
| Cursor | `~/.cursor/hooks.json` | `agent_message`, unconfirmed on an allowed call |
| DSH | `hooks/hooks.json` in `~/.dsh` or `$DSH_HOME`, mounted by that folder's `cordis.patch.yml` | `additionalContext`, after the tool runs |
| OpenClaw | The `total-recall-gate` plugin in `~/.openclaw/total-recall-gate`, registered through `openclaw plugins install` | Tool-result middleware, appended to that tool's output |
| Hermes | `~/.hermes/config.yaml` | None documented |
| Devin | `~/.config/devin/config.json` | None documented |
| Grok Build | `~/.grok/hooks/total-recall-preflight.json` | None documented |

Where no warning field is documented, a warned call still runs and is recorded in `total-recall preflight report`, but the agent is not told.

Cline is not wired: it runs hooks only from plugin code, and no plugin has been built.

OpenClaw blocks a call when a hook throws or times out, so its plugin holds the gate's repair rule itself. If the gate cannot run, work stays denied, while reading, plain Total Recall commands and changes inside Total Recall's package stay open. `openclaw plugins disable total-recall-gate` is always available to an operator, because it belongs to OpenClaw. The next install or update turns the gate back on.

`total-recall uninstall` takes the gate out of every harness, so no hook outlives Total Recall. Nothing else removes it.

Some harnesses ask you to approve a new hook once. In Codex, open `/hooks`. Hermes asks on first use, unless `hooks_auto_accept` is set.
