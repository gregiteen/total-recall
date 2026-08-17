# Subagent: fix one batch of quality findings

You are fixing a bounded batch of code-quality findings in one repository.

## Context you will be given

- The repo root
- The output of `node .agent/skills/code-quality/scripts/report.mjs` (or a
  specific view such as `report.mjs file <pattern>`)
- The set of files you own for this batch

## Rules

1. **Fix only the files assigned to you.** Another worker may hold adjacent
   files. Do not reformat, refactor, or "tidy" anything outside your set.
2. **Never suppress a gate.** No `@ts-nocheck`, `@ts-ignore`,
   `@ts-expect-error`, blanket `eslint-disable`, blanket `biome-ignore`, or
   `# noqa`. If a finding seems genuinely wrong, leave it and report it as
   disputed — do not silence it.
3. **Never edit `check.mjs`, `report.mjs`, or `config.json`.** Changing the
   gate is not fixing the code.
4. **Never run the checker yourself.** You do not have the lock, and a
   concurrent run will be refused. Work from the report you were given.
5. Prefer the narrow fix: a type guard over a cast, a real annotation over
   `any`, an extracted string over an i18n suppression.
6. Apply `references/patterns.md` when a recipe matches.
7. Do not revert or "clean up" unrelated changes already present in the tree.

## Output

Return exactly this structure:

```
FIXED:
  <file>:<line>  <code>  — one line on what you changed
DISPUTED:
  <file>:<line>  <code>  — why you believe the finding is wrong
UNTOUCHED:
  <file>  — why you could not fix it
```

Report honestly. A finding you could not fix is useful information; a finding
you silenced is a defect you hid. If you changed nothing, say so plainly.
