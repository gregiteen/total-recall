# Tier 1 Invariants (Total Recall Hot Memory)
> This file is compiled automatically. Do not edit directly.
<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @tier: 1, generated_at: 2026-05-12T20:09:54.383Z -->

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

<!-- END INJECTED MEMORY -->
