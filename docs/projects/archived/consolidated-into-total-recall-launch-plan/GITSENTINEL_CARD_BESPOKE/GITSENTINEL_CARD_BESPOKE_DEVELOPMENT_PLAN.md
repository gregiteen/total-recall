# GITSENTINEL_CARD_BESPOKE — Development Plan

> **Project Prefix**: `GITSENTINEL_CARD_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: GITSENTINEL_CARD_BESPOKE_AUDIT.md (Complete)

---

## Phase 0 — Audit ✅
- [x] Read `plugin.json`: 2 read commands, template `dashboard`, one card element, no `DESIGN.md`
- [x] Capture real `audit --json` and `diff --json` output
- [x] Verify the two README-documented bugs are already fixed, including under hostile input
- [x] Record findings GS-01…GS-09
- [x] Write `GITSENTINEL_CARD_BESPOKE_AUDIT.md` (Complete)

## Phase 1 — Planning ✅
- [x] Write the PRD (GSR-1…GSR-15)
- [x] Write the architecture (verdict line, consequence ordering, four screens, verdict rules)

## Phase 2 — Consume the real payload (GSR-1, GSR-2)
- [ ] Replace every invented field path with the real ones (`stagedFiles`, `unstagedFiles`, `untrackedFiles`, `conflictedFiles`, `upstreamStatus`, `unpushedCommits`, `stashCount`, `errors`, `lastCommit`)
- [ ] Delete the seeded `branch: 'main'` from the constructor
- [ ] Delete `'Up to date'`, `'Synced'`, `'Repository Active'`, `'Inspecting...'`, `'Checking Sync'`
- [ ] Render an em dash with its reason wherever a value is unknown

## Phase 3 — Consequence-ordered figures (GSR-3…GSR-6)
- [ ] Unpushed commits as the primary figure, with the unknowable case explained by upstream state
- [ ] Conflicts as a distinct condition that outranks the dirty counts
- [ ] The four-way dirty split with an action label per row
- [ ] Stashes and last commit as context
- [ ] All seven upstream states named, with `gone` and `error` visually distinct

## Phase 4 — Verdict and failure states (GSR-7, GSR-8)
- [ ] Verdict computed only from returned values, in the documented priority order
- [ ] `errors[]` non-empty renders a warning and marks figures unreliable
- [ ] A rejected or unparseable read clears every figure and shows the error with attempt time

## Phase 5 — Screens (GSR-9, GSR-11)
- [ ] `Hygiene`, `Changes`, `Upstream`, `Provenance` screens with a tab strip
- [ ] `Changes` driven by a real `diff` call, with raw output beneath
- [ ] Confirm the host does not derive screens from `audit`/`diff`

## Phase 6 — Design tokens (GSR-12)
- [ ] Write `ui/DESIGN.md` with a real `tokens:` block matching the manifest
- [ ] Declare `ui.design_tokens`
- [ ] Single `:host` token block; consequence colours paired with words

## Phase 7 — Manifest and documentation (GSR-13, GSR-14)
- [ ] Remove `card_layout` from `plugin.json`
- [ ] Confirm exactly one card element is declared
- [ ] Rewrite the stale README section to state current, tested behaviour

## Phase 8 — Testing and verification
- [ ] `getPlugin('git-sentinel')` reports no errors
- [ ] `node --check ui/card.js` passes
- [ ] Assert no seeded branch, no reassuring default string and no invented field path remains
- [ ] Verify against a repository with unpushed commits that the count renders and the verdict says unpushed
- [ ] Verify against a repository with no upstream that it reports unknown, never zero
- [ ] Verify the conflict state renders distinctly
- [ ] Verify the error state renders when `host.run` rejects
- [ ] Render at 360/768/1280 px, light and dark
- [ ] Plugin suite passes with recorded exit status

## Sequencing note

Phase 2 before Phase 3. The invented field paths and reassuring defaults are removed first, so no rebuilt figure can inherit a fallback that reports a clean repository it has not verified.
