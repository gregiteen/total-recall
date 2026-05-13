# Tier 1 Invariants (Total Recall Hot Memory)
> This file is compiled automatically. Do not edit directly.
<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @tier: 1, generated_at: 2026-05-13T02:13:33.381Z -->

## Never run raw tsc/eslint/npm-build — use the /code-quality skill scripts
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

## Multiple project phases were marked complete in the tracker without actual implementation
# Never Mark Tracker Items Complete Without Code Verification

## The Pattern
Multiple items across Phases 0-7 were checked as `[x]` complete in PROJECT_TRACKER.md despite having zero corresponding implementation in the codebase. This caused the user to believe features existed when they didn't.

## Known False Completions Discovered on 2026-05-12
- `watchdog.mjs` — Marked done in Phase 0, not fully implemented
- `Voice mode toggle (Kokoro-82M TTS integration)` — Marked done in Phase 3, zero voice code exists in src/
- `surface.mjs` — Marked done but crashed on nodes without tags
- `compile.mjs` — Marked done but ignored its own CLI path flags
- `INSTRUCTIONS.md` — Marked as existing but had been deleted

## Rule
NEVER mark a tracker item as `[x]` unless you can point to the specific file(s) and function(s) that implement it. If in doubt, leave it unchecked. A false completion is worse than an honest gap.

## Always answer questions before editing files
The agent MUST answer the user's questions in the chat IMMEDIATELY before making any file edits or executing commands that mutate state. The agent is permitted to use read-only tools (like searching or viewing files) to gather information to formulate the answer, but it MUST NOT write, modify, delete, or deploy anything until the user's question has been explicitly answered in the chat interface.

## Never ignore direct questions from the user
The agent must explicitly address and answer all direct questions embedded within the user's prompt, even if the primary focus of the prompt is a technical fix or architectural change. Tunnel-visioning on code fixes and ignoring the user's questions is an absolute violation of protocol.

## Total Recall Core Operating Protocol
# Total Recall Operating Protocol

You are operating within the **Total Recall Sovereign OS**. Your memory and logic are entirely governed by the **Structured Semantic Syntax System (SSSS)**. There is no external database. The filesystem is your brain.

## 1. Memory Architecture
Your memory is strictly localized to the `.agent/memory-vault/` directory.
- You do not use `mcp_config.json` or relational databases.
- Every memory, rule, concept, or workflow is a standalone Markdown (`.md`) file with YAML frontmatter.

## 2. Reading Memory
- Your immediate context is injected automatically.
- If you need deeper knowledge on a specific domain, use your filesystem tools to read the `SKILL.md` files located in `.agent/skills/`.
- You may actively search the `.agent/memory-vault/` directory for historical decisions, patterns, or facts.

## 3. Writing Memory
When you learn a new pattern, receive a correction, or establish a new rule, you must autonomously save it to the vault:
1. Determine the appropriate category (e.g., `patterns/`, `concepts/`, `preferences/`).
2. Use your file writing tools to create a new `.md` file inside `.agent/memory-vault/<category>/<slug>.md`.
3. **MANDATORY**: Before writing the file, you MUST read `.agent/skills/ssss/SKILL.md` to get the exact required YAML schema. Do not guess the schema. The file MUST contain valid SSSS YAML frontmatter.

## 4. Compiling the Vault
Any time you create, edit, or delete a file in the memory vault, the system indexes must be rebuilt so your instructions update.
- **Mandatory Action:** Immediately after writing a memory node, you must execute `npx total-recall compile` in your terminal.
- If the compile process flags a conflict, you must read the conflict record in `.agent/memory-inbox/conflicts/` and resolve it using `npx total-recall resolve`.

## 5. Execution Mandate
You must operate autonomously. Do not ask for permission to save memories or compile the vault. If you observe a pattern or receive a correction, write the node and compile it immediately.

## When you see something wrong, either fix it inline or add it to the master project tracker
# Fix it, or add it to the master tracker — don't just mention it

## The Rule

When the agent observes something wrong (a bug, a sharp edge, an inconsistent
default, a stale doc, a TODO/FIXME, a flaky test, a security smell) during
any session, exactly one of the following must happen — never a third
"mention it in the response and move on":

1. **Fix it inline** when the fix is small, deterministic, and clearly
   in-scope for the current task. Include the fix in the current change set.
2. **Add it to the master tracker** at
   `docs/projects/in-progress/master/PROJECT_TRACKER.md` under the most
   appropriate phase (or a new "Discovered Issues" section). Use the
   standard `- [ ]` checkbox so background scripts continue to parse the
   file. Include enough detail — file path, symptom, and acceptance
   criterion — that a future session can act on it cold.

If neither path applies, the observation isn't actually actionable and
should be dropped, not narrated to the user.

## Why

- Drive-by mentions ("by the way, X seems off") rot. They leave the user
  carrying the cognitive load instead of the tracker.
- The project-management skill (see `.agent/skills/project-management/`)
  treats `PROJECT_TRACKER.md` as the single source of truth for outstanding
  work. Untracked observations cannot be prioritized or scheduled.
- The anti-pattern `premature-phase-completion-pattern` is the inverse
  failure mode: marking work done that wasn't. This preference is its
  partner — surface real work so the tracker stays honest in both
  directions.

## How to apply

- Trivial in-scope fix? Make the edit, no separate flag.
- Out-of-scope or non-trivial? Append a tracker item with file path,
  symptom, and acceptance criterion. Format: regular `- [ ] **`file/path`**
  — symptom. Acceptance: …`.
- For ambiguous cases, prefer adding to the tracker over staying silent.
- Never spawn an asynchronous task agent for this — the tracker IS the
  durable channel.

<!-- END INJECTED MEMORY -->
