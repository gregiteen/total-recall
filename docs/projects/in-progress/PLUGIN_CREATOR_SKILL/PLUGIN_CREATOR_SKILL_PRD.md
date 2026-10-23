# PLUGIN_CREATOR_SKILL — Product Requirements

> **Project Prefix**: `PLUGIN_CREATOR_SKILL`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: PLUGIN_CREATOR_SKILL_AUDIT.md (Complete)

---

## 1. What this is

One skill that an agent can follow, cold, to author a Total Recall plugin correctly. It is a recipe — prompts with exact specifications — plus checks that run and evals that prove the checks work.

## 2. Requirements

### CR-1 — One skill, one name (P0)
Exactly one plugin-creator skill exists, at `.agent/skills/plugin/`. No second copy in the brain, in the scaffold, or in a plugin repository. **Audit PC-01, PC-05.**

### CR-2 — A recipe, not a generator (P0)
The skill is a sequence of prompts, each stating what to produce and what "correct" means. It never emits plugin code itself. **Audit PC-02.**

### CR-3 — Plugins are many things (P0)
The recipe presents a catalogue of surfaces — memory, context, CLI, skills, tasks, runtime, UI, deploy, distribution, composition — and instructs the agent to select only what the capability needs. It never prescribes one shape.

### CR-4 — Every plugin has a card face (P0)
The card is mandatory, bespoke and hand-authored. No template, no `card_layout`, no region or widget vocabulary. Screens are defined by the plugin, ordered by its own tasks.

### CR-5 — The scaffold is specified as a capability (P0)
For a capability another application could want, the recipe specifies extraction as importable functions with caller-supplied configuration: no card, no Total Recall dependency, no placeholders. **See PLUGIN_BRICK_STANDALONE.**

### CR-6 — Runnable checks, not a sentence of instruction (P0)
`scripts/record.mjs` runs the battery for the agent: manifest contract, card declaration, fabrication, reassuring defaults, credential safety, timer leaks, tokens, accessibility, and scaffold standalone operation. It exits non-zero on failure and names the real reason. **Audit PC-06.**

### CR-7 — Checks that are calibrated (P0)
A check must catch the real defect **and** accept honest code that resembles it. A checker that flags `ok ? 'Connected' : 'Unconfigured'` as a reassuring default is as wrong as one that misses `x || 'Up to date'`. Calibration is proven by evals, not asserted.

### CR-8 — Evals that could fail (P0)
`evals/` contains cases whose correct outcome is known, drawn from defects observed in this ecosystem, plus one plugin that follows the recipe and must be **accepted**. A suite with no positive case proves only that the checker rejects. **Audit PC-06.**

### CR-9 — Subagents for the separable work (P1)
Three delegatable prompts: an adversarial reviewer, a card designer that refuses to design without a function, and a scaffold extractor that may answer "not separable, because…".

### CR-10 — The scaffolder emits no UI (P0)
`plugin create` produces a manifest, a handler and a test, and reports the card as outstanding. It never writes a panel, a password input or a placeholder `DESIGN.md`. **Audit PC-02.**

### CR-11 — A skill package is content, not a directory (P0)
Enumeration and copying of a skill must exclude private state (`memory-vault`), derived data (`memory-derived`), nested installs (`plugins`), runtime output (`logs`, `sessions`), live credentials (`browser-profile`) and credential files (`secrets.enc*`, `.env*`, keys). Nothing private may be copied to another repository or published. **Audit PC-03, PC-04.**

### CR-12 — The package hash reflects content (P1)
Because the hash is computed over enumerated files, excluding runtime state is also what stops every memory write from registering as skill drift. **Audit PC-04.**

### CR-13 — The skill ships (P0)
The scaffolder's shipped-skill list names the skill, and the scaffold carries it, so a new project or brain receives it. **Audit PC-05.**

### CR-14 — The repository CLI works (P0)
The contract, the scaffolder and the default-bundle plugins are consistent enough that the repository CLI starts. A mandatory card may not invalidate a plugin core loads at startup. **Audit PC-07.**

## 3. Non-goals

- Not generating cards, capability modules or plugin bodies. All are hand-authored.
- Not a second plugin-creator implementation in another language or directory.
- Not changing the manifest's structural rules, which hold.
- Not publishing or releasing; the global install receives the security fix on the next release.

## 4. Success condition

An agent that has never seen this ecosystem loads the skill, follows the prompts, and produces a plugin that passes `record.mjs` with no failures — and the eval suite fails if the skill or its checks regress.
