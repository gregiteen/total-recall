# Tier 1 Invariants (Total Recall Hot Memory)
> This file is compiled automatically. Do not edit directly.
## ⚡ Before You Respond

1. You **MUST** have read every rule below. Violations are tracked and rules that are violated repeatedly are automatically escalated.
2. If your task involves a specific domain, **READ the matching SKILL.md first** (see routing table below).
3. **Search `.agent/memory-vault/`** for relevant past decisions before proposing new approaches.
4. When you learn a new pattern or receive a correction, **write it to the memory vault** and run `npx total-recall compile`.

## 📋 Topic → Skill Routing
If your task involves any of these topics, you MUST read the matching SKILL.md BEFORE responding:

| Topic | Skill File |
|-------|-----------|
| docs | .agent/skills/docs/SKILL.md |
| refactor | .agent/skills/refactor/SKILL.md |
| cli-agents | .agent/skills/cli-agents/SKILL.md |
| code-mode | .agent/skills/code-mode/SKILL.md |
| code-quality | .agent/skills/code-quality/SKILL.md |
| instruction-keeper | .agent/skills/instruction-keeper/SKILL.md |
| mcp-expert | .agent/skills/mcp-expert/SKILL.md |
| notifications | .agent/skills/notifications/SKILL.md |
| project-management | .agent/skills/project-management/SKILL.md |
| push | .agent/skills/push/SKILL.md |
| backup | .agent/skills/push/SKILL.md |
| sync | .agent/skills/push/SKILL.md |
| fork | .agent/skills/push/SKILL.md |
| github | .agent/skills/push/SKILL.md |
| repo-expert | .agent/skills/repo-expert/SKILL.md |
| skill | .agent/skills/skill/SKILL.md |
| ssss | .agent/skills/ssss/SKILL.md |
| test | .agent/skills/test/SKILL.md |
<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @tier: 1, generated_at: 2026-05-19T22:45:39.190Z -->

## 🚫 NEVER: Never run raw tsc/eslint/npm-build — use the /code-quality skill scripts
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

## 🚫 NEVER: Multiple project phases were marked complete in the tracker without actual implementation
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

## Total Recall self-improving loop — the improver improves the improver
## What Total Recall Is

Total Recall is not a static memory file. It is a **continuously self-improving memory OS** powered by a local Gemma 4 26B model running 24/7.

## The Three-Layer Cognitive System

Every memory node belongs to one of three cognitive layers:

- **Conscious** — immediate working awareness: invariants, active preferences, current directives. Compiles into INSTRUCTIONS.md (Tier 1).
- **System 2** — deliberate reasoning: plans, decisions, synthesis, conflict resolution. Validates Research before promoting.
- **Research** — knowledge acquisition: web-backed facts, external evidence, cited observations. Starts as draft, promoted by System 2.

## The Three-Tier Surfacing System

Memory is surfaced progressively:

- **Tier 1** (`INSTRUCTIONS.md`) — hot, always injected, <1000 tokens, `priority: absolute` nodes only
- **Tier 2** (`SKILL.md` files) — semantic routing, top 7 relevant nodes per skill, ~100ms latency
- **Tier 3** (`memory-vault/`) — full knowledge graph, unlimited, accessed on demand

## The Self-Improving Loop

The daemon loop runs continuously. Every 20 task ticks, the dream cycle fires:

1. **Post-mortem engine** — analyzes raw IDE sessions → extracts patterns, facts, skill gaps
2. **Conflict detector** — O(1) SPO ontology check + fuzzy similarity → auto-resolve or quarantine
3. **Dream cycle** — Light Sleep (scan) → REM (score, decay, promote) → Deep Sleep (recompile INSTRUCTIONS.md)
4. **Surface compiler** — BM25 + TF-IDF routing → injects top 7 nodes into each SKILL.md → writes INSTRUCTIONS.md

## The Improver Improves the Improver

Gemma 4 doesn't just improve memory content. It also improves its own improvement engines by scheduling:

- `skill-engineering` tasks → improve `surface.mjs` routing weights, write new SKILL.md files
- `memory-maintenance` tasks → tune decay parameters, prune stale nodes
- `system2-deliberation` tasks → reconsider old decisions with new evidence
- `cutoff-audit` tasks → flag knowledge approaching its knowledge cutoff date
- `clarity-rewriter` tasks → rewrite unclear or stale vault nodes

The system never stops getting smarter. Each iteration produces better memory, which produces better task outputs, which produce better memory.

## Why This Is Superior to Any Other Tool's Memory

| Other tools | Total Recall |
|---|---|
| Static markdown you write manually | Gemma 4 writes and improves it automatically |
| Basic session summaries | 3-cognitive-layer processing with conflict resolution |
| Single memory file | 3-tier hierarchy with semantic routing |
| IDE-siloed memory | Cross-IDE relay: every tool feeds and benefits from one brain |
| Memory stays the same | Memory improves 1000+ times per day at $0 cost |
| No background intelligence | Full autonomous daemon running 24/7 |

## ⚠️ MANDATORY: Always answer questions before editing files
The agent MUST answer the user's questions in the chat IMMEDIATELY before making any file edits or executing commands that mutate state. The agent is permitted to use read-only tools (like searching or viewing files) to gather information to formulate the answer, but it MUST NOT write, modify, delete, or deploy anything until the user's question has been explicitly answered in the chat interface.

## ⚠️ MANDATORY: Never ignore direct questions from the user
The agent must explicitly address and answer all direct questions embedded within the user's prompt, even if the primary focus of the prompt is a technical fix or architectural change. Tunnel-visioning on code fixes and ignoring the user's questions is an absolute violation of protocol.

## ⚠️ MANDATORY: Total Recall Core Operating Protocol
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

## ⚠️ MANDATORY: When you see something wrong, either fix it inline or add it to the master project tracker
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
