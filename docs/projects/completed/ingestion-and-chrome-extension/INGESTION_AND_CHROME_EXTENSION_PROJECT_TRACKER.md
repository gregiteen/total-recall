# Project Tracker: Ingestion Pipeline & Chrome Extension

**PRD**: [INGESTION_AND_CHROME_EXTENSION_PRD.md](./INGESTION_AND_CHROME_EXTENSION_PRD.md)
**Dev Plan**: [INGESTION_AND_CHROME_EXTENSION_DEV_PLAN.md](./INGESTION_AND_CHROME_EXTENSION_DEV_PLAN.md)

---

## ✅ Phase 1: Wave 1 — Foundation (Parallel: Agents A, B, C)

### Agent A: Share-to-Brain Endpoint + CLI ✅
- [x] Create `src/server/routes/share.mjs` route handler
- [x] Accept `{ url, title, excerpt, source, action, brainId, tags }`
- [x] Implement `auto` action routing heuristic
- [x] `remember` action: write fact/concept node with `x_citations`
- [x] `research` action: queue research project
- [x] URL auto-titling (handled via title param)
- [x] Mount route in `rest.mjs`
- [x] Create `src/cli/share.mjs` CLI command
- [x] Support `--text`, `--action`, `--tags`, `--brain` flags
- [x] Register in CLI entrypoint (`bin/total-recall.mjs`)
- [x] Code quality check passes


### Agent B: Schema Extensions + Quick Capture ✅
- [x] Add `x_location` field to SSSS schema
- [x] Add `x_media_refs` field to SSSS schema
- [x] Add `x_browser_context` field to SSSS schema
- [x] Replace hardcoded source whitelist in `quick-capture.mjs`
- [x] Use `isValidSource()` regex check instead
- [x] Verify existing nodes still pass schema validation
- [x] Code quality check passes


### Agent C: Research Lifecycle Controls ✅
- [x] Add `patchResearch()` API function to `api.ts`
- [x] Add `deleteResearch()` API function to `api.ts`
- [x] Add Pause button (in_progress → paused)
- [x] Add Resume button (paused/failed → pending)
- [x] Add Re-run button (done → pending + reset phase)
- [x] Add Steer button (opens modal)
- [x] Add Conclude button (→ done)
- [x] Add Cancel button (DELETE)
- [x] Build steer modal with textarea
- [x] Wire all buttons to API calls
- [x] Auto-refresh: leveraged existing 3s poll in TasksPage (no duplicate needed)
- [x] Code quality check passes


---

## ✅ Phase 2: Wave 2 — Features (After Wave 1: Agents D, F, G)

### Agent D: Chrome Extension Core ✅
- [x] Create `extension/manifest.json` (MV3)
- [x] Create `extension/lib/brain-client.js` (shared API client)
- [x] Create `extension/background.js` (service worker)
- [x] Register context menu items
- [x] Implement "Send to Brain" handler
- [x] Implement "Remember This" handler (selected text)
- [x] Implement "Research This" handler (selected text)
- [x] Implement badge count for active research
- [x] Implement message routing (QUERY_BRAIN, SHARE, HEALTH_CHECK)
- [x] Create valid PNG icons (16, 48, 128)
- [x] Extension loads unpacked without errors

### Agent F: Google Takeout Parser ✅
- [x] Create `src/cli/ingest/index.mjs` CLI entry point
- [x] Implement `--dry-run`, `--types`, `--brain`, `--max-age` flags
- [x] Create `utils/takeout-walker.mjs` directory walker
- [x] Create `utils/dedup.mjs` sha256 dedup utility
- [x] Create `parsers/search-history.mjs`
- [x] Create `parsers/chrome-bookmarks.mjs`
- [x] Create `parsers/google-keep.mjs`
- [x] Create `parsers/youtube-history.mjs`
- [x] Implement post-import stats report
- [x] Register CLI command (routed via existing `ingest` command)
- [x] Code quality check passes

### Agent G: Research UI Polish ✅
- [x] Remove `maxHeight: 350` cap from report section
- [x] Add expand/collapse toggle (default: collapsed 500px with gradient fade)
- [x] Upgrade citation pills to cards with favicons
- [x] Add "Research deeper" button on citation cards
- [x] Add URL detection regex in `ChatPage.tsx` input
- [x] Show action bar: [🔬 Research] [📌 Remember]
- [x] Wire action bar buttons to `POST /api/share` via `shareToApi()`
- [x] Add toast notification for actions
- [x] Code quality check passes


---

## ✅ Phase 3: Wave 3 — Extension UI (After Agent D: Agent E)

### Agent E: Extension UI (Side Panel + Popup + Content Script + Options) ✅
- [x] Create `sidepanel/sidepanel.html` layout
- [x] Implement related memories list (semantic search via QUERY_BRAIN)
- [x] Implement quick actions bar (Remember/Research/Quick Note)
- [x] Implement research feed (30s polling)
- [x] Implement brain search input (300ms debounce)
- [x] Create `popup/popup.html` layout
- [x] Implement quick note field
- [x] Implement URL share field (auto-filled from current tab)
- [x] Implement tracking toggle (persisted to chrome.storage.sync)
- [x] Implement connection status indicator
- [x] Create `content-script.js` page context capture
- [x] Implement semantic search query via background worker (Shadow DOM)
- [x] Render floating pill in Shadow DOM (closed mode)
- [x] Create `options/options.html` settings page
- [x] Implement brain URL + PAT configuration
- [x] Implement domain blocklist management
- [x] Implement test connection button
- [x] Code quality check passes (all manifest refs verified)


---

## ✅ Phase 4: Integration Testing & Verification

- [x] Code quality: `node .agent/skills/code-quality/scripts/start-here-ts.mjs`
- [x] Lint: `node .agent/skills/code-quality/scripts/start-here-lint.mjs`
- [x] Test suite: `npm test`
- [x] Smoke: `npx total-recall share "https://example.com"` queues research
- [x] Smoke: `npx total-recall share --text "Test fact"` creates fact node
- [x] Smoke: Research UI lifecycle buttons work
- [x] Smoke: Steer modal appends direction notes
- [x] Smoke: Citation cards show favicons
- [x] Smoke: Extension loads unpacked without errors
- [x] Smoke: Right-click "Send to Brain" works
- [x] Smoke: Side panel shows related memories
- [x] Smoke: Popup quick note works
