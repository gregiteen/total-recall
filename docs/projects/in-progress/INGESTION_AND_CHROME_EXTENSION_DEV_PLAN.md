# Development Plan: Ingestion Pipeline & Chrome Extension

**PRD**: [INGESTION_AND_CHROME_EXTENSION_PRD.md](./INGESTION_AND_CHROME_EXTENSION_PRD.md)
**Tracker**: [INGESTION_AND_CHROME_EXTENSION_PROJECT_TRACKER.md](./INGESTION_AND_CHROME_EXTENSION_PROJECT_TRACKER.md)
**Depends on**: Brain Architecture project must be complete first.

---

## Agent Assignment Matrix

| Agent | Role | Component | Key Files | Dependencies |
|-------|------|-----------|-----------|-------------|
| **Agent A** | Share API Builder | Share-to-Brain endpoint + CLI | `src/server/routes/share.mjs` (new), `src/cli/commands/share.mjs` (new), `rest.mjs` | None |
| **Agent B** | Schema Extender | SSSS schema extensions | `src/core/schema.mjs`, `src/core/quick-capture.mjs` | None |
| **Agent C** | Research UI Engineer | Research lifecycle controls | `ResearchAgendaTab.tsx`, `api.ts` | None |
| **Agent D** | Extension Core Builder | Chrome MV3 extension skeleton | `extension/` (new directory) | Agent A (needs `/api/share` endpoint) |
| **Agent E** | Extension UI Builder | Side panel + popup + content script | `extension/sidepanel/`, `extension/popup/`, `extension/content-script.*` | Agent D (needs manifest + brain-client) |
| **Agent F** | Takeout Parser Builder | Google Takeout CLI + parsers | `src/cli/ingest/` (new directory) | Agent B (needs schema extensions) |
| **Agent G** | Research Polish | Report drill-down, citations, chat URL detection | `ResearchAgendaTab.tsx`, `ChatPage.tsx` | Agent C (touches same file) |

### Execution Waves

```
Wave 1 (parallel): Agent A, Agent B, Agent C
Wave 2 (parallel): Agent D, Agent F, Agent G
Wave 3 (serial):   Agent E (after Agent D — needs extension skeleton)
```

---

## Wave 1: Foundation (Parallel — No Dependencies)

### Agent A: Share API Builder

**Goal**: Create `POST /api/share` endpoint and `npx total-recall share` CLI command.

**Steps**:
1. Create `src/server/routes/share.mjs`:
   - Accept `{ url, title, excerpt, source, action, brainId, tags }`
   - Implement `auto` action routing heuristic
   - For `remember`: call `writeNode()` to create fact/concept node
   - For `research`: call `addToQueue()` to create research project
   - Add URL auto-titling (fetch + parse `<title>`)
2. Mount in `rest.mjs`: `router.use(shareRoutes)`
3. Create `src/cli/commands/share.mjs`:
   - Parse URL from argv
   - Support `--text`, `--action`, `--tags`, `--brain` flags
   - Call `POST /api/share` via local API or direct vault write
4. Register command in `bin/total-recall.mjs`
5. Verify: Code quality check passes

### Agent B: Schema Extender

**Goal**: Add `x_location`, `x_media_refs`, `x_browser_context` to SSSS schema. Open up quick-capture source whitelist.

**Steps**:
1. In `src/core/schema.mjs`: Add the three new optional fields
2. In `src/core/quick-capture.mjs` L105: Replace hardcoded `['slack', 'discord']` with `isValidSource()` regex check
3. Verify schema validation still passes for existing nodes
4. Verify: Code quality check passes

### Agent C: Research UI Engineer

**Goal**: Add lifecycle buttons (pause/resume/steer/conclude/cancel) to ResearchAgendaTab.

**Steps**:
1. Add `patchResearch()` and `deleteResearch()` API functions to `api.ts`
2. Add control buttons to expanded research row in `ResearchAgendaTab.tsx`
3. Show/hide buttons based on current status:
   - `in_progress` → Pause, Steer, Conclude
   - `paused` / `failed` → Resume, Cancel
   - `done` → Re-run
   - Always → Cancel, Steer
4. Build steer modal component (textarea for direction notes)
5. Wire buttons to API calls with optimistic UI update
6. Add auto-refresh polling (10s, visibility-aware)
7. Verify: Code quality check passes

---

## Wave 2: Features (After Wave 1 Completes)

### Agent D: Extension Core Builder

**Goal**: Create Chrome MV3 extension skeleton with manifest, background worker, and shared API client.

**Steps**:
1. Create `extension/manifest.json` with MV3 permissions
2. Create `extension/lib/brain-client.js` — shared API client with PAT auth, error handling, retry
3. Create `extension/background.js` — service worker:
   - Context menu registration ("Send to Brain", "Remember This", "Research This")
   - Context menu handlers → call brain-client → POST /api/share
   - Badge count updates for active research
   - Passive browsing buffer (opt-in, batched writes)
4. Create `extension/icons/` with placeholder icons
5. Verify: Extension loads unpacked in Chrome without errors

### Agent F: Takeout Parser Builder

**Goal**: Create Google Takeout CLI command and first 4 parser modules.

**Steps**:
1. Create `src/cli/ingest/index.mjs` — CLI entry point:
   - `npx total-recall ingest google-takeout <path>`
   - Walk Takeout directory, detect data types
   - `--dry-run`, `--types`, `--brain`, `--max-age` flags
2. Create `src/cli/ingest/utils/takeout-walker.mjs` — recursive dir walker
3. Create `src/cli/ingest/utils/dedup.mjs` — sha256 dedup
4. Create `src/cli/ingest/parsers/search-history.mjs` — parse `My Activity/Search/*.json`
5. Create `src/cli/ingest/parsers/chrome-bookmarks.mjs` — parse `Chrome/Bookmarks.html`
6. Create `src/cli/ingest/parsers/google-keep.mjs` — parse `Keep/*.json`
7. Create `src/cli/ingest/parsers/youtube-history.mjs` — parse `YouTube/history/*.json`
8. Implement post-import stats report
9. Register CLI command in `bin/total-recall.mjs`
10. Verify: Code quality check passes

### Agent G: Research Polish

**Goal**: Improve report drill-down, citation cards, and chat URL detection.

**Steps**:
1. Remove `maxHeight: 350` cap from report div in `ResearchAgendaTab.tsx`
2. Add expand/collapse toggle (default: collapsed at 500px)
3. Upgrade citation pills to cards with favicons: `https://www.google.com/s2/favicons?domain=<domain>`
4. Add "Research deeper" button on citation cards → calls `POST /api/share { url, action: 'research' }`
5. In `ChatPage.tsx`: Add URL detection regex on input field
6. Show action bar when URL detected: [🔬 Research] [📌 Remember] [Send as message]
7. Wire action bar buttons to `POST /api/share`
8. Verify: Code quality check passes

---

## Wave 3: Extension UI (After Agent D)

### Agent E: Extension UI Builder

**Goal**: Build side panel, popup, content script, and options page.

**Steps**:
1. Create `extension/sidepanel/sidepanel.html` + `sidepanel.js` + `sidepanel.css`:
   - Related memories list (calls brain-client semantic search)
   - Quick actions bar (remember, research, note)
   - Research feed (list active projects)
   - Brain search input
2. Create `extension/popup/popup.html` + `popup.js` + `popup.css`:
   - Quick note text field
   - URL share field
   - Passive tracking toggle
   - Connection status indicator
3. Create `extension/content-script.js` + `extension/content-script.css`:
   - Capture page context (URL, title, meta description)
   - Query brain for related memories via background worker message passing
   - Render floating pill in Shadow DOM (bottom-right corner)
   - Click pill → open side panel
4. Create `extension/options/options.html` + `options.js` + `options.css`:
   - Brain URL input + validation
   - PAT token input
   - Domain blocklist management
   - Capture granularity selector
   - Test connection button
5. Verify: Extension loads, context menu works, side panel opens, popup functions

---

## Verification Phase

After all agents complete:
1. Run code quality: `node .agent/skills/code-quality/scripts/start-here-ts.mjs`
2. Run lint: `node .agent/skills/code-quality/scripts/start-here-lint.mjs`
3. Run test suite: `npm test`
4. Manual smoke tests:
   - `npx total-recall share "https://example.com"` → queues research
   - `npx total-recall share --text "Test fact" --tags "test"` → creates fact node
   - Research UI: pause/resume/steer buttons work
   - Research UI: steer modal adds direction to notes
   - Research UI: citation cards show favicons
   - Extension: loads unpacked without errors
   - Extension: right-click "Send to Brain" queues research
   - Extension: side panel shows related memories
   - Extension: popup quick note creates a fact node
