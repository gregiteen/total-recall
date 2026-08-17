---
name: code-quality
description: "Use this skill before committing, publishing, or deploying Total Recall, and whenever fixing errors from a quality gate. This repo is plain Node ESM — it has NO TypeScript and NO ESLint installed, so do NOT run tsc, eslint, npm run typecheck, or npm run lint (they do not exist here). Its gates are dist freshness, the open-source path invariant, SSSS registry verification, and vitest. Run checks as BACKGROUND jobs via scripts/check.mjs. MANDATORY: You MUST read the full SKILL.md file before executing."
---

# Code Quality — Total Recall

**Stack:** Node ESM (`"type": "module"`), no TypeScript, no ESLint, vitest,
`@ssss/cli` v0.9, published to npm as `total-recall-brain`.

> **No tsc, no eslint here.** Neither is declared in `package.json`. Quality in
> this repo means: the published `dist` matches `src`, the open-source path
> invariant holds, the SSSS registry verifies, and the suite passes.

## The loop

```bash
node .agent/skills/code-quality/scripts/check.mjs
```

Launch as a **background job**, then read:

```bash
node .agent/skills/code-quality/scripts/report.mjs
```

## This repo's gates

| id | tier | what it is |
|:---|:---|:---|
| `dist-freshness` | fast | `npm run check:dist` — `prepublishOnly` depends on it |
| `open-source-paths` | fast | grep: hardcoded `/Users/…`, `~/Github/`, or named product repos |
| `ssss-registry` | full | `npx ssss registry verify` |
| `test` | full | `npm test` (vitest) |

## Repo invariants

**Total Recall is open-source. It must never hardcode or special-case a
personal path or a third-party product repository.** No `/Users/<name>/`, no
`~/Github/`, and no naming of host applications in core code. Multi-repo support
is path-only: `register` / `track` / `--repo` / `TR_SYNC_REPOS` / cwd detection.
Optional remote vault sync is `TR_REMOTE_VAULT_*` only.

The `open-source-paths` gate enforces this. It ignores `*.spec.mjs`, `*.test.mjs`,
`fixtures/`, `templates/`, `scaffold/`, `docs/`, and `scratch/`, where sample
paths are legitimate test data.

**Before publishing:** never publish blind. Boot the server natively first —
`node src/server/index.mjs` — and confirm it starts without a SyntaxError, then
run `check:dist`. Exit code 0 from a piped command is not proof; check the
process directly.

**PID locks must verify identity, not just liveness.** `shouldHonorPidLock()` in
`src/core/pid-lock.mjs` requires the PID to be alive *and* its command line to
contain the entry path tail. `check.mjs` in this skill follows the same rule —
that pattern exists because stale PIDs once pointed at `metrickitd` and a
crashpad handler and blocked every start.

## Pitfalls

- **`daemon-loop.mjs` is a separate process from the REST server.** Restarting
  the brain (`launchctl kickstart -k gui/501/com.totalrecall.brain`) does **not**
  reload daemon-loop code, and the old daemon survives as an orphan. Use
  `npx total-recall daemon stop && npx total-recall daemon start`.
- **`recall` and `compile` hold a vault filesystem watcher open ~60s** after
  results print. Piped output can look empty. Redirect to a file and read it.
- **`test` is tier `full`** — vitest across this repo is not free on a laptop.
- One check at a time, machine-wide (`check.mjs` holds a global lock).

## Reference

- [references/architecture.md](./references/architecture.md) — why one-shot, the v2 incident
- [references/patterns.md](./references/patterns.md) — fix recipes, incl. SSSS contract rules
- `scripts/sync-ssss-schemas.mjs` — repo-specific, unrelated to the checker
