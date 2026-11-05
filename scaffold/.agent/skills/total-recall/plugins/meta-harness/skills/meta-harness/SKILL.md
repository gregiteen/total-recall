---
name: meta-harness
description: Discover, route, coordinate, review and run coding agent harnesses through Total Recall across mesh nodes.
repo_scoped: false
---

# Meta Harness

Coordinates coding agent harnesses across mesh nodes. `cli-agents` is an alias of `meta-harness`. Run `total-recall meta-harness --help` for flags.

## Rules
1. **Believe the status words.** `ready` was proved by a login probe. `unverified` has no probe, so only a completed run proves it. `needs_auth`, `blocked` and `exhausted` cannot take work; the reason is in `quotaNote` and in `excluded`.
2. **No figure without a source.** `benchmarks` shows only fetched figures with their source and time. A dash means nobody measured it. Adapter quality and cost scores are configured priors, not measurements.
3. **Writing happens on a branch.** `route --execute`, `coordinate --execute` and race work in their own worktree on a `meta-harness/...` branch. Nothing merges into your branch; review the branch and merge it yourself.
4. **Long runs go to the background.** The host stops plugin commands after 10 minutes, so add `--background` to any multi-stage `--execute`. It prints a log path that receives the final JSON, and a pipeline also records a thread. Stopping a run stops its agents and removes its worktrees, unfinished branches and open thread. A remote job (`--node` with an absolute `--cwd`) has a one-hour budget; `--timeout-ms` changes it.
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
- `threads list|show|create|close|delete`, `learn [--emit]`, `alerts check|test [--dry-run]`, `adapter list|add|remove`.
- `docs-status`, `docs-refresh`, `docs-search --query <q>`, `docs-read`, `maintenance`, `setup`, `runtime <agent> <args>`.

## When something fails
Read `failureKind` on the result. `quota` carries `resetsAt`, and routing avoids that harness until then. `auth` and `not-ready` mean the operator must sign in or install something. These do not count against a harness's pass rate; `agent` and `gate` failures do.
