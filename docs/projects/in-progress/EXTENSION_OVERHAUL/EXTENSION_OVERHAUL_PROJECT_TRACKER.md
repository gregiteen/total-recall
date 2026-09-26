# EXTENSION_OVERHAUL — Project Tracker

Legend: `[ ]` todo · `[/]` in progress · `[x]` done · (S/M/L) complexity

## Phase 0: Planning
- [x] Audit (S)
- [x] PRD (S)
- [x] Architecture (S)
- [x] Development plan (S)
- [x] Tracker (S)
- [x] Request saved to Total Recall memory (`facts/extension-overhaul-request-2026-09-22`)

## Phase 1: Server fixes
- [x] `src/core/search.mjs`: `similarity` on vault results (S)
- [x] `src/server/routes/memory.mjs`: strip `_*` from semantic results, add `content` (S)
- [x] `src/server/routes/memory.mjs`: `GET /api/memory?sort=recent` (S)
- [x] `src/server/routes/collab.mjs`: persisted random JWT secret (S)
- [x] `src/server/routes/collab.mjs`: group-scoped broadcast (M)
- [x] Specs: memory semantic sanitization + sort (S), collab secret + scoping (M)

## Phase 2: Extension core
- [x] `extension/manifest.json`
  - v0.2.0 (S)
  - commands, omnibox, `optional_host_permissions` (S)
  - drop the unused optional perms (S)
- [x] `extension/lib/brain-client.js` rewrite (M)
- [x] `extension/lib/ui-helpers.js` (M)
- [x] `extension/lib/ui-helpers.spec.mjs` (M)
- [x] `extension/background.js` rewrite (M)
- [x] `extension/content-script.js` rewrite: safe DOM, page context, gated recall (M)
- [x] `extension/content-script.css`: host reset only (S)
- [x] Delete `extension/popup/` (S)
- [x] Delete `extension/lib/preconfigured.js` (S)
- [x] Delete `extension/icons/README.md` placeholder instructions (S)

## Phase 3: Visual rebuild
- [x] `extension/lib/tokens.css` (S)
- [x] `extension/icons/icon-{16,32,48,128}.png` from brand cube (S)
- [x] `extension/icons/mark.svg` (S)
- [x] `extension/sidepanel/sidepanel.html` (M)
- [x] `extension/sidepanel/sidepanel.css` (L)
- [x] `extension/sidepanel/sidepanel.js` (L)
- [x] `extension/options/options.html` (S)
- [x] `extension/options/options.css` (M)
- [x] `extension/options/options.js` (M)

## Phase 4: Verification
- [x] Server fixes exercised via an E2E harness on :3999 (the live brain was not restarted mid-project: another session had uncommitted work in the same tree)
- [x] Playwright E2E: **23/23 passed** against the live brain on the final code (run 4, no harness). The run-3 flake was the test's fixed 3 s sleep; it now waits for the condition
- [x] Relevance threshold calibrated: `RELATED_MIN_SIMILARITY = 0.53` (table in ARCHITECTURE)
- [x] E2E test memories and research items deleted by the script's cleanup (HTTP 200 per memory)
- [x] Temporary PAT `1f65e2a4-…` revoked (brain now returns 401 for it)
- [x] Full vitest suite green (Mac mini): 334 files / 1,895 tests
- [x] PRD success criteria S1–S9 checked
- [ ] You reload the unpacked extension in Chrome (chrome://extensions → Total Recall → reload) to pick up v0.2.0
