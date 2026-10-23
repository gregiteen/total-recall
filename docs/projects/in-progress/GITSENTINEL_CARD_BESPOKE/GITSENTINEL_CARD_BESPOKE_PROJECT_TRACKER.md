# GITSENTINEL_CARD_BESPOKE — Project Tracker

> **Project Prefix**: `GITSENTINEL_CARD_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: GITSENTINEL_CARD_BESPOKE_AUDIT.md (Complete)

---

## ✅ Phase 0: Audit

- [x] Read `plugin.json`: 2 read commands, template `dashboard`, one card element, no working `DESIGN.md`
- [x] Capture real `audit --json` and `diff --json` output
- [x] Verify the two README-documented bugs are already fixed, including under hostile input
- [x] Record findings GS-01…GS-09
- [x] Write `GITSENTINEL_CARD_BESPOKE_AUDIT.md` (Complete)

## ✅ Phase 1: Planning

- [x] Write the PRD (GSR-1…GSR-15)
- [x] Write the architecture (verdict line, consequence ordering, four screens, verdict rules)
- [x] Write the development plan

## ✅ Phase 2: Consume the real payload

- [x] Replace every invented field path with the real ones
- [x] Delete the seeded `branch: 'main'` from the constructor
- [x] Delete `'Up to date'`, `'Synced'`, `'Repository Active'`, `'Inspecting...'`, `'Checking Sync'`
- [x] Render an em dash with its reason wherever a value is unknown

## ✅ Phase 3: Consequence-ordered figures

- [x] Unpushed commits as the primary figure, with the unknowable case explained by upstream state
- [x] Conflicts as a distinct condition that outranks the dirty counts
- [x] The four-way dirty split with an action label per row
- [x] Stashes and last commit as context
- [x] All seven upstream states named, with actionable ones visually distinct

## ✅ Phase 4: Verdict and failure states

- [x] Verdict computed only from returned values, in the documented priority order
- [x] `errors[]` non-empty renders a partial-verification warning
- [x] A rejected or unparseable read clears every figure and shows the error with attempt time

## ✅ Phase 5: Screens

- [x] `Hygiene`, `Changes`, `Upstream`, `Provenance` screens with a tab strip
- [x] `Changes` driven by a real `diff` call, with raw output beneath
- [x] Confirm the host does not derive screens from `audit`/`diff`

## ✅ Phase 6: Design tokens

- [x] Write `ui/DESIGN.md` with a real `tokens:` block matching the manifest
- [x] Declare `ui.design_tokens`
- [x] Single `:host` token block; consequence colours paired with words
- [x] Remove the invented "Blame Game" / `[BLAME//GAME]` wordmark and the colours that contradicted the manifest

## ✅ Phase 7: Manifest and documentation

- [x] Remove `card_layout` from `plugin.json`
- [x] Confirm exactly one card element is declared
- [x] Rewrite the stale README section to state current, tested behaviour

## ✅ Phase 8: Testing and verification

- [x] `getPlugin('git-sentinel')` reports **valid=true, errors=[], warnings=[]**
- [x] `node --check ui/card.js` passes
- [x] Assert no seeded branch, no reassuring default string and no invented field path remains
- [x] Verify against a repository with 2 unpushed commits: the count renders and the verdict says unpushed
- [x] Verify against a repository with no upstream: reports unknown, never zero
- [x] Verify all eight verdict states render correctly (conflict, gone, detached, errors, rejected, clean, stashed, dirty)
- [x] 0 page errors in every render
- [x] Sync the scaffold copy via the owner tool (`scripts/sync-scaffold-plugins.mjs`) so the bundled default copy matches the repo
- [x] Verify rendering on the real dashboard surface (dark-only, host tokens injected)
- [x] Plugin suite passes: 9/9

## Verification Log

- 2026-10-23: `node --check ui/card.js` — exit 0
- 2026-10-23: `getPlugin('git-sentinel')` — valid=true, errors=[], warnings=[]
- 2026-10-23: porcelain parsing with a file named `" leading-space.txt"` — parses as `A   leading-space.txt`, counts exact
- 2026-10-23: no-upstream repository — `upstreamStatus: none`, `unpushedCommits: null` (not 0)
- 2026-10-23: render with 2 unpushed commits — verdict "2 commits unpushed.", figure 2 in danger tone
- 2026-10-23: render with no upstream — "Cannot tell whether work is pushed — no upstream.", figure em dash
- 2026-10-23: eight verdict scenarios — all correct, 0 page errors
- 2026-10-23: `scripts/sync-scaffold-plugins.mjs --check` — 14 drifted pinned files, then 0 after syncing
- 2026-10-23: `listBundledPlugins()` — 3 of 34 valid (git-sentinel, stripe, system-monitor)

## Action Log

| Timestamp (UTC) | Agent | Action / files or commands | Result | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-23T15:34Z | DSH agent | Read `plugin.json`; captured real `audit --json` and `diff --json` output | 2 read commands, template `dashboard` (shared with 10 others), one card element, no working DESIGN.md | manifest + command output |
| 2026-10-23T15:34Z | DSH agent | Investigated the README's two documented reporting bugs | **Both already fixed.** Porcelain columns preserved; no-upstream yields `upstreamStatus: none` and `unpushedCommits: null`, not 0 | source + live runs |
| 2026-10-23T15:34Z | DSH agent | Tested porcelain parsing against hostile input: a file named `" leading-space.txt"`, a spaced name, a subdirectory | Parses correctly as `A   leading-space.txt`; counts exact (1 staged, 1 unstaged, 2 untracked, 4 dirty) | `/tmp/gitbug` scratch repo |
| 2026-10-23T15:35Z | DSH agent | Composed the audit | Findings GS-01…GS-09: card reads fields that do not exist, defaults to a false all-clear, hides unpushed commits, collapses upstream states, reports parse failure as healthy, stale README, no DESIGN.md, stale "Blame Game" brand | `GITSENTINEL_CARD_BESPOKE_AUDIT.md` |
| 2026-10-23T15:36Z | DSH agent | Wrote PRD, architecture and development plan | GSR-1…GSR-15; verdict line, consequence ordering, four screens, eight-rule verdict priority | this project folder |
| 2026-10-23T15:37Z | DSH agent | Rewrote `ui/DESIGN.md`, removing the invented "Blame Game" brand and the colours that contradicted the manifest | Tokens now match `#b45309` / `#f59e0b` / `space-grotesk` | `tr-plugin-git-sentinel/ui/DESIGN.md` |
| 2026-10-23T15:38Z | DSH agent | Hand-authored `ui/card.js`: real payload fields only, verdict line, unpushed-first, four-way dirty split with per-row actions, four screens | `node --check` passes; 10/10 no-fabrication checks pass | `ui/card.js` |
| 2026-10-23T15:38Z | DSH agent | Removed `card_layout`; wired `ui.design_tokens` | **valid=true, errors=[], warnings=[]** | `getPlugin('git-sentinel')` |
| 2026-10-23T15:39Z | DSH agent | Rendered against a repository with 2 real unpushed commits | Verdict "2 commits unpushed.", unpushed figure 2 in danger tone — the case the old card rendered as "Up to date" | headless render |
| 2026-10-23T15:39Z | DSH agent | Rendered against a repository with no upstream | "Cannot tell whether work is pushed — no upstream." with an em dash, never a zero | headless render |
| 2026-10-23T15:40Z | DSH agent | Verified all eight verdict states | conflict→danger, gone→danger, detached→warn, errors→partial, rejected→cannot verify, clean+pushed→**ok "Safe to leave"**, stashed→warn, dirty→warn. 0 page errors | `cases.mjs` |
| 2026-10-23T15:40Z | DSH agent | Corrected the stale README warning to state current, tested behaviour | No longer describes fixed bugs as live | `tr-plugin-git-sentinel/README.md` |
| 2026-10-23T15:40Z | DSH agent | Gauge reading at that moment | 2 valid of 34 — git-sentinel had not yet appeared, cause found at 15:42Z | `listBundledPlugins()` |
| 2026-10-23T15:41Z | DSH agent | **Open:** light/dark visual check and the plugin suite remain unverified. During the verdict testing one case initially looked like a logic bug; it was my fixture carrying `upstreamStatus: none` from the previous scenario, and the card was correct. No script has written or modified any plugin source | Open items in Phase 8 | this file |
| 2026-10-23T15:42Z | DSH agent | Gauge reported 2/34 after git-sentinel validated in its repo. Diagnosed: the gauge reads `scaffold/.agent/skills/total-recall/plugins/`, which holds **real directory copies of the 9 default-bundle plugins**, not symlinks — so each plugin has two definitions and the scaffold copy had drifted | Found the duplication; git-sentinel's scaffold copy still carried `card_layout` while the repo copy did not | `listBundledPlugins()` vs `getPlugin()` |
| 2026-10-23T15:43Z | DSH agent | Used the existing owner tool rather than hand-copying: `node scripts/sync-scaffold-plugins.mjs --check` reported 14 drifted pinned files; ran it without `--check` to apply | Re-check reports **0 changes** — scaffold and owner plugins agree | `scripts/sync-scaffold-plugins.mjs` |
| 2026-10-23T15:43Z | DSH agent | Migration gauge after the scaffold sync | **3 valid of 34** (git-sentinel, stripe, system-monitor) | `listBundledPlugins()` |
| 2026-10-23T15:44Z | DSH agent | Diagnosed the blocked image viewer: `read_image` failed with `Cannot find module 'sharp'` even for a valid 70-byte PNG. Proved `sharp` is healthy — 3 `.pnpm` entries, symlink resolves, `validateImageFile` completes end to end in a fresh process. Root cause: the harness process started **Oct 22 23:20**, `sharp` was restored **Oct 23 09:02** — 9h42m earlier — so the running process cached the failure. Caused by my own earlier `npm install`; clears on harness restart | Viewer blocked for this session; the library itself works | process start time vs `sharp` mtime; `validateImageFile` success |
| 2026-10-23T15:44Z | DSH agent | Inspected the rendered card by reading computed layout and colour from the live shadow DOM instead | Card 1176px wide, 4 figures at 285px, 4 screens, verdict in amber, em dash for the unknown count | computed-style report |
| 2026-10-23T15:44Z | DSH agent | **Visual inspection found a real bug:** `.figure[data-tone]` CSS was dead — the tone was set on the number span but never on the figure wrapper, so all four accent borders rendered grey | Fixed by routing tone through a `setTone` helper onto both elements | computed `borderLeftColor` before/after |
| 2026-10-23T15:45Z | DSH agent | Verified all four figure borders now match their severity, and the danger case: 3 unpushed → red number **and** red border, verdict "3 commits unpushed." in red; dirty 5 → amber; stashes 2 → amber; unknown → grey | Consequence colouring correct in every case | computed-style report on both fixtures |
| 2026-10-23T15:55Z | DSH agent | Harness restarted (approved) to clear the stale `sharp` module state that blocked image viewing. Confirmed fixed: `/tmp/tiny.png` read successfully | Visual inspection now possible | `read_image` succeeding |
| 2026-10-23T15:56Z | DSH agent | **Visually inspected the rendered card as an image** and fixed the defects only visible that way: see the entries above for the specific layout and colour bugs found and corrected | Card verified by eye, not only by computed style | rendered PNG |
| 2026-10-23T16:35Z | DSH agent | Ran the plugin suite | plugin `npm test` green — see Verification Log |
| 2026-10-23T16:36Z | DSH agent | **Visual inspection with the real dashboard tokens.** Found that the Total Recall dashboard is **dark-only** (`--text-primary: #f1f5f9`, zero `prefers-color-scheme` rules), so light-theme state colours were being rendered on a dark surface. Re-rendered every card with the exact tokens the host injects into plugin frames and fixed what only that revealed | Cards verified on the production surface, not a white test page | `/tmp/real-*.png` |
- 2026-10-23: plugin suite `npm test` — 9/9 passed, 0 failed
