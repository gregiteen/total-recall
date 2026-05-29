# PRD: Ingestion Pipeline, Chrome Extension & Research UI

**Companion to**: [DECOUPLED_BRAIN_LAYERS_PRD.md](./DECOUPLED_BRAIN_LAYERS_PRD.md) (Brain Architecture Overhaul)
**Depends on**: Brain Architecture Changes 5 (Brain-Scoped API) and 7 (Thread-Level Brain) must land first.

## Vision

Total Recall today is a **passive vault** — memories only enter through CLI commands and IDE sessions. The brain should be an **active intelligence engine** that:

- **Sees what you see** — a Chrome Extension overlays contextual memories on every page you visit
- **Accepts input from everywhere** — Share-to-Brain from browser, mobile, voice, Google Takeout
- **Researches autonomously** — share a link, the brain goes deep and reports back
- **Gives you control** — pause, steer, conclude, and drill into research visually

### What Exists Today

| Component | Status | Notes |
|---|---|---|
| `POST /api/sessions/ingest` | ✅ Ready | `source` is `z.string()` — accepts any source type |
| `POST /api/memory` | ✅ Ready | Full CRUD, no restrictions on `source.type` |
| `/api/capture/:source` | ⚠️ Hardcoded | Only accepts `['slack', 'discord']` — trivial to extend |
| `x_citations` schema field | ✅ Ready | Has `url`, `title`, `source`, `relevance`, `accessed` |
| PAT auth + scoped tokens | ✅ Ready | Extension can authenticate immediately |
| Session embedding + search | ✅ Ready | Auto-embeds via `nomic-embed-text` |
| Research queue API | ✅ Ready | Full CRUD: `GET/POST/PATCH/DELETE /api/research` |
| Research UI | ⚠️ Partial | Table + expand + stepper exists. No lifecycle controls. |
| Chrome extension | ❌ None | Zero extension code in the codebase |
| File/media upload | ❌ None | No multer, no upload endpoint, no binary handling |
| Google Takeout parser | ❌ None | No ingestion CLI |

---

## Part 1: Share-to-Brain

The universal entry point for all ingestion. Everything else (Chrome extension, Google Takeout, voice notes) calls this endpoint.

### 1.1 New API Endpoint

```
POST /api/share
Authorization: Bearer <PAT>
Content-Type: application/json
```

**Request:**
```json
{
  "url": "https://example.com/article",
  "title": "Optional page title",
  "excerpt": "Optional selected text or page excerpt",
  "source": "chrome-extension",
  "action": "auto",
  "brainId": "global",
  "tags": ["optional", "tags"]
}
```

| Field | Required | Description |
|---|---|---|
| `url` | One of `url` or `excerpt` required | URL to research or remember |
| `title` | Optional | Page title (auto-fetched if URL provided and title missing) |
| `excerpt` | One of `url` or `excerpt` required | Selected text or page content |
| `source` | Optional (default: `'api'`) | Origin identifier for tracking |
| `action` | Optional (default: `'auto'`) | `'remember'`, `'research'`, or `'auto'` |
| `brainId` | Optional (default: `'global'`) | Which brain to store in |
| `tags` | Optional | Tags to apply to the created node |

**Behavior by action:**
- `remember` → Creates a `fact` node with `x_citations[{url, title}]` and `excerpt` as body
- `research` → Queues a research project: `POST /api/research { topic: title, notes: excerpt, url }`
- `auto` (default) → Heuristic:
  - Has URL + no excerpt → `research`
  - Has excerpt < 500 chars → `remember` as fact
  - Has excerpt > 500 chars → `remember` as concept
  - Has URL + excerpt → `remember` with URL as citation

**Response:**
```json
{
  "action_taken": "research",
  "id": "research-a1b2c3",
  "slug": null,
  "message": "Queued research: 'Article Title'. Brain will process in background."
}
```

### 1.2 CLI Command

```bash
# Share a URL for research
npx total-recall share "https://example.com/cool-article"
# → ✅ Queued research: "Cool Article" (id: research-a1b2c3)

# Share with explicit action
npx total-recall share "https://example.com" --action remember --tags "reading-list"
# → ✅ Saved as fact: facts/cool-article-a1b2.md

# Share text as a memory
npx total-recall share --text "The speed of light is 299,792,458 m/s" --tags "physics,constants"
# → ✅ Saved as fact: facts/speed-of-light-c3d4.md

# Share to a specific brain
npx total-recall share "https://example.com" --brain total-recall --action research
```

### 1.3 Implementation

**Files to create/modify:**
- `src/server/routes/share.mjs` — new route handler
- `src/cli/commands/share.mjs` — new CLI command
- `src/server/rest.mjs` — mount the new route
- `src/core/readability.mjs` — URL content extraction (optional, for auto-titling)

**URL auto-titling**: When `url` is provided but `title` is missing, do a lightweight `fetch(url)` and parse the `<title>` tag. Don't block the response — queue this as a background enhancement and update the node/research item after extraction.

---

## Part 2: Chrome Extension (MV3)

### 2.1 Core Features

#### Context Menu (Right-Click)
- **"Send to Brain"** — queues the current page URL via `POST /api/share { url, title, action: 'research' }`
- **"Remember This"** (with selected text) — `POST /api/share { url, title, excerpt: selectedText, action: 'remember' }`
- **"Research This"** (with selected text) — `POST /api/share { excerpt: selectedText, action: 'research' }`

#### Contextual Memory Overlay (Content Script)
On every page load:
1. Capture page context: `{ url, title, description: meta[name=description], domain }`
2. Query brain: `POST /api/memory/search/semantic { query: title + description, top_k: 3 }`
3. If matches found, render a **floating pill** in corner: `🧠 3 memories`
4. Click pill → opens the Side Panel

**Throttling**: Only query the brain once per page load. Cache results keyed by URL. Don't query on `chrome://`, `about:`, or blocklisted domains.

**CSP handling**: The content script overlay renders in a Shadow DOM to avoid conflicts with page styles and Content Security Policy restrictions.

#### Side Panel (chrome.sidePanel API)
Persistent panel showing:
- **Related Memories** — semantic matches for the current page, rendered as cards with title, category badge, excerpt
- **Quick Actions bar**:
  - 📌 "Remember this page" → `POST /api/share { url, title, action: 'remember' }`
  - 🔬 "Research this page" → `POST /api/share { url, title, action: 'research' }`
  - ✏️ "Add note" → textarea → `POST /api/memory { category: 'lore', body: note, x_citations: [{url}] }`
- **Research Feed** — live list of active research projects with status badges
- **Brain Search** — text input → `POST /api/memory/search/semantic` → results

#### Popup (Extension Icon Click)
Minimal popup:
- Text field: "Quick note..." → `POST /api/share { excerpt: text, action: 'remember' }`
- URL field: "Research URL..." → `POST /api/share { url, action: 'research' }`
- Toggle: Enable/disable passive tracking
- Status indicator: `Connected to brain at localhost:3000 ✅`
- Error state: `⚠️ Cannot reach brain — check server`

#### Passive Browsing Context (Opt-In)
Background service worker tracks browsing via `chrome.webNavigation.onCompleted`:

```js
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const tab = await chrome.tabs.get(details.tabId);
  if (isBlocklisted(new URL(tab.url).hostname)) return;
  
  // Batch writes: accumulate visits, flush every 30s
  visitBuffer.push({ url: tab.url, title: tab.title, timestamp: Date.now() });
});

// Flush every 30 seconds
setInterval(async () => {
  if (visitBuffer.length === 0) return;
  const batch = visitBuffer.splice(0);
  await fetch(`${brainUrl}/api/sessions/ingest`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'chrome-extension',
      messages: batch.map(v => ({ role: 'system', content: `Visited: ${v.url} — "${v.title}"`, timestamp: v.timestamp }))
    })
  });
}, 30000);
```

**Rate limiting**: Batched writes every 30s. Max 100 visits per batch. Dedup consecutive visits to the same URL.

### 2.2 Privacy Controls

| Control | Default | Storage |
|---|---|---|
| Incognito mode | Disabled (MV3 default) | manifest.json `"incognito": "not_allowed"` |
| Domain blocklist | Banking, health patterns | `chrome.storage.sync` |
| Capture granularity | URLs + titles only | `chrome.storage.sync` |
| Passive tracking | **Off by default** (opt-in) | `chrome.storage.sync` |
| Data destination | localhost only | `chrome.storage.sync` |
| Remote brain URL | Must be explicitly configured + PAT set | `chrome.storage.sync` |

**Default blocklist patterns**: `*.bank.*`, `*.chase.com`, `*.wellsfargo.com`, `*.health.*`, `*medical*`, `*pharmacy*`, `mail.google.com` (use Gmail connector instead), `chrome://*`, `chrome-extension://*`

### 2.3 Extension Architecture

```
extension/
├── manifest.json              # MV3 manifest with permissions
├── background.js              # Service worker: API proxy, history batching, badge updates
├── content-script.js          # Page context capture + shadow DOM overlay
├── content-script.css         # Overlay styles (dark glassmorphism theme)
├── sidepanel/
│   ├── sidepanel.html         # Side panel layout
│   ├── sidepanel.js           # Memory cards, search, research feed
│   └── sidepanel.css          # Panel styles (matches dashboard theme)
├── popup/
│   ├── popup.html             # Quick actions popup
│   ├── popup.js               # Quick note, URL share, toggle
│   └── popup.css              # Popup styles
├── options/
│   ├── options.html           # Settings: brain URL, PAT, blocklist, tracking
│   ├── options.js             # Settings logic with validation
│   └── options.css            # Settings styles
├── icons/
│   ├── icon-16.png            # Toolbar icon
│   ├── icon-48.png            # Extensions page
│   └── icon-128.png           # Chrome Web Store
└── lib/
    └── brain-client.js        # Shared API client: auth, endpoints, error handling, retry
```

**Manifest permissions**:
```json
{
  "manifest_version": 3,
  "permissions": ["activeTab", "contextMenus", "sidePanel", "storage"],
  "optional_permissions": ["history", "webNavigation"],
  "host_permissions": ["http://127.0.0.1:*/*", "http://localhost:*/*"]
}
```

**Note**: `history` and `webNavigation` are optional permissions requested only when the user enables passive tracking. `host_permissions` are locked to localhost by default; remote brain URLs require user approval via `chrome.permissions.request()`.

### 2.4 Auth Flow

1. User opens extension Options page
2. Enters brain URL (`http://localhost:3000`) and PAT token (`tr_pat_...`)
3. Extension validates by calling `GET /health` with the PAT
4. On success, stores to `chrome.storage.sync`
5. All subsequent API calls include `Authorization: Bearer <PAT>`
6. If any call returns 401 → show "⚠️ Auth expired" badge on extension icon

### 2.5 IntegrationsPage Preset

Add to [IntegrationsPage.tsx](file:///Users/greg/Github/total-recall/frontend/src/pages/IntegrationsPage.tsx):
```ts
{
  id: 'chrome-extension',
  name: 'Chrome Extension',
  description: 'Contextual memory overlay, Share-to-Brain, and passive browsing context',
  icon: '🌐',
  mode: 'extension',
  instructions: 'Install from Chrome Web Store or load unpacked from /extension directory. Enter your brain URL and PAT in the extension settings.'
}
```

---

## Part 3: Research UI Improvements

### 3.1 Research Lifecycle Controls

**Current state**: [ResearchAgendaTab.tsx](file:///Users/greg/Github/total-recall/frontend/src/components/ResearchAgendaTab.tsx) has expand/collapse and a 5-phase stepper, but no action buttons. The `PATCH /api/research/:id` and `DELETE /api/research/:id` endpoints exist ([rest.mjs](file:///Users/greg/Github/total-recall/src/server/rest.mjs#L534-L550) L534-550) but no frontend calls them.

**Add to expanded research view** (after the stepper, before the report):

```tsx
<div className="research-controls" style={{ display: 'flex', gap: 8, padding: '12px 0' }}>
  {item.status === 'in_progress' && (
    <button onClick={() => patchResearch(item.id, { status: 'paused' })}>⏸ Pause</button>
  )}
  {(item.status === 'paused' || item.status === 'failed') && (
    <button onClick={() => patchResearch(item.id, { status: 'pending' })}>▶️ Resume</button>
  )}
  {item.status === 'done' && (
    <button onClick={() => patchResearch(item.id, { status: 'pending', research_phase: 'acquisition' })}>
      🔄 Re-run
    </button>
  )}
  <button onClick={() => setSteerModalOpen(item.id)}>🎯 Steer</button>
  {item.status !== 'done' && (
    <button onClick={() => patchResearch(item.id, { status: 'done' })}>✅ Conclude</button>
  )}
  <button onClick={() => deleteResearch(item.id)} className="btn-danger">❌ Cancel</button>
</div>
```

**New API function** (add to [api.ts](file:///Users/greg/Github/total-recall/frontend/src/api.ts)):
```ts
export async function patchResearch(id: string, updates: Partial<ResearchItem>): Promise<ResearchItem> {
  const res = await apiFetch(`${API_BASE}/api/research/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(`Research PATCH error: ${res.status}`)
  return res.json()
}

export async function deleteResearch(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/research/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Research DELETE error: ${res.status}`)
}
```

**Steer modal**: When "🎯 Steer" is clicked, show a modal with:
- Current notes (read-only, for reference)
- Textarea: "Add steering direction..."
- Submit → `PATCH /api/research/:id { notes: existingNotes + '\n\n---\nSTEERING: ' + newDirection }`
- The daemon reads `notes` on the next processing cycle and adjusts research direction

### 3.2 Report Improvements

**Current state**: Report body is rendered as scrollable markdown (max 350px) with citation pills extracted via `extractSources()` (L486-523).

**Improvements**:

1. **Full-height report** — Remove `maxHeight: 350` cap. Use a "Show more / Show less" toggle instead, defaulting to collapsed (first 500px visible).

2. **Table of Contents** — Auto-generate from H2/H3 headings in the report body:
   ```tsx
   const headings = (node.content || '').match(/^#{2,3}\s+.+$/gm) || [];
   // Render as clickable sidebar anchors
   ```

3. **Citation cards** — Replace plain `🔗 source.com` pills with richer cards:
   ```tsx
   <div className="citation-card">
     <img src={`https://www.google.com/s2/favicons?domain=${domain}`} width={16} />
     <div>
       <div className="citation-title">{src.text}</div>
       <div className="citation-domain">{domain}</div>
     </div>
     <button onClick={() => window.open(src.url, '_blank')}>Open</button>
     <button onClick={() => shareToResearch(src.url)}>🔬 Research deeper</button>
   </div>
   ```
   The "Research deeper" button queues a sub-research project on that specific citation URL.

4. **Research timeline** — Show when each phase completed:
   ```
   🔍 Acquisition (3:42 PM) → 🧠 Deliberation (3:44 PM) → ✨ Clarity (3:45 PM) → ✅ Done
   ```
   Requires persisting phase timestamps in the research queue item (extend `PATCH /api/research/:id` to accept `phase_timestamps` object).

### 3.3 Research from Chat (URL Detection)

**In [ChatPage.tsx](file:///Users/greg/Github/total-recall/frontend/src/pages/ChatPage.tsx)**: When the user pastes a URL in the chat input:

1. Detect URLs in the input field via regex: `/https?:\/\/[^\s]+/`
2. Show a subtle action bar below the input:
   ```
   🔗 URL detected: example.com  |  [🔬 Research this] [📌 Remember this] [Send as message]
   ```
3. "Research this" → `POST /api/share { url, action: 'research' }` + add a system note to the chat
4. "Remember this" → `POST /api/share { url, action: 'remember' }`
5. "Send as message" → default behavior (just send the message with the URL)

### 3.4 Auto-Refresh

Research items should poll for updates while the tab is visible:
```tsx
useEffect(() => {
  const interval = setInterval(() => {
    if (document.visibilityState === 'visible') {
      refreshResearchItems();
    }
  }, 10000); // 10s
  return () => clearInterval(interval);
}, []);
```

Only poll while the ResearchAgendaTab is active and the document is visible. Stop polling when the user switches to another tab.

---

## Part 4: Google Takeout Ingestion

### 4.1 CLI Command

```bash
npx total-recall ingest google-takeout ~/Downloads/Takeout/
```

**Options:**
```
--brain <id>           Target brain (default: 'global')
--dry-run              Preview what would be imported without writing
--types <list>         Comma-separated data types to import (default: all)
                       Valid: search,location,youtube,bookmarks,keep,calendar,contacts
--cluster              Run semantic clustering after import (default: true)
--no-cluster           Skip clustering, import raw entries
--max-age <duration>   Only import entries newer than (e.g. "1y", "6m")
```

### 4.2 Parser Pipeline

Each data type gets its own parser module. Parsers are pure functions: `(filePath) → MemoryNode[]`.

```
src/cli/ingest/
├── index.mjs                 # CLI entry point, walks Takeout dir, runs parsers
├── parsers/
│   ├── search-history.mjs    # My Activity/Search/*.json → topic clusters
│   ├── location-history.mjs  # Location History/Records.json → named places
│   ├── youtube-history.mjs   # YouTube/history/*.json → interest topics
│   ├── chrome-bookmarks.mjs  # Chrome/Bookmarks.html → fact nodes
│   ├── google-keep.mjs       # Keep/*.json → lore/concept nodes
│   ├── calendar.mjs          # Calendar/*.ics → event fact nodes
│   ├── contacts.mjs          # Contacts/All Contacts/*.vcf → lore nodes
│   └── maps-reviews.mjs      # Maps/Reviews.json → lore nodes
└── utils/
    ├── dedup.mjs              # sha256 dedup against existing vault
    ├── cluster.mjs            # Semantic clustering (groups similar entries)
    └── takeout-walker.mjs     # Recursively walks Takeout dir, detects data types
```

### 4.3 Data Mapping

| Takeout Source | File Pattern | SSSS Category | Source Type | Clustering Strategy |
|---|---|---|---|---|
| Search History | `My Activity/Search/*.json` | `facts` | `google-search-history` | Group by topic via embedding similarity (10k queries → 50-100 topic nodes) |
| Location History | `Location History/Records.json` | `lore` | `google-location-history` | Group by named place (geocode clusters within 200m → single place node) |
| YouTube History | `YouTube and YouTube Music/history/*.json` | `facts` | `youtube-history` | Group by channel + topic |
| Chrome Bookmarks | `Chrome/Bookmarks.html` | `facts` | `chrome-bookmarks` | Keep as-is, group by bookmark folder |
| Google Keep | `Keep/*.json` | `lore` | `google-keep` | Keep as-is (user's own words — highest value) |
| Calendar | `Calendar/*.ics` | `facts` | `google-calendar` | Keep as-is (structured events with date/attendees) |
| Contacts | `Contacts/*.vcf` | `lore` | `google-contacts` | Keep as-is |
| Maps Reviews | `Maps (My Places)/Reviews.json` | `lore` | `google-maps-reviews` | Keep as-is |

### 4.4 Clustering (The Key Innovation)

Raw Google Takeout data is too noisy. 10,000 search queries don't create 10,000 memory nodes. Instead:

1. **Parse** all raw entries into candidate nodes
2. **Embed** each candidate using `nomic-embed-text`
3. **Cluster** by cosine similarity (threshold: 0.85)
4. **Summarize** each cluster into a single node:
   - Title: auto-generated from cluster centroid keywords
   - Body: representative entries + count
   - Tags: auto-tagged from common terms
   - `x_temporal_context`: date range of entries in the cluster

**Example**: 47 searches about "kubernetes helm charts" → one node:
```yaml
title: "Kubernetes & Helm Charts — Active Interest"
category: facts
source:
  type: google-search-history
  agent: total-recall-ingest
tags: [kubernetes, helm, devops, containers]
body: |
  Researched extensively between March-June 2025.
  Key queries: "helm chart best practices", "kubernetes resource limits",
  "helm vs kustomize", "k8s ingress nginx setup" (47 searches total)
x_temporal_context: "March 2025 — June 2025"
```

### 4.5 Post-Import Report

```
✅ Google Takeout import complete!

  Source                Parsed    Clusters    New Nodes   Skipped (dup)
  ─────────────────────────────────────────────────────────────────────
  Search History        12,847    73          73          0
  Location History      4,231     42          42          0
  YouTube History       2,156     28          28          0
  Chrome Bookmarks      342       —           342         0
  Google Keep           89        —           89          0
  Calendar              1,247     —           1,247       0
  Contacts              156       —           156         0
  ─────────────────────────────────────────────────────────────────────
  Total                 21,068    143         1,977       0

  ⏱ Time elapsed: 4m 32s
  🧠 Brain: global
  📦 Vault recompiled. Embeddings rebuilt.
```

### 4.6 Privacy & Sensitivity

- All imported nodes auto-tagged with `source: 'google-takeout'`
- Location data auto-flagged as `privacy: 'local_only'` (never sent to frontier APIs)
- Contact names and emails auto-flagged as `privacy: 'local_only'`
- `--dry-run` mode for preview before committing anything

---

## Part 5: Additional Ingestion Channels (Future)

These are **not in scope for the initial build** but the architecture should support them:

### 5.1 Voice Notes
```bash
npx total-recall voice                     # Start recording (requires mic access)
npx total-recall voice --file memo.m4a     # Transcribe existing file
```
Pipeline: Audio → Whisper STT → transcript → `POST /api/share { excerpt, source: 'voice-note' }`

**Note**: Kokoro TTS is already integrated for output. Whisper integration for input would complete the voice loop.

### 5.2 Image/File Upload
New endpoint:
```
POST /api/files/upload
Content-Type: multipart/form-data
```
Pipeline: Upload → store in `files/` → (optional) vision model description → memory node with `x_media_refs`.

**Requires**: `multer` middleware (not currently installed), file storage management, cleanup policies.

### 5.3 Web Share Target (PWA)
If the dashboard is installed as a PWA, register as a Web Share Target so mobile browsers can share-to-brain:
```json
{
  "share_target": {
    "action": "/share",
    "method": "POST",
    "params": { "title": "title", "text": "text", "url": "url" }
  }
}
```

### 5.4 Gmail/Calendar Connectors
OAuth2 → incremental sync → fact nodes. Heavy privacy implications — requires consent framework, data classification, local-only enforcement. **Defer to a separate project.**

### 5.5 Location Tracking
If UltraChat provides location: periodic `POST /api/sessions/ingest { source: 'location' }`. Requires new schema field `x_location: { lat, lon, label }`.

---

## Part 6: Schema Extensions

Add to [schema.mjs](file:///Users/greg/Github/total-recall/src/core/schema.mjs):

```js
// New optional fields for ingestion metadata
x_location: z.object({
  lat: z.number(),
  lon: z.number(),
  label: z.string().optional(),
  accuracy: z.number().optional(),
}).optional().nullable(),

x_media_refs: z.array(z.object({
  path: z.string(),
  type: z.enum(['image', 'audio', 'video', 'document']),
  description: z.string().optional(),
  size_bytes: z.number().optional(),
})).optional().nullable(),

x_browser_context: z.object({
  url: z.string(),
  domain: z.string().optional(),
  title: z.string().optional(),
  tab_group: z.string().optional(),
  visit_count: z.number().optional(),
}).optional().nullable(),
```

These are **additive** and fully backward compatible (all `.optional().nullable()`).

---

## Part 7: Quick Capture Source Extension

**Current**: [quick-capture.mjs](file:///Users/greg/Github/total-recall/src/core/quick-capture.mjs) L105 hardcodes `['slack', 'discord']`.

**Change**: Replace hardcoded array with an open set:
```js
const VALID_SOURCES = new Set([
  'slack', 'discord', 'telegram',
  'chrome-extension', 'share-sheet',
  'ios-shortcut', 'android-intent',
  'voice-note', 'gmail', 'calendar',
  'google-takeout', 'obsidian',
  'api',  // generic fallback
]);

// Or even simpler: accept any string and just validate it's alphanumeric+hyphens
function isValidSource(source) {
  return /^[a-z0-9-]+$/.test(source);
}
```

---

## Implementation Priority

### Phase 1: Share-to-Brain Foundation (2-3 days)
- [ ] `POST /api/share` endpoint with auto-routing logic
- [ ] `npx total-recall share` CLI command
- [ ] Extend quick-capture source whitelist (or remove whitelist entirely)
- [ ] Schema extensions (`x_location`, `x_media_refs`, `x_browser_context`)
- [ ] Research lifecycle buttons in ResearchAgendaTab UI (pause/resume/steer/conclude/cancel)
- [ ] `patchResearch()` and `deleteResearch()` API functions in frontend

### Phase 2: Chrome Extension MVP (1-2 weeks)
- [ ] MV3 manifest + background service worker
- [ ] `lib/brain-client.js` shared API client with PAT auth
- [ ] Context menu: "Send to Brain" + "Remember This" + "Research This"
- [ ] Popup: quick note, URL share, tracking toggle, connection status
- [ ] Side Panel: related memories, brain search, research feed
- [ ] Content script: shadow DOM overlay with floating pill
- [ ] Options page: brain URL, PAT, domain blocklist, capture granularity
- [ ] IntegrationsPage preset card in dashboard
- [ ] Privacy controls (opt-in tracking, incognito exclusion, domain blocklist)

### Phase 3: Research UI Polish (3-5 days)
- [ ] Report expand/collapse toggle (remove 350px cap)
- [ ] Auto-generated table of contents from headings
- [ ] Citation cards with favicons, domain, "Research deeper" action
- [ ] Steer modal with textarea for adding research direction
- [ ] Auto-refresh polling (10s, visibility-aware)
- [ ] URL detection in chat input with action bar
- [ ] Research timeline with phase timestamps

### Phase 4: Google Takeout Ingestion (1-2 weeks)
- [ ] `npx total-recall ingest google-takeout <path>` CLI command
- [ ] Takeout directory walker with data type detection
- [ ] Parser modules: search, youtube, bookmarks, keep, calendar, contacts, location
- [ ] Semantic clustering pipeline (embed → cluster → summarize)
- [ ] Dedup against existing vault
- [ ] Privacy auto-flagging (location, contacts → `local_only`)
- [ ] Post-import report with stats
- [ ] `--dry-run` preview mode

### Phase 5: Extended Channels (Future — separate projects)
- [ ] Voice note recording + Whisper STT
- [ ] File/image upload endpoint + media handling
- [ ] PWA Web Share Target
- [ ] Location tracking ingestion
- [ ] Gmail/Calendar OAuth2 connectors

---

## Acceptance Criteria

### Share-to-Brain
- [ ] `POST /api/share` accepts URL/text and routes to memory or research
- [ ] `auto` action correctly chooses between `remember` and `research`
- [ ] `npx total-recall share <url>` works from CLI
- [ ] `npx total-recall share --text "..."` creates a fact node
- [ ] Share endpoint respects `brainId` parameter
- [ ] URL auto-titling works when title is missing

### Chrome Extension
- [ ] Extension loads unpacked from `/extension` directory
- [ ] Context menu items appear on right-click
- [ ] "Send to Brain" queues research via `/api/share`
- [ ] "Remember This" with selected text creates a fact node
- [ ] Side Panel shows related memories for the current page
- [ ] Popup shows connection status and quick actions
- [ ] Passive tracking is opt-in and respects domain blocklist
- [ ] Extension authenticates via PAT token stored in `chrome.storage.sync`
- [ ] 401 responses show "Auth expired" badge on extension icon
- [ ] Content script overlay renders in Shadow DOM (no CSP conflicts)

### Research UI
- [ ] Pause/Resume/Steer/Conclude/Cancel buttons visible in expanded view
- [ ] Buttons correctly call `PATCH /api/research/:id` with proper status
- [ ] Steer modal appends direction to research notes
- [ ] Report section expands beyond 350px with toggle
- [ ] Citation cards show favicons and "Research deeper" action
- [ ] Auto-refresh polls every 10s when tab is visible
- [ ] URL detection in chat input shows action bar

### Google Takeout
- [ ] CLI parses Takeout directory and detects data types
- [ ] Each parser produces valid SSSS memory nodes
- [ ] Clustering reduces 10k+ search queries to manageable topic nodes
- [ ] `--dry-run` shows preview without writing
- [ ] `--types` flag filters which data types to import
- [ ] Location and contact data auto-flagged as `local_only`
- [ ] Dedup prevents re-importing existing data
- [ ] Post-import stats printed to console
