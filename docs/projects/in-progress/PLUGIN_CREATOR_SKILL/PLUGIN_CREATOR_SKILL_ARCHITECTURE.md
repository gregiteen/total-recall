# PLUGIN_CREATOR_SKILL — Architecture

> **Project Prefix**: `PLUGIN_CREATOR_SKILL`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: PLUGIN_CREATOR_SKILL_AUDIT.md (Complete)

---

## 1. Shape of the skill

```
.agent/skills/plugin/
  SKILL.md                 the recipe: invariants, the prompt table, scripts, subagents, evals
  references/
    surfaces.md            every surface and its exact manifest fields
    card.md                the face specification
    scaffold.md            the capability extraction, and distribution
    anti-patterns.md       the failure catalogue, every entry observed in a real plugin
  prompts/
    01-function.md … 08-verify.md    one prompt per step, each with a check
  scripts/
    record.mjs             the verification battery, runnable at any point
  subagents/
    plugin-reviewer.md     adversarial review
    card-designer.md       designs a face, or returns the questions it cannot answer
    scaffold-extractor.md  extracts the capability, or says why it is not separable
  evals/
    run.mjs                materialises each case and asserts the checker's verdict
    cases/*.mjs            five real defects, one plugin that must be accepted
```

Progressive disclosure: `SKILL.md` carries the recipe and the invariants; a prompt is read when that step is executed; a reference is read when its detail is needed.

## 2. Why the recipe is a table of prompts

A single document that describes everything gets skimmed, and a skimmed instruction is not an instruction. Splitting it means each step is short enough to execute and carries its own check, and the eight steps are the eight things that must be true of a finished plugin.

## 3. The checker

`record.mjs` reads files and runs commands; it trusts no declaration.

| Section | What it establishes |
| --- | --- |
| manifest | the contract validates; exactly one card face; no `card_layout`; every operation has an effect; a secret never carries a flag; `status` binds to a real read command |
| card | no credential collection or transmission; no seeded value; no reassuring **fallback**; no invented identifiers; reads through the host; failures are states; timers cleared; colour as tokens; host tokens used; 44 px targets; reduced motion |
| secrets | a declared credential is not read from the ambient environment; the card never receives one over stdin; credential access goes through auth |
| scaffold | the entry resolves; no Total Recall dependency; no placeholder; exports a capability; no CLI concerns; no UI; **and it imports with `TOTAL_RECALL_BIN` unset** |

Two checks required deliberate calibration, and both were false positives first:

- **Seeded values.** `loadAvg: [` matched a ternary (`? h.loadAvg : []`) until the pattern required an actual digit.
- **Reassuring defaults.** The literal `'Connected'` matched an honest label (`ok ? 'Connected' : 'Unconfigured'`) until the pattern required a fallback position (`||`, `??`, or a catch branch).

A checker that cries wolf is worse than none, because it teaches its output to be ignored.

## 4. The eval harness

```
evals/run.mjs
  for each case:
    materialise the fixture plugin into a temp dir
    run record.mjs --json against it
    assert the reported failures are exactly the ones the case expects
```

The judgement is two-sided by construction:

- A defect case passes only if the checker **catches** it.
- The `correct-plugin` case passes only if there are **no** failures.

That pairing is the whole design: it makes both a blind checker and an over-eager one fail the suite.

## 5. The package boundary (security)

`skills-registry.mjs` gained one predicate used by both the enumeration and the copy:

```js
const SKILL_PACKAGE_EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'memory-vault', 'memory-derived', 'derived',
  'sessions', 'logs', 'browser-profile', 'plugins', 'plugin-state',
  'memory-inbox', 'dist', 'coverage', '.cache', 'tmp',
]);
const SKILL_PACKAGE_EXCLUDED_FILES = [
  /^\.DS_Store$/, /^secrets\.enc(\.|$)/, /^\.env(\.|$)/, /^id_[a-z]+$/, /\.pem$/,
];
```

- `skillPackageFiles()` uses it, so `managed_files` and the content hash cover content only.
- `copySkillDir()` uses it, so `skill deploy` and `skill publish` cannot carry private state.

One predicate, both paths — because the defect was that the two disagreed about what a package is.

## 6. Consistency the change required

Making a card mandatory had a consequence the contract alone did not express: `auth` was invalid, and core loads `auth` at startup, so the CLI could not run. The fix is in the plugin, not in a bypass: `auth` declares exactly one bespoke face and no template.

The scaffolder, the shipped-skill list, the registry and the scaffold are all downstream of the same decision, so all four were corrected in the same pass rather than left to drift.
