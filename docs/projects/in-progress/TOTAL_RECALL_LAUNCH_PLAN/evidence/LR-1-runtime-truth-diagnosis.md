# LR-1 — Runtime truth: root-cause diagnosis

> **Workstream**: LR-1
> **Date**: 2026-10-24T05:25Z
> **Host**: MacBook (`/Users/gregoryiteen/github/total-recall`), local — **not** a sanctioned Mac mini gate
> **Commit**: `aee2ad0`
> **Status**: Root cause **identified and confirmed**. Not yet remediated.

## Symptom

`total-recall startup check --json` reported `shared_ready: false`, with two conflicts:

```json
"server": { "status": "conflict", "reason": "server-process-unverified" },
"daemon": { "status": "conflict", "reason": "foreign-pid", "source": "local-pid" }
```

## Root cause

**Both conflicts have one cause: stale PID files pointing at processes that belong to a different installation.**

`src/core/startup-health.mjs:36–46` (`processIdentity`) reads a recorded PID, confirms the process is alive, reads its command line, then compares the running script's real path against the expected script for **this** checkout:

```js
matches = Boolean(script) && fs.realpathSync(script) === fs.realpathSync(hint);
return matches ? { status: 'running', pid } : { status: 'conflict', reason: 'foreign-pid' };
```

Measured state:

| PID file | Recorded PID | Alive? | Actually running | Expected by this checkout |
| --- | --- | --- | --- | --- |
| `~/.agent/skills/total-recall/daemon.pid` | `56628` | **Yes** (since Oct 16 01:41) | `~/.local/share/total-recall/runtime/context-optimization/node_modules/total-recall-brain/src/core/daemon-loop.mjs` — **version 3.39.6** | `<checkout>/src/core/daemon-loop.mjs` — version 3.40.7 |
| `~/.agent/skills/total-recall/server.pid` | `25896` | **Yes** | `src/server/index.mjs` (relative path, another installation) | `<checkout>/src/server/index.mjs` |

The daemon has been running for **8 days from a vendored 3.39.6 install** inside a `context-optimization` runtime directory. The checkout is 3.40.7. The paths differ, so the identity check correctly refuses to call it this checkout's daemon.

**This is not a bug in the check.** The check is right: a foreign installation really does hold the lock. Reporting it as healthy would be the defect.

## Consequence

`TOTAL_RECALL_LAUNCH_PLAN_AUDIT.md` C5 recorded that `status` says the daemon is running while `startup check` says conflict. That disagreement is **explained**: `status` reports whether *a* daemon answers; `startup check` reports whether *this installation's* daemon answers. Both are true. The user-visible confusion comes from `status` presenting a liveness answer as a health answer (R7).

## Why it blocks launch

- `shared_ready: false` means gate L1 fails.
- No gate downstream can be trusted while the runtime cannot state which installation is serving.
- A stale foreign daemon will keep answering on the shared port, so an upgraded checkout can appear to work while the old 3.39.6 code actually serves requests. That is the same failure shape as the version skew in C4 and the surface-dir defect in LR-1's inheritance from `SURFACE_COMPILATION_FIX`: **a plausible success report from the wrong process.**

## Fix direction (not yet applied)

1. Stop the foreign daemon (PID 56628) or retire its vendored runtime, so the lock is not held by a superseded installation.
2. Ensure PID files are written per installation, not into the shared `~/.agent/skills/total-recall/` location where any install can overwrite them.
3. Make `status` distinguish *a daemon is live* from *this installation's daemon is live*, and name the installation when they differ (R7).
4. Add a regression test: a PID file whose process runs from a different installation must report `foreign-pid`, never `running` — and `status` must not present it as healthy.

Items 1–4 are open in the tracker. No change was made here: stopping a live daemon is a state change on the operator's machine and belongs in an explicit remediation step, not a diagnosis.

## Evidence commands

```sh
total-recall startup check --json
cat ~/.agent/skills/total-recall/daemon.pid      # 56628
cat ~/.agent/skills/total-recall/server.pid      # 25896
ps -p 56628 -o pid,lstart,command
node -p "require('/Users/gregoryiteen/.local/share/total-recall/runtime/context-optimization/node_modules/total-recall-brain/package.json').version"  # 3.39.6
sed -n '36,46p' src/core/startup-health.mjs
```
