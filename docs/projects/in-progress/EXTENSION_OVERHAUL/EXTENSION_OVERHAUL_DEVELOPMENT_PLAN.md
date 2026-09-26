# EXTENSION_OVERHAUL — Development Plan

## Phase 1: Server fixes (data safety first)

- [ ] `search.mjs`: carry `similarity` to vault results
- [ ] `memory.mjs`: sanitize semantic results, add `sort=recent`
- [ ] `collab.mjs`: persisted random JWT secret, group-scoped broadcasts
- [ ] Specs for each

**Done when:**
- `npx vitest run src/server/routes/memory src/server/routes/collab src/core/search` passes.
- `node --check` passes on the touched files.

## Phase 2: Extension core

- [ ] `lib/brain-client.js` rewrite: brain header, typed errors, badge clear, no model hardcode, `listRecent`, `listResearch`, `queueResearch`, `status`
- [ ] `lib/ui-helpers.js` + `extension/lib/ui-helpers.spec.mjs`
- [ ] `background.js`:
  - menus: page, selection, link, ask-about-selection
  - commands, omnibox, per-tab badge
  - `QUERY_RELATED` with relevance filter
- [ ] `content-script.js`: safe overlay, `GET_PAGE_CONTEXT`, recall only when enabled
- [ ] `manifest.json`: v0.2.0, commands, omnibox, optional host perms, remove unused perms and popup
- [ ] Delete `popup/`, `lib/preconfigured.js`

**Done when:**
- `grep -n "innerHTML" extension/content-script.js` shows no brain data.
- The ui-helpers spec passes.

## Phase 3: Visual rebuild

- [ ] `lib/tokens.css`, `icons/*.png` from the brand cube, `icons/mark.svg`
- [ ] Side panel HTML/CSS/JS rebuilt:
  - Recall, Chat and Research tabs
  - Settings sheet
  - onboarding state
- [ ] Options page rebuilt: connection test with brain stats, host permission request, privacy toggles, blocklist, shortcuts

**Done when:** `grep -rE "#1e1e2e|#cba6f7|#89b4fa|#f38ba8|#313244" extension/` is empty.

## Phase 4: Verification

- [ ] Restart the local brain (`launchctl kickstart -k gui/$UID/com.totalrecall.brain`), confirm `/health`
- [ ] Playwright: load the unpacked extension against the live brain with a temporary PAT, then:
  - screenshot the side panel tabs and options page
  - exercise capture, search, recent, chat, research queue and cancel
  - check the pill on related and unrelated pages
- [ ] Calibrate `RELATED_MIN_SIMILARITY`
- [ ] Clean up test memories and research items. Revoke the temporary PAT.
- [ ] Full vitest suite (test skill)

**Done when:** every success criterion in the PRD is checked, with evidence recorded in the tracker.
