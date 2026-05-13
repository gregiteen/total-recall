---
type: memory
slug: never-run-raw-tsc
category: anti-patterns
title: "Never run raw tsc/eslint/npm-build — use the /code-quality skill scripts"
schema_version: 2
status: active
created: 2026-05-12T23:25:00Z
updated: 2026-05-12T23:25:00Z
last_accessed: 2026-05-12T23:25:00Z
importance: 4
priority: absolute
confidence: 0.99
modality: must_not
subject: agent
predicate: run_raw_typecheck_or_lint
object: total_recall_repo
sentiment_polarity: directive_must_not
sentiment_target: "TypeScript/ESLint verification"
source:
  type: chat
  session_id: total-recall-session-2026-05-12
  agent: claude
  evidence_count: 1
supersedes: []
superseded_by: null
contradicts: []
tags: [tooling, verification, code-quality, lint, typescript]
related: []
routes_to_skills: [code-quality]
decay:
  half_life_days: 365
  access_count: 1
---

# Never run raw `tsc`, `eslint`, `npm run lint`, or `npm run build`

## The Rule

In the total-recall repo, verification of TypeScript and JavaScript MUST go
through the `/code-quality` skill's documented entrypoints, never the raw
compiler or linter:

- TypeScript: `node .agent/skills/code-quality/scripts/start-here-ts.mjs`
- Lint:       `node .agent/skills/code-quality/scripts/start-here-lint.mjs`

The skill itself is described in `.agent/skills/code-quality/SKILL.md`. Its
"CAUTION" block is explicit: never run `tsc`, `eslint`, `npm run lint`,
`npm run typecheck`, or `npm run build` directly.

## Why

- The continuous-checker daemons cache results in JSON files
  (`typescript-fullrepo-errors.txt`, `lint-fullrepo-errors.txt`). Raw `tsc`
  duplicates ~90 seconds of work the daemon is already doing in the
  background.
- Raw runs report differently than the canonical view used by the project
  (worst-files, by-error-type, by-file-pattern), so output is misleading.
- The daemon implements an auto-stop after 3 identical passes to reclaim
  RAM. Bypassing it skips that contract.
- Stale reports are NOT a bug — the `start-here-*` scripts explicitly
  display a "STALE" badge after a recent edit. Trust the badge; do not
  retry with raw tools.

## How to apply

1. Triggered to verify TS or lint? Invoke `/code-quality` (or, when the
   Skill tool doesn't have it in scope, run the documented script above
   directly). Never reach for `npx tsc` or `npx eslint`.
2. If the report is stale, continue with parallel work — do NOT run a raw
   compile to "force a check".
3. If the daemon has auto-stopped, re-trigger by running `start-here-ts.mjs`
   / `start-here-lint.mjs` once. Don't kill or restart the daemon manually.
4. Lint/TS warnings in files you did not touch are out of scope unless the
   user explicitly asks you to clean them up.
