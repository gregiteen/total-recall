# Automations

Inspect automation sources, triggers, observed outcomes and source coverage across the Total Recall mesh. Composable CLI remains the owner of reusable commands; a command definition is labelled as a manual definition until an explicit automation binding exists.

```
total-recall automations --help
total-recall automations list --json
total-recall automations list --local --source task-queue
total-recall automations status --node <node>
total-recall automations show <automation-id>
total-recall automations cancel <local-task-id>
total-recall automations dream --all-brains --json
```

Inventory includes plugin schedules, durable tasks, research queue work, daemon maintenance/watchers, SSSS workflow/trigger declarations, reusable composed commands, and operating-system automation declarations. macOS reads user/system launchd definitions and the current user’s crontab. Linux reads installed and loaded system/user timer units and the current user’s crontab. Commands, environment variables, queued payloads and secret values are excluded from OS summaries.

Each source reports its own coverage. A missing integration, unreadable definition, denied peer, offline node or old collector remains explicit. External agent-platform automation providers have no authenticated inventory contract in this runtime and report unsupported; the plugin does not invent their state. Inventory can therefore be partial even when visible automation records are valid.

A declared schedule does not prove a running scheduler. Last handled slot is not a successful run. Observed execution outcomes come from source-owned records/events; unavailable telemetry stays unknown. Individual daemon watcher registration is not reported by the current owner, so those records remain unknown even when the daemon itself is running.

The card and panel use the same CLI contracts. Cancellation requires a pending local durable task and an owner that supports a conditional pending-to-cancelled transition. The plugin checks the saved owner state before reporting success. Older hosts can still inventory automations. Mesh peers use the plugin's local inventory operation and can report incomplete coverage. [Owner acceptance tracker](docs/projects/in-progress/ALL_AUTOMATIONS/ALL_AUTOMATIONS_PROJECT_TRACKER.md)

## Scheduled plugin tasks

This plugin runs the `tasks` every plugin declares in its manifest. Total Recall core has no scheduler of its own: the daemon starts this plugin's `scheduler` module through `runtime.daemon`, and it ships bundled with Total Recall.

- `command` is a subcommand followed by its arguments, so `cleanup --auto --json` runs `cleanup` with `--auto --json`.
- The timeout is the task's `timeout_ms`, else the subcommand's declared `timeout_ms`, else 60 seconds.
- Scheduling runs against the global brain in the home folder, so run records and `plugin.task_run` events are where `list` reads them.
- A failed run logs its reason and the end of its output, and alerts the operator through operator-alerts once per task per day.
- A plugin switched off runs no tasks; a missed slot within the last day runs once; the first run is the first matching slot after the task is first seen.

## Installation and ownership

Use `total-recall plugin install <path-to-this-checkout>` for your own Total Recall workflow. Credentials belong to shared auth. The plugin id and CLI command are `automations`. The package name is `tr-plugin-automations`. The GitHub repository name and folder name change separately.

For an application you ship, `total-recall plugin vendor <path-to-this-checkout>` selects the declared capability. Its `collectSources` export takes explicit source adapters and configuration. The Total Recall CLI wrapper, scheduler and platform accounts are host dependencies.

## Dream and decay

Automations owns one dream task at `40 3 * * *` in each node's local time. Its placement is `per-node`. Its command is `dream --all-brains`. Decay is a phase of dream. It has no separate schedule.

The plugin calls `total-recall dream --all-brains --json` through `spawnSync` with no shell. It checks core's help for `--all-brains` first. Older core versions can ignore unknown flags. The operation fails before execution if core lacks the flag. It also fails for process errors, signals, invalid output and failed brain results. The JSON response reports `exit_code`, `child_exit_code` and `results`. Core must return a nonempty results array, either directly or in a `results` or `brains` field. The child timeout is 30 minutes. The host timeout is 31 minutes.

`list` shows the dream task on each node. It reads the last real outcome from that node's task events. A handled slot stays separate from a real outcome. The cloud daemon must coordinate tasks across the mesh through Automations. This checkout change adds no new transport or deployment. Fleet execution requires a compatible core and an installed plugin on each node.

## Development

`npm test` runs only owner root/UI specs through `vitest.config.mjs`. Injected skill evaluations run independently in their owner and are not Vitest suites. Tests must use isolated/injected state and must not cancel real tasks. Plugin state is derived; persistent source state and controls stay with their owning APIs.

## Using this from an agent

Send questions about what is scheduled here: tasks, triggers and real outcomes across the mesh. A declared schedule does not prove anything ran, so read the outcome. To create a reusable command, use Composable CLI.

```bash
total-recall automations list --json
total-recall automations status --node <node>
total-recall automations show <automation-id>
total-recall automations cancel <local-task-id>
```

Raw commands this plugin owns: `crontab -l` and `launchctl list`.
