# TR_CORE_PLUGIN_SPLIT — Instruction surface directory audit

> **Project Prefix**: `TR_CORE_PLUGIN_SPLIT`
> **Kanban State**: In Progress
> **Date**: 2026-10-16
> **Author**: Claude (DeepSeek Harness)
> **Scope**: TR-003 "Actual offline/authenticated memory and instruction workflow"

## 1. Summary

TR-003 is checked off in the tracker as complete. It was not complete. The
instruction surface could be written to a directory no harness reads, and for
the project layer it **was** being written there. Every affected command still
reported success, so the failure was invisible from exit codes, logs, and the
project's own "0 drift" verification.

Three call sites are fixed and pushed (`e876d12`, `bcd2798`, release `8c6c53e`).
**Ten or more further call sites still derive the surface path independently**
and are unaudited. This document is the current-state record for that work, and
was written after the fix rather than before it — which is itself the process
defect: the reactive fix landed first.

## 2. Root cause

An instruction surface belongs at the **workspace root**, and the workspace root
is not the same directory as the brain.

| Layer | Brain / agent dir | Surface (what harnesses read) |
| --- | --- | --- |
| global | `~/.agent` | `~/.agent/INSTRUCTIONS.md` |
| project | `<repo>/.agent` | `<repo>/INSTRUCTIONS.md` |

For the global layer the two coincide. For a project they differ by one level,
and that difference is the bug. Code that derives the surface from the agent
directory is correct for global and wrong for project — and because `.agent` is
a legitimate, existing directory, the write succeeds. Nothing fails. The file
simply lands where no harness looks.

Two variants were observed, both producing a silent no-op:

1. **Relocation to the parent.** `compilePointers` stripped a trailing `.agent`
   unconditionally, so the global brain — whose agent dir *is* `~/.agent` —
   resolved to `$HOME` and wrote `~/INSTRUCTIONS.md` for months. The file the
   harness reads, `~/.agent/INSTRUCTIONS.md`, stayed frozen at 2026-05-25.
2. **Burial in a nested `.agent`.** Project callers passed
   `<repo>/.agent/INSTRUCTIONS.md`, so client shims went to
   `<repo>/.agent/AGENTS.md`. The real `<repo>/INSTRUCTIONS.md` never changed.

Both reported `✅ Post-build verification passed: 0 drift` and exited `0`.

## 3. Why the checks did not catch it

- **Drift detection compares vault to index, not surface to harness expectation.**
  The vault and derived indexes were genuinely consistent, so "0 drift" was true
  and irrelevant.
- **Tests asserted the bug.** `rebuild.spec.mjs` required
  `/repos/app-one/.agent/INSTRUCTIONS.md`. Six tests in `plugin-catalog.spec.mjs`
  and `plugin-activation.spec.mjs` were failing on `main` for this reason and had
  been treated as pre-existing.
- **A comment recorded the defect as intent.** `daemon-loop.mjs:40` reads
  "Surface shims resolve from the agent root (.agent/), not brainDir" — asserting
  the wrong rule in the voice of a documented decision.

## 4. Fixed in this session

| Commit | Change | Verification |
| --- | --- | --- |
| `e876d12` | `plugin-store.mjs` picks the surface dir per layer | 6 previously failing tests now pass |
| `bcd2798` | `resolveSurfaceDir`/`resolveInstructionsFile` added to `agent-dir.mjs`; `rebuild.mjs` (both paths) uses them | new tests pin both layers; reverting fails them |
| `8c6c53e` | release 3.39.6 | full suite 349 files / 2148 tests |

Live disk state after the fix: global surface in `~/.agent`, workspace and
`total-recall` surfaces at their repo roots, nothing nested in `.agent/`, nothing
stray in `$HOME`, and a fresh `init --project` in a temp directory behaves
correctly with the installed CLI.

## 5. Remaining call sites (unaudited)

These build a surface path independently. Each needs the same classification:
is it writing a surface, and if so for which layer?

| File | Line | Current derivation | Assessment |
| --- | --- | --- | --- |
| `src/core/auto-compile.mjs` | 25 | `path.join(resolvedAgentDir, 'INSTRUCTIONS.md')` | **Same bug.** Must use `resolveSurfaceDir`. |
| `src/core/daemon-loop.mjs` | 40 | `AGENT_DIR` + `INSTRUCTIONS.md` | **Same bug**, and the comment asserts it. |
| `src/core/dream.mjs` | 599 | `path.join(agentDir, 'INSTRUCTIONS.md')` | Needs layer check. |
| `src/core/fact-seeker.mjs` | 1314 | `path.join(getAgentDir(), 'INSTRUCTIONS.md')` | Needs layer check. |
| `src/core/runtime.mjs` | 161-170 | tries four candidate paths in order | Investigate: may already compensate. |
| `src/core/protect-instructions.mjs` | 37 | `path.join(process.cwd(), 'INSTRUCTIONS.md')` | Root-based; likely correct for project. |
| `src/server/api.mjs` | 28, 529 | module-level `AGENT_DIR` const | Global daemon; verify it never serves a project. |
| `src/server/index.mjs` | 450 | `configBrainDir` + `INSTRUCTIONS.md` | Needs layer check. |
| `src/server/routes/graph.mjs` | 288 | serves a named surface | Reader, not writer. Confirm. |
| `src/core/emergency-alerts.mjs` | 8 | scans shim files | Reader. Confirm. |

`src/core/config.mjs:240` already computes `projectRoot` and discards it, which
is the same information `resolveSurfaceDir` now owns. It should not keep a second
copy of the rule.

## 6. Acceptance criteria — ALL MET (2026-10-16)

- [x] Every writer uses `resolveSurfaceDir`/`resolveInstructionsFile`; no module
      derives a surface path from an agent dir. 20 call sites across 21 files;
      the final sweep returns none. (`71a71e4` and predecessors.)
- [x] `config.mjs` stops computing a second, divergent `projectRoot`. The two
      `detectProjectBrain` implementations are consolidated into one and the CLI
      delegates. (`71a71e4`)
- [x] `daemon-loop.mjs`'s incorrect comment is replaced with the layer rule, and
      its `INSTRUCTIONS_FILE` resolves through `detectProjectBrain()`.
      (`4a63d12`, `71a71e4`)
- [x] A test asserts, for both layers, that the surface lands where the harness
      reads it — not merely that a file was written. Each new test was verified
      to FAIL against the old code.
- [x] `rebuild` fails loudly when no surface is written, instead of printing
      "0 drift" over a frozen file. Verified live. (`71a71e4`)
- [x] TR-003 is re-opened and tracked against the above.

**Honest gap:** a general "surface is stale relative to the vault over time"
doctor check was NOT built. What exists is a post-compile assertion that the
surface was written and is non-empty, which closes the specific silent no-op
this audit found. A staleness-over-time check remains a real improvement and is
not claimed here.

## 6b. Leader topology (found while verifying; not in the original scope)

The mini followed `TR_LEADER_IP=100.64.0.1` and logged `Failed to sync granted
secrets` on every boot. The leader was reachable the whole time on port 3900.
Three defects, all fixed and verified: `getLeaderInfo()` dropped `brain_port`;
`secrets-sync` assumed port 3000; and `getLeaderInfo()` read raw Tailscale
status via `getMeshPeers()`, where `brain_port` never appears because it is an
ENTITY variable. It now uses `listEnrichedMeshNodes()`. (`063362f`, `736048d`)

Verified with the daemon's own environment: `getLeaderInfo()` returns
`brain_port: 3900`, `isLeader()` is false so the sync does not early-return,
`syncGrantedSecrets('100.64.0.1', { port: 3900 })` completes without throwing,
and the daemon has logged zero secrets-sync failures since restarting on this
build where every prior boot logged one.

Also removed: the daemon runtime dependency resolved to `/tmp/packcheck/…tgz`,
a path macOS clears. It now points at the stable `releases/` directory.

## 7. Test path

1. Fresh temp dir, `init --project`, `compile`; assert `INSTRUCTIONS.md` at the
   project root and **absent** from `.agent/`.
2. `rebuild --global`; assert `~/.agent/INSTRUCTIONS.md` and an absent
   `$HOME/INSTRUCTIONS.md`.
3. Install a plugin with `clients.json` naming `codex`; assert `AGENTS.md` is a
   sibling of `INSTRUCTIONS.md`, not inside `.agent/`.
4. Before/after mtime and byte count on a real project surface across one
   `compile`, asserting the mtime actually advanced.

## 8. Notes

- The project `SURFACE_COMPILATION_FIX` is in `completed/` and its Phase 3 claims
  "Fix `clients.json` path resolution" and "Symlink `AGENTS.md` and `GEMINI.md`
  to `INSTRUCTIONS.md`". Those symlinks were created inside `.agent/`, which is
  why the completion did not hold. That tracker should be corrected rather than
  left to imply the area is closed.
- `dashboard.spec.mjs` failed once under full-suite load and passed in isolation,
  in the server suite, and on a full re-run. Recorded as an unexplained flake,
  not as fixed.
