---
name: tr-skill
provenance: total-recall
description: "Use this skill when creating, auditing, or modifying any skill in the .agent/skills/ ecosystem. MANDATORY: You MUST read the full SKILL.md file before executing."
---

# Skill Architecture — Canonical Format Guide

> **Version:** 2.0.0 | **Updated:** 2026-05-11

This is the definitive guide for how skills are structured, created, and maintained. Every agent that creates or modifies a skill MUST follow this spec exactly.

---

## 1. What is a Skill?

A skill is a **self-contained knowledge package** that lives in `.agent/skills/<skill-name>/`. It gives an agent everything it needs to perform a specific domain task correctly: instructions, executable scripts, reference material, test criteria, and delegation prompts.

Skills are NOT documentation. They are **executable expertise.**

---

## 2. Required Directory Structure

Every skill MUST contain these items. No exceptions.

```text
my-skill/
├── SKILL.md              # REQUIRED — The master instruction file
├── scripts/              # REQUIRED — Automation scripts
├── references/           # REQUIRED — Domain knowledge, specs, docs
├── evals/                # REQUIRED — Success criteria and tests
└── subagents/            # REQUIRED — Delegation prompts for subtasks
```

### Why all five are required

Agents will skip optional folders without a second thought. By requiring all five, we force the agent to **stop and think** about what belongs in each one. Even a hastily written eval or a minimal reference doc is infinitely more valuable than nothing — it can always be improved later.

---

## 3. SKILL.md — The Entrypoint

### Frontmatter (REQUIRED)

```yaml
---
name: my-skill-name
description: "Use this skill when [TRIGGER CONDITION]. MANDATORY: You MUST read the full SKILL.md file before executing."
---
```

| Field | Rules |
|:---|:---|
| `name` | **Lowercase kebab-case.** Must exactly match the folder name. |
| `description` | **Trigger-optimized.** Must clearly state WHAT it does and WHEN to use it. Under 1024 chars. The IDE uses this string to decide when to show the skill — vague descriptions mean the skill never gets activated. |

### ⛔ Frontmatter Anti-Patterns

```yaml
# ❌ WRONG — SSSS memory node fields. Skills are NOT memory nodes.
type: skill
slug: my-skill
category: architecture
title: "My Skill"
schema_version: 2
importance: 4
```

```yaml
# ✅ CORRECT — only name + description
name: my-skill
description: "Use this skill when doing X. MANDATORY: You MUST read the full SKILL.md file before executing."
```

### Body Content

The body of SKILL.md is the **master prompt** for the skill. Write it as procedural instructions that an agent can follow step-by-step. Include:

- **Context** — What problem does this skill solve?
- **Steps** — Numbered, concrete actions
- **Rules** — Hard constraints and invariants
- **Pitfalls** — What goes wrong and how to avoid it
- **Code examples** — Correct and incorrect patterns
- **References** — Pointers to files in `references/` for deeper context

---

## 4. scripts/ — Execution Layer

Contains executable code the agent runs via the sandbox to perform complex or deterministic operations.

**What belongs here:**
- Scaffolding scripts (e.g., `create-skill.sh`)
- Validation/linting scripts (e.g., `enforce-skill-optimization.mjs`)
- Watchers and cron-triggered automation (e.g., `watch.mjs`)
- Data transformation or migration scripts
- Any operation that should be deterministic rather than LLM-hallucinated

**Rules:**
- Scripts MUST be idempotent where possible
- Scripts MUST be self-contained (no implicit dependencies outside the skill)
- Scripts MUST handle errors gracefully with clear stderr output
- Use `console.error()` for logging, never `console.log()` in production scripts

**When creating a skill, ask yourself:** *"What operations in this domain should be automated with code instead of trusted to the LLM's judgment?"*

---

## 5. references/ — Domain Knowledge

Contains static reference documents the agent reads for context when the skill is activated.

**What belongs here:**
- API documentation or spec excerpts
- Schema definitions
- Configuration format guides
- Architecture decision records
- Links to external sources with cached key sections
- Example files or templates

**Rules:**
- Use Markdown (`.md`) files for text documentation
- Keep files focused — one topic per file
- Name files descriptively: `streamable-http-spec.md`, not `ref1.md`
- Include the source URL at the top of any extracted documentation

**When creating a skill, ask yourself:** *"What does an agent need to READ to understand this domain? What docs did I have to look up?"*

---

## 6. evals/ — Success Criteria

Contains assertions, test scripts, or evaluation criteria that verify the skill was executed correctly.

**What belongs here:**
- `evals.json` — Structured assertions (minimum 3)
- Test scripts that can be run in the sandbox
- Checklists of things to verify
- Expected output examples

**evals.json format:**
```json
[
  {
    "name": "frontmatter-has-name",
    "assertion": "SKILL.md YAML frontmatter contains a 'name' field",
    "severity": "error"
  },
  {
    "name": "description-is-trigger-optimized",
    "assertion": "description field starts with 'Use this skill when'",
    "severity": "warning"
  },
  {
    "name": "no-empty-directories",
    "assertion": "All required directories contain at least one non-.gitkeep file",
    "severity": "error"
  }
]
```

**When creating a skill, ask yourself:** *"How would I know if this skill was used correctly? What could go wrong? What should I check?"*

---

## 7. subagents/ — Delegation Prompts

Contains standalone prompt files for subtasks that can be delegated to parallel agents or focused workers.

**What belongs here:**
- Audit prompts (e.g., `audit-all-skills.md`)
- Review prompts (e.g., `review-output.md`)
- Specialized generation prompts (e.g., `generate-tests.md`)
- Decomposed subtask prompts for complex workflows

**Rules:**
- Each file is a complete, self-contained prompt
- Include role, context, constraints, and expected output format
- Name files as verbs: `audit-X.md`, `generate-Y.md`, `validate-Z.md`

**When creating a skill, ask yourself:** *"What parts of this task could be delegated to a focused subagent? What parallel work would speed this up?"*

---

## 8. Creating a New Skill

### Quick method (script):
```bash
bash .agent/skills/tr-skill/scripts/create-skill.sh my-new-skill
```

### Manual method:
1. Create the folder: `.agent/skills/my-new-skill/`
2. Create `SKILL.md` with proper `name` + `description` frontmatter
3. Create `scripts/`, `references/`, `evals/`, `subagents/` directories
4. Populate each directory — think deeply about what belongs in each one
5. Write `evals/evals.json` with at least 3 assertions

### The Deliberation Checklist

Before committing a new skill, answer ALL of these:

| Folder | Question |
|:---|:---|
| `SKILL.md` | Is the description trigger-optimized? Will the IDE activate this skill at the right time? |
| `scripts/` | What operations should be deterministic code, not LLM guesses? |
| `references/` | What domain knowledge does the agent need? What docs did I have to look up? |
| `evals/` | How do I know if this skill was used correctly? What could go wrong? |
| `subagents/` | What subtasks could be parallelized or delegated to a focused worker? |

---

## 9. Quality Enforcement

The enforcement script (`scripts/enforce-skill-optimization.mjs`) validates all skills on commit:

1. Every skill must have a `SKILL.md` with `name` and `description` frontmatter
2. All five directories must exist and contain at least one real file (`.gitkeep` alone doesn't count)
3. `evals/evals.json` must contain at least 3 assertions
4. No placeholder/TODO-only SKILL.md files in committed skills

---

## 10. Safe Integration of External Skills

When downloading, importing, or adding external skills from registries like `skills.sh` (via `npx skills add <name>`), agents and developers MUST perform security audits before executing any scripts:

1. **Verify Executable Scripts**: Open and scan all scripts under `scripts/`. Look for shell template strings with dynamic interpolation or unchecked execution arguments.
2. **Restrict Path Operations**: Ensure path references are validated and match regular expressions (e.g. `SAFE_NAME` pattern) to prevent path traversal vulnerabilities.
3. **Assert Sandbox Isolation**: Prefer executing unfamiliar external skill scripts inside isolated sandbox environments or containers to guarantee zero adverse host system impact.

---

## 11. Common Mistakes

| Mistake | Why It's Wrong | Fix |
|:---|:---|:---|
| Using `type`/`slug`/`category` in frontmatter | Those are SSSS memory node fields, not skill fields. IDE can't discover the skill. | Use only `name` and `description` |
| Empty `references/` with just `.gitkeep` | Agent loses critical domain context | Add at least one reference doc — even a short one |
| Empty `evals/` | No way to verify the skill worked | Write 3+ assertions in `evals.json` |
| Vague description | `"A skill for doing stuff"` → IDE never triggers it | `"Use this skill when X. Do NOT use for Y."` |
| Mixing format spec with implementation details | Contaminates portable knowledge with project-specific internals | Keep format docs generic, put project details in PRD |

---

## Changelog

### v2.0.0 (2026-05-11)
- **BREAKING**: Removed Total Recall-specific implementation details (surface.mjs routing, memory injection blocks, Gemma 4 references, P2 scheduling). This skill is now the universal format spec.
- Added deliberation checklist forcing agents to think about each folder
- Added "When creating a skill, ask yourself" prompts for each directory
- Added frontmatter anti-patterns section
- Added evals.json format example
- Added common mistakes table

### v1.0.0 (2026-05-10)
- Initial version. Mixed universal skill format with Total Recall memory compiler internals, causing agent confusion.


<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @route: tfidf, generated_at: 2026-05-21T06:00:44.284Z -->

- **inviolable-ide-instruction-7a4d8913** (confidence 1, importance critical):
  Inviolable IDE Instruction: # Temporary Cursor Rules for testing

- **always-reply-to-all-messages** (confidence 1, importance critical):
  Always reply directly to all user messages without exception

- **chocolate-brownies** (confidence 0.95, importance 4):
  Chocolate brownies must be fudgey and rich

- **security-audit-protocol** (confidence 1, importance 4):
  Security audit protocol and hardening requirements

- **operating-instructions** (confidence 1, importance 5):
  Total Recall Core Operating Protocol

- **no-cursor-or-windsurf-mentions** (confidence 1, importance critical):
  Do not mention Cursor or Windsurf

<!-- END INJECTED MEMORY -->
