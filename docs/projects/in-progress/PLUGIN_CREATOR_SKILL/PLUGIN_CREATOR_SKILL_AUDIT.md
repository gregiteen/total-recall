# PLUGIN_CREATOR_SKILL — Audit

> **Project Prefix**: `PLUGIN_CREATOR_SKILL`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Audit Status**: Complete
> **Audited commit**: `333dd30a` (total-recall) + `HEAD` (tr-plugin-*)
> **Related**: PLUGIN_CARDS_BESPOKE (umbrella), PLUGIN_BRICK_STANDALONE

---

## 1. What the plugin creator is

The instruction an agent follows to author a Total Recall plugin: a recipe of prompts with exact specifications, plus the checks that prove the output. It is not a code generator.

It existed as two competing skills, `plugin` and `plugins`, with different content and the same description. Neither had been rewritten for the current direction.

---

## 2. Findings

### PC-01 — Two skills describing one thing (P0, critical)

`.agent/skills/plugin/` and `.agent/skills/plugins/` both existed, both titled "Total Recall plugins", with different bodies. The global brain carried a third copy at `~/.agent/skills/plugins`, and plugin repositories carried further copies under `.agent/skills/plugins`. Every copy is a place the instructions can drift apart.

**Resolved**: both removed, `plugins` deregistered, one replacement created at `.agent/skills/plugin/`.

### PC-02 — The scaffolder generated the old model (P0, critical)

`plugin create --with-ui` emitted:

- `ui.elements` with `kind: 'panel'` and no card, which fails the current contract
- a `panel.js` collecting an API key in `<input type="password">` and dispatching `save-token` with the raw value — a second credential store
- a `DESIGN.md` with a hand-rolled `colors:` block, not the `tokens:` schema the host reads
- placeholder copy: *"panel scaffold. Add the actual capability before sharing"*

This is the mechanism that produced 34 templated, near-identical cards. A generator encoding a shape is a template one level up.

**Resolved**: the UI generation block and `tokenPanelSource()` are removed. The scaffolder emits a manifest, a CLI handler and a test, and reports the card as outstanding.

### PC-03 — `skill deploy` copied the credential store, its backups, the memory vault and live browser credentials (P0, critical)

`skillPackageFiles()` and `copySkillDir()` excluded only `node_modules`, `.git` and `.DS_Store`. Measured on the `total-recall` skill:

| Copied into the destination repository | Amount |
| --- | --- |
| `config/secrets.enc` — the encrypted credential store | 31,669 bytes |
| three `config/secrets.enc.bak-*` backups | 28.5 KB each |
| `memory-vault/` — the entire memory vault | 956 files |
| `browser-profile/` — **live browser credentials** | 995 files, 46 MB |
| `logs/` | 55 files |
| `memory-derived/` | 12 files |

`src/core/cache-prune.mjs` marks `browser-profile` as `// live credentials; never touch`, so this was a live-credential copy as well as a secret-store copy. `skill publish` selects from the same enumeration.

Verified before the fix with the installed binary: `secrets.enc` and 1,637 vault files landed in a clean repository, 22,671 files in total.

**Resolved**: a shared `skillPackageExcluded()` now excludes private state, derived data, nested installs and credential files from both the enumeration and the copy.

### PC-04 — The enumeration made the registry 5,515 lines and churned on every memory write (P1, high)

The same enumeration filled `skills-registry/index.yaml`:

- **5,515 lines / 304 KB**, of which 2,464 lines (44%) were per-file `managed_files` lists
- the `total-recall` skill alone contributed 2,106 file lines
- because `hashSkillContent()` hashes every enumerated file, **every vault write changed the skill's content hash**, producing permanent false drift

An orphaned `plugins` install entry carried a further large file list.

**Resolved**: the enumeration now yields content only. The registry is 3,493 lines / 136 KB after removing the orphaned entry; recomputing existing entries will bring it lower.

### PC-05 — The deleted skill's scaffold and registry entries survived (P1, high)

`scripts/sync-scaffold.mjs` listed `plugins` in `EXTRA_SCAFFOLD_SKILLS` and omitted `plugin`, so the replacement never reached the scaffold while the removed one was still referenced. The skill registry and the install map retained `plugins` entries; `skill remove plugins` cannot clean them once the directory is gone, and `sync-registry` adds but never prunes.

**Resolved**: the scaffold list corrected; the registry entry and install-map entry removed by precise edit and verified against a backup.

### PC-06 — No verification existed (P0, critical)

There was no script, no check and no eval anywhere in the ecosystem. The instruction surface asked an agent to verify its work and gave it nothing to run, which is how a card could read three fields its command never returns and default to "Up to date" without anyone noticing.

**Resolved**: `scripts/record.mjs` runs a battery of structural, behavioural and secret checks; `evals/` proves the battery catches the real defects and accepts a plugin that follows the recipe.

### PC-07 — The contract change broke the CLI (P0, critical)

Making a card mandatory invalidated the `auth` plugin's manifest, and core loads `auth`'s server module at startup — so the repository CLI could not run at all until `auth` was valid.

**Resolved**: `auth` now declares exactly one card face and no `card_layout`. Its second declared face remains on disk, undeclared, as outstanding work.

---

## 3. What was correct and is kept

- Scaffold-then-stop: `plugin create` produces a skeleton, not a finished plugin.
- `plugin vendor`'s provenance record, destination guards and `--with-requires` chaining.
- The manifest contract's structural rules: typed arguments, effects, secret-over-stdin, status binding.
- The skill registry's layered and install-map design; only its notion of a package needed correcting.

---

## 4. Root cause

Three assumptions had hardened into the tooling:

1. **That a plugin has one shape.** It does not: it declares whatever surfaces its capability needs, and may have no CLI, or no memory contribution, or no scheduled work.
2. **That verification can be a sentence of instruction.** "Test before you share" with nothing runnable is not verification, and every defect above survived it.
3. **That a skill package is a directory.** It is not: a skill directory can contain the agent's vault, its credential store and live browser credentials, none of which may travel.

---

## 5. Verification performed

- Inspected both existing skills and confirmed they differed; located three further copies.
- Generated a probe plugin with `plugin create --with-ui` and confirmed `kind: 'panel'`, the password input, the `save-token` dispatch and the `colors:` DESIGN.md.
- Deployed `total-recall` with the installed binary into a clean repository: `secrets.enc` present, 1,637 `memory-vault` files, 22,671 files total.
- Deployed the same skill with the repository binary and the fix: **0 secrets, 0 vault files, 0 browser-profile files, 261 files**.
- Measured the registry: 5,515 lines / 304 KB, 2,464 file-list lines, `total-recall` at 2,106.
- Confirmed by structural diff that only the `plugins` entries were removed.
- Confirmed the registry YAML parses: 73 skills, 212 installs.
- Ran the eval suite: **6/6**, including a case that must be accepted.
- Ran the checker against four real plugins: all **0 failures**.
