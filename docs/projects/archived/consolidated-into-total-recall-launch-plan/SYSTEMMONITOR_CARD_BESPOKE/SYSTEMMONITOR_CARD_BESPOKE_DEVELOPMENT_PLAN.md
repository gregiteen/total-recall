# SYSTEMMONITOR_CARD_BESPOKE — Development Plan

> **Project Prefix**: `SYSTEMMONITOR_CARD_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: SYSTEMMONITOR_CARD_BESPOKE_AUDIT.md (Complete)

---

## Phase 0 — Audit ✅
- [x] Read `plugin.json`: 2 read commands, template `monitor`, one card element, no `DESIGN.md`
- [x] Capture real `sample --json` output
- [x] Record findings SM-01…SM-07
- [x] Write `SYSTEMMONITOR_CARD_BESPOKE_AUDIT.md` (Complete)

## Phase 1 — Planning ✅
- [x] Write the PRD (SMR-1…SMR-12)
- [x] Write the architecture (instrument panel, three screens, severity bands)

## Phase 2 — Remove the fabrication (SMR-1, SMR-2)
- [ ] Delete the seeded `this.sample` literal from the constructor
- [ ] Delete the `// Retain fallback telemetry` catch behaviour
- [ ] Render every figure as an em dash until a real sample arrives
- [ ] Make a failed read a first-class error state carrying the real message and last-attempt time

## Phase 3 — Build the instrument panel (SMR-3, SMR-4, SMR-5, SMR-6)
- [ ] Memory instrument: percentage, bar, band word, stated threshold
- [ ] Load instrument: all three averages, labelled, with `cores: unknown` when unknown
- [ ] Supporting row: free/total in GB/MB, uptime, platform, hostname, sampled-at
- [ ] Severity bands as declared constants, printed beside the bar

## Phase 4 — Screens (SMR-7, SMR-8, SMR-9)
- [ ] `Now`, `Trend`, `Host` screens with a tab strip
- [ ] Opt-in live sampling with `setInterval`, cleared on pause and on `disconnectedCallback`
- [ ] Bounded trend ring (60 readings) rendering session samples
- [ ] Confirm the host does not derive screens from `status`/`sample`

## Phase 5 — Design tokens (SMR-10)
- [ ] Write `ui/DESIGN.md` with a real `tokens:` block
- [ ] Declare `ui.design_tokens` in the manifest
- [ ] Move all colour into a single `:host` token block using host tokens
- [ ] Ensure severity is never conveyed by colour alone

## Phase 6 — Manifest and face (SMR-11)
- [ ] Remove `card_layout` from `plugin.json`
- [ ] Confirm exactly one card element is declared

## Phase 7 — Testing and verification
- [ ] `getPlugin('system-monitor')` reports no errors
- [ ] `node --check ui/card.js` passes
- [ ] Assert no numeric literal telemetry remains in the source
- [ ] Assert no fake hostname remains
- [ ] Render at 360/768/1280 px, light and dark
- [ ] Verify the error state renders when `host.run` rejects
- [ ] Verify no timer survives disconnect
- [ ] Plugin tests pass with recorded exit status

## Sequencing note

Phase 2 before Phase 3: the fabrication is removed first so no rebuilt instrument can inherit a seeded reading. Phases 2–6 are one hand-authored rewrite of `ui/card.js` plus the manifest edit.
