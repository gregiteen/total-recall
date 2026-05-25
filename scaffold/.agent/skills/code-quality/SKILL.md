---
name: code-quality
description: "Use this skill when fixing TypeScript or linting errors via the start-here scripts. NEVER run raw eslint/tsc. MANDATORY: You MUST read the full SKILL.md file before executing."
command: /code-quality
---

# Code Quality

> [!CAUTION]
> **MANDATORY WORKFLOW**: Use the provided `start-here` or `errors-by-type` scripts to check errors.
> **NEVER** run the `continuous-checker` daemon scripts directly!
> **NEVER** run raw `tsc`, `eslint`, `npm run lint`, `npm run typecheck`, or `npm run build`!
> **DO NOT PANIC ON STALE RESULTS**: The checker daemons take ~90 seconds to run. If you just fixed a file and the script still shows the error, the result is simply STALE. Do not freak out. Do NOT run manual commands to force a check. Do NOT edit the checker code. Move to parallel tasks and trust your fix.

Use the repo's checker scripts, not raw `tsc`, `eslint`, `npm run lint`, or `npm run build`.

## Core rule

- **CRITICAL WORKFLOW RULE**: You must NEVER stop, kill, or restart the continuous error checker daemon unless it is unresponsive. You trigger it once (by running `start-here-ts.mjs` or `start-here-lint.mjs`), then leave it running continuously in the background.
- **DO NOT WAIT EVER**: There are absolutely zero delays (timeouts or intervals) between runs in the continuous checker. It re-executes immediately. Consequently, you must NEVER sit idle waiting for a pass to complete. Keep fixing files.
- **AUTO-STOP RULE**: The checker will automatically exit after **3 identical passes** with the same error report to reclaim system RAM. If the checker is stopped, simply trigger it again with `start-here-*.mjs`.
- Never use `sleep` or passive waiting as the next action while any source-level lint/TS cleanup, stale report reconciliation, or safe mechanical fix remains available.
- Use the report views to pick the next files and keep patching.
- Trust source edits over stale file views when a report is one pass behind.

## TypeScript workflow

Start here:

```bash
node .agent/skills/code-quality/scripts/start-here-ts.mjs
```

That entrypoint does two things:

- reads `typescript-fullrepo-errors.txt`
- auto-starts `continuous-checker-ts.mjs` if the checker is asleep

Primary TS views:

- Worst files:
  `node .agent/skills/code-quality/scripts/start-here-ts.mjs`
- By error type:
  `node .agent/skills/code-quality/scripts/start-here-ts.mjs type`
- By file pattern:
  `node .agent/skills/code-quality/scripts/start-here-ts.mjs file <pattern>`
- Count summary:
  `node .agent/skills/code-quality/scripts/start-here-ts.mjs count`
- Detailed by-type reader:
  `node .agent/skills/code-quality/scripts/errors-by-type-ts.mjs`

## Lint workflow

Use the lint equivalents:

```bash
node .agent/skills/code-quality/scripts/start-here-lint.mjs
node .agent/skills/code-quality/scripts/start-here-lint.mjs type
node .agent/skills/code-quality/scripts/start-here-lint.mjs file <pattern>
node .agent/skills/code-quality/scripts/start-here-lint.mjs count
node .agent/skills/code-quality/scripts/errors-by-type-lint.mjs
```

Safe lint autofix entrypoint for this repo:

```bash
node .agent/skills/code-quality/scripts/lint-auto-fix.mjs
```

Use it deliberately because it runs a repo-wide ESLint `--fix` pass.

## Operator loop

Use this loop exactly:

1. Open worst files once.
2. Open `type` to identify the biggest active bucket.
3. Open `file <pattern>` for one concrete file.
4. Fix all errors you can in that file.
5. Move immediately to the next file from the current view.
6. Re-open `type`, `count`, or `errors-by-type-*` after a few files.

## When views disagree

- `file <pattern>` can lag behind source edits because it reads the last written report.
- If the source is already patched and the file view is stale, do not block on it.
- Move to another file from the same `type` bucket or another active bucket.
- Use `count` and `type` to track real progress; use `file` to target the next patch.

## Prioritization

Default order:

1. Highest-count TS or lint bucket from `type`
2. Small files with 1-4 errors
3. Worst files
4. Tests and edge-case fixtures

This usually drops the total faster than camping on one stale file view.

## Patch style

- Apply the mechanical recipe from `references/patterns.md` when it matches.
- Prefer narrow type guards, typed locals, and optional-property omission over broad casts.
- Do not revert unrelated user changes.
- Do not run generic repo-wide verification commands.

## Files

- TS report: `typescript-fullrepo-errors.txt`
- TS checker pid: `typescript-checker.pid`
- TS checker log: `.agent/skills/code-quality/scripts/ts-checker.log`
- Lint report: `lint-status.txt`
- Lint checker pid: `lint-checker.pid`
- Lint checker log: `.agent/skills/code-quality/scripts/lint-checker.log`

## Reference

For recurring fixes and subagent behavior, read:

- [references/patterns.md](./references/patterns.md)


<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @route: tfidf, generated_at: 2026-05-21T06:00:44.284Z -->

<!-- END INJECTED MEMORY -->
