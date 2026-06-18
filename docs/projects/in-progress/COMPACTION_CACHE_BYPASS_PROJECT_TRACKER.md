# Surface Compiler Quality — Project Tracker

## ✅ Phase 1: Force Flag Propagation (Cache Bypass)

- [x] Add `force = false` parameter to `compactNode()` (line ~203)
- [x] Guard cache read with `if (derivedDir && !force)` (line ~211)
- [x] Reload cache before write when `force=true` (OKF augmentation pattern)
- [x] Add `force` to `buildRulesBlock()` options destructuring (line ~253)
- [x] Pass `force` to `compactNode()` in `formatNodes` closure (line ~357)
- [x] Add `force` to `writeShim()` options destructuring (line ~442)
- [x] Pass `{ vaultDir, derivedDir, force }` to `buildRulesBlock()` (line ~444)
- [x] Add `force` to `compilePointers()` options destructuring (line ~526)
- [x] Pass `{ vaultDir, derivedDir, force }` to all `writeShim()` calls (lines ~532, ~546)
- [x] Pass `{ vaultDir, derivedDir, force }` from `compileSurface()` to `compilePointers()` (line ~581)

## ✅ Phase 2: Fix Compaction Quality (`heuristicCompact`)

- [x] Add `modalityMarker()` helper: maps node modality → `[MUST]`, `[MUST NOT]`, `[SHOULD]`, etc.
- [x] Skip "Self-captured memory:" prefix when title echoes body content
- [x] Truncate at nearest sentence boundary instead of mid-word (`_truncateAtSentence`)
- [x] Prefix all compacted rules with modality marker

## ✅ Phase 3: Add Deduplication to `buildRulesBlock`

- [x] Add `deduplicateNodes()` — content-hash dedup by first 200 chars of body
- [x] When duplicates exist, keep the node with higher importance/priority
- [x] Integrated into `formatNodes` pipeline

## ✅ Phase 4: Shorten CLI Reference Block

- [x] Replaced 73-line CLI reference with compact 8-line Quick Reference summary
- [x] Preserved all command names and key flags
- [x] Rules section now starts within first 15 lines of compiled shim

## ⏳ Phase 5: Testing & Verification

- [/] Run `npx vitest run` — waiting for results
- [ ] Run `npx total-recall compile` — clean compilation
- [ ] Inspect `INSTRUCTIONS.md` — modality markers present
- [ ] Inspect `INSTRUCTIONS.md` — no title/body duplication
- [ ] Inspect `INSTRUCTIONS.md` — no duplicate rules
- [ ] Inspect `INSTRUCTIONS.md` — compact CLI reference
- [ ] Commit to `main`
