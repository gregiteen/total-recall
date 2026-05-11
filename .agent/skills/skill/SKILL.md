---
name: skill
description: "Use this skill when managing the Total Recall Skill Ecosystem. MANDATORY: You MUST read the full SKILL.md file before executing."
---

# Agent Skills Architecture (Total Recall Standard)

This is the canonical guide for how AI skills are structured, distributed, and executed within the Total Recall Sovereign OS. Total Recall relies entirely on the local file system (VFS) rather than a database.

## What is a Skill?
A Skill is a standardized, modular package that extends the Intelligence Kernel's (Gemma 4 26B-A4B) capabilities. It is not just an "automated workflow". A skill provides the agent with deterministic instructions, scripts, evaluation criteria, and parallelization structures.

### The Skill Directory Structure
Every fully qualified skill in Total Recall MUST follow this exact directory structure inside `.agent/skills/`:

```text
my-skill/
├── SKILL.md            # Required: The master instruction manual and entrypoint.
├── scripts/            # Optional: Executable automation code (ts, bash, python).
├── references/         # Optional: Static contextual knowledge and documentation.
├── evals/              # Optional: Assertions and tests to verify the skill worked.
└── subagents/          # Optional: Prompts for specialized parallel worker agents.
```

## The Total Recall Skill Lifecycle

In Total Recall, there is no database. All skills are TIER 2 memory nodes residing in `.agent/skills/`.

### 1. `SKILL.md` (The Entrypoint & Progressive Memory)
- Contains YAML frontmatter (`name` and `description`).
- Acts as the master prompt for the skill. 
- **CRITICAL**: Every `SKILL.md` must contain an `<!-- BEGIN INJECTED MEMORY -->` block. The `surface.mjs` compiler uses this block to inject the top 7 relevant memory nodes from the `memory-vault` directly into the skill context.

### 2. `scripts/` (Execution Layer)
- Scripts must be deterministic, idempotent, and self-contained.
- The AI uses these scripts via the Code Mode Sandbox to execute complex logic instead of hallucinating shell commands.

### 3. `references/` (Context Hydration)
- Contains Markdown documents or schemas.
- The AI reads these files ONLY when the specific domain context is needed, saving valuable context window tokens.

### 4. `evals/` (Self-Correction & Testing)
- Scripts or prompt criteria used by the AI or the Frontier API (DeepSeek V4) to verify that the work performed under the skill was successful.

### 5. `subagents/` (Parallelization)
- Defines isolated prompts and tools for spawning parallel subagents when a task is too large for the primary Gemma 4 execution.

## Skill Routing & Discovery (`surface.mjs`)
Since there is no pgvector database, Total Recall uses a hybrid **BM25 + TF-IDF router** located in the OS Daemon (`surface.mjs`) to match user intent against the `description` fields in the YAML frontmatter of all `SKILL.md` files.

When a match is found:
1. `surface.mjs` extracts relevant patterns and invariants from the `memory-vault/`.
2. It compiles these into the `<!-- BEGIN INJECTED MEMORY -->` block of the target `SKILL.md`.
3. The enriched `SKILL.md` is appended to the Gemma 4 prompt context.

## Skill Engineering (P2 Priority)
The Continuous Intelligence scheduler (`task_runner.mjs`) has a dedicated P2 priority for "Skill Engineering". This means the Gemma 4 kernel will autonomously research, draft, and optimize `SKILL.md` files in the background when it encounters recurring tasks or errors.

## The 2-Point Sync Mandate
When modifying the architecture or capabilities of any system, you MUST:
1. Create or update the relevant Skill folder in `.agent/skills/`.
2. Ensure the `SKILL.md` frontmatter accurately describes the new capability so the BM25 router can discover it.

## Automated Skill Optimization Enforcement
To ensure the absolute integrity and capability of the skill ecosystem, the requirement for fully optimized skills is enforced automatically.
1. **Pre-Commit Hook**: The `.husky/pre-commit` hook automatically executes `node .agent/skills/skill/scripts/enforce-skill-optimization.mjs` before any push.
2. **Strict Validation**: The script will reject any commit if a skill is missing its required structure, or if its `evals.json` is empty.
3. **No Empty Stubs**: Automated scans detect placeholder "stub" files. You MUST write bespoke, highly tailored subagents and execution scripts.
