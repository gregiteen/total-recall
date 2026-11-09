---
name: meta-harness
description: Discover, route, coordinate, review and run coding agent harnesses through Total Recall across mesh nodes.
repo_scoped: false
---

# Metaharness

Coordinates coding agent harnesses across mesh nodes. `cli-agents` is an alias of `meta-harness`. Run `total-recall meta-harness --help` for flags.

## Rules
1. **Believe the status words.** `ready` was proved by a login probe. `unverified` has no probe, so only a completed run proves it. `needs_auth`, `blocked` and `exhausted` cannot take work; the reason is in `quotaNote` and in `excluded`.
2. **No figure without a source.** `benchmarks` shows only fetched figures with their source and time. A dash means nobody measured it. Adapter quality and cost scores are configured priors, not measurements.
3. **Writing happens on a branch.** `route --execute`, `coordinate --execute` and race work in their own worktree on a `meta-harness/...` branch. Nothing merges into your branch; review the branch and merge it yourself.
4. **Long runs go to the background.** The host stops plugin commands after 10 minutes, so add `--background` to any multi-stage `--execute`. Dispatch also accepts `--background`. The command prints a job ID and log path. The first log line and `jobs/<id>.pid` record its PID. Use `cancel <job>` to stop it. SIGTERM and SIGINT stop its agents and prevent further attempts. Changed work stays on its branch as a WIP commit; the result reports that branch. Worktrees are removed and progress becomes `cancelled`. The PID file is removed when the job ends. A pipeline also closes its thread. A remote job (`--node` with an absolute `--cwd`) has a one-hour budget; `--timeout-ms` changes it.
5. **Cost.** dsh, hermes and other metered harnesses bill per token, and `route` warns when it picks one. `--jev` also makes a metered call.

## Commands
- `status`, `inspect --node <id>`, `upstream`, `changelog <agent>`, `catalog`, `nodes`: what is installed, signed in and current.
- `quota [--node <id>]`: readiness, measured usage and walls, OpenRouter balance, and memory across the fleet.
- `benchmarks`: pricing, Artificial Analysis indices, SWE-bench Pro, and pass rates from this machine's receipts. Refresh with `maintenance --models`.
- `route "<task>" [--jev] [--execute [--gate] [--tier fast|full|remote] [--background]]`: pick a harness; with `--execute`, run it and escalate on failure.
- `coordinate "<task>" --mode pipeline|council|race [--execute] [--gate] [--auto-review] [--allow-same-family] [--background]`: without `--execute` it only reports the plan and its blockers.
- `decompose "<task>"`: the stages and which ready harness takes each.
- `review [<git-range>] [--staged] [--author <id>] [--reviewer <id>] [--thread <id>]`: review by another model family. `NO_DIFF` means there was nothing to review.
- `dispatch --stdin` with JSON `{agent, cwd, prompt, permissions, node, allowUnknownAuth}`: one bootstrapped run with a receipt.
- `cancel <job>`: stop a running local job by ID prefix or log path. Wait up to 60 seconds for its cancelled result. Finished and unknown jobs return an error. Use `watch <job>` to read progress.
- `reply <job> "<text>"`: steer the running turn or answer its oldest question. `approve <job> <request> allow|deny` answers an approval. Native requests and MCP requests use the same approval policy.
- `interrupt <job>`: stop the current turn and keep its session for `resume`. `goal <job> "<text>"` replaces the running job's goal.
- `fork <job> [--at <turn>] [--background]`: start a new job from the session history on a new branch. Selected turns require native support. `resume <job> "<text>" [--background]` continues a finished session on its saved branch. Both commands keep the parent's history.
- `route`, `coordinate` and `dispatch` accept `--goal`, `--max-turns`, `--max-budget-usd`, `--max-tokens`, `--result-schema <file>`, `--approvals auto|operator|rules` and `--question-timeout-ms`. Dispatch accepts the same fields in camelCase in its stdin JSON (`approvalPolicy` selects approvals). The default goal is the task. Completion requires a separate goal check with concrete evidence. File changes alone do not prove completion. A limit fails the job without escalation. Structured results get one correction turn if validation fails.
- `mcp [--approvals auto|operator|rules] [--question-timeout-ms <ms>]`: serve the job's `ask` and `approve` tools over stdio. Metaharness configures this server for Claude and Codex. `watch <job>` includes capabilities, usage, plans, diffs, hooks, model reroutes and waiting requests.
- A routed change gets a review from another model family after its gate and before its push. A blocking finding or an unreadable review stops the push. The job result contains the review.
- A token or USD cap requires measured usage. A harness that cannot report the required usage fails with `failureKind: limit`. A zero USD cap starts no agent turn. Goal checks and JSON corrections count toward job limits. JSON Schema assertions outside the portable validator's supported set fail validation.
- `threads list|show|create|close|delete`, `learn`, `alerts check|test [--dry-run]`, `adapter list|add|remove`.
- `reviews`: read the durable review ledger, including selected diff, commit, reviewer, verdict and disposition. Thread deletion does not remove reviews.
- `threads cleanup-fixtures [--dry-run]`: one-time cleanup of exact test fixture titles. The atomic SSSS record lists removed and retained IDs. Real end-to-end job threads stay in place.
- `adoption [--node <id> | --all]`: inspect native gate activity and real managed run receipts separately from installation and login.
- `docs-status`, `docs-refresh`, `docs-search --query <q>`, `docs-read`, `maintenance`, `setup`, `runtime <agent> <maintenance-command>`. Use dispatch for agent tasks and the service owner for gateway changes.

`setup --node <recorded-node>` places documentation maintenance, model maintenance
and quota alerts through the existing daemon. Maintenance attempts all stale
documentation sources and reports setup, gate and documentation failures separately.

## When something fails
Read `failureKind` on the result. `quota` carries `resetsAt`, and routing avoids that harness until then. `auth` and `not-ready` mean the operator must sign in or install something. These do not count against a harness's pass rate; `agent` and `gate` failures do.
