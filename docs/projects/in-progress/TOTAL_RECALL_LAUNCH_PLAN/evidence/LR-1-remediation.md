# LR-1 — Runtime truth: remediation

> **Workstream**: LR-1
> **Date**: 2026-10-24
> **Host**: MacBook, local — **not** a sanctioned Mac mini gate
> **Base commit**: `aee2ad0`
> **Status**: **Gate L1 passes.** Two source defects fixed with regression tests.

## Result

```
$ total-recall startup check --json          # run from /tmp, a neutral directory
{
  "server": { "status": "ready", "version": "3.40.7", "source": "local-verified-listener" },
  "daemon": { "status": "running", "pid": 16322, "source": "local-pid" },
  "brain":  { "status": "ready" },
  "ssss":   { "status": "available" },
  "required_plugins": { "status": "ready", "errors": [] },
  "shared_ready": true,
  "ready": true
}
```

Before: `shared_ready: false`, `server: conflict / server-process-unverified`, `daemon: conflict / foreign-pid`.

## What was actually wrong

The audit's `C5` said `status` and `startup check` disagreed about the daemon. Diagnosis split that into **three** distinct causes — only one of which was a stale process.

### Cause 1 — a superseded installation held the daemon lock (environment, not code)

`launchd` job `com.totalrecall.daemon` ran the daemon from a **vendored 3.39.6** install:

```
/Users/gregoryiteen/.local/share/total-recall/runtime/context-optimization/node_modules/total-recall-brain/src/core/daemon-loop.mjs
```

`com.totalrecall.server`, by contrast, ran `src/server/index.mjs` with `WorkingDirectory` set to this checkout. So the daemon and the server came from **different installations**, and the daemon had been running for 8 days.

`processIdentity` correctly reported `foreign-pid`. The check was not wrong; the environment was.

**Fix**: backed up the plist to `com.totalrecall.daemon.plist.bak-20261023-232803`, repointed `ProgramArguments[1]` and `WorkingDirectory` at this checkout, and reloaded the service. The daemon now runs `/Users/gregoryiteen/github/total-recall/src/core/daemon-loop.mjs` (PID 16322) and reports `running`.

### Cause 2 — process identity depended on the caller's directory (real defect, fixed)

`processIdentity` extracted the script from the recorded command line and called `fs.realpathSync(script)` on it directly. A launch agent starts its program **relative to the service's `WorkingDirectory`**, so the recorded command is `node src/server/index.mjs` — a relative path. Resolving it against the *caller's* cwd meant the same healthy server read as `server-process-unverified` from anywhere except the install root.

Measured before the fix:

```
$ cd /tmp && total-recall startup check --json
{"server":"conflict","sreason":"server-process-unverified", ...}

$ cd <checkout> && total-recall startup check --json
{"server":"ready","sversion":"3.40.7", ...}
```

This is the defect that made readiness a function of where the operator stood.

**Fix** (`src/core/startup-health.mjs`): resolve a relative script against the **process's own cwd**, read via a new `readProcessCwd(pid)` using `lsof -d cwd`. Accept the entry-tail match (the rule `pid-lock.mjs` already uses via `shouldHonorPidLock`) **only when no root could be resolved at all** — so a second installation reachable by the same relative form still reports `foreign-pid` rather than being excused.

### Cause 3 — SSSS was resolved from the caller's directory (real defect, fixed)

```
const candidates = [path.join(cwd, 'ssss'), path.join(cwd, 'node_modules', '.bin', 'ssss')];
```

Outside a repository root neither exists, so `ssss` fell through to the bare name and reported `unavailable`, which alone holds `shared_ready` false (line 204 requires `ssss.status === 'available'`).

**Fix**: also search alongside the installed package (`<packageRoot>/node_modules/.bin/ssss` and `<packageRoot>/../.bin/ssss`) before falling back to PATH.

## Regression tests

Added to `src/core/startup-health.spec.mjs` (5 cases):

| Case | Asserts |
| --- | --- |
| Relative command path resolves against the process cwd | `running` |
| A second installation reached by the same relative form | `conflict` / `foreign-pid` |
| Absolute entry path needs no cwd | `running` |
| Entry-tail corroboration when no root resolves | `running` |
| Dead process | `stopped` |

**Verified to fail against the pre-fix source**: reverting `processIdentity` to the original `fs.realpathSync(script)` comparison produced **2 failures** in the new cases and 19 passes; restoring the fix returned 21 passes.

```
$ npx vitest run src/core/startup-health.spec.mjs src/core/pid-lock.spec.mjs src/cli/doctor.spec.mjs
Test Files  3 passed (3)
     Tests  36 passed (36)
```

## Release propagation (LR-2, partly closed)

The installed CLI was `3.40.4` while npm published `3.40.7`. This was not cosmetic: the **3.40.4 binary returned the wrong health verdict** on a healthy runtime.

```
installed CLI 3.40.4 : server conflict, daemon foreign-pid
checkout   3.40.7     : server ready,    daemon running
```

Three surfaces disagreed about which installation was authoritative:

| Surface | Pointed at |
| --- | --- |
| `npm ls -g` | `total-recall-brain@3.40.4` |
| npm alias | `total-recall@npm:total-recall-brain@3.40.7 -> ./../../../Users/gregoryiteen/github/total-recall` |
| `/opt/homebrew/bin/total-recall` | `../lib/node_modules/total-recall-brain/bin/total-recall.mjs` (3.40.4) |

**Actions**: installed `total-recall-brain@3.40.7` globally, then repointed `/opt/homebrew/bin/total-recall` at the checkout's `bin/total-recall.mjs` so one installation is authoritative — matching the "one current tree" invariant.

**Still open**: per-consumer verification across the fleet (`update --all-brains --apply` reports), the cloud droplet, and independent version checks per surface (R8). Only this machine is verified here.

## Limits

- **Local host only.** No sanctioned Mac mini gate ran. L1 is proven on the MacBook; the release evidence rule requires the mini for a shipping claim.
- The launchd change is **machine state**, not source. Another host can reproduce cause 1 independently.
- `readProcessCwd` adds one `lsof` call per identity probe; failure degrades to the previous behavior rather than blocking.
- Not fixed here: the `ssss`/`server` searches still prefer `cwd` first, which is correct for a project override but means a project-local `ssss` wins. Intended.
