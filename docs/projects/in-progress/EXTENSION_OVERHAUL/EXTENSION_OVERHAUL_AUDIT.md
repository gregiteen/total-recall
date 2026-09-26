# EXTENSION_OVERHAUL — Audit

> **Project Prefix**: `EXTENSION_OVERHAUL`
> **Kanban State**: In progress
> **Date**: 2026-09-22
> **Trigger**: User request — "analyze and improve the browser extension - make sure the visual quality is top notch and matches the app's aesthetic, make sure everything works, add useful features, remove those that aren't useful."

Evidence came from reading every file in `extension/` and the server routes it calls, then hitting the live brain (`com.totalrecall.brain`, v3.28.1 on `127.0.0.1:3000`) with a temporary scoped PAT.

## 1. Inventory

| File | Lines | Role |
|---|---|---|
| `extension/manifest.json` | 38 | MV3, v0.1.0. Permissions `activeTab contextMenus sidePanel storage tabs`, optional `history webNavigation`, host perms localhost only |
| `extension/background.js` | 115 | Context menus, message router (`QUERY_BRAIN`, `SHARE`, `HEALTH_CHECK`, `OPEN_SIDE_PANEL`) |
| `extension/lib/brain-client.js` | 99 | Fetch wrapper, config resolution, chat |
| `extension/lib/preconfigured.js` | 5 | Always-empty `{brainUrl:'', pat:''}` |
| `extension/content-script.js` / `.css` | 517 / 16 | In-page "Related Memories" pill + overlay, `GET_PAGE_TEXT` responder |
| `extension/sidepanel/*` | 209 + 1106 + 971 | Five tabs: Memories, Chat, Research, Settings, Collab |
| `extension/popup/*` | 50 + 175 + 227 | Popup UI |
| `extension/options/*` | 73 + 111 + 218 | Options page |
| `extension/icons/*.png` | — | 16/48/128 px |

Server surfaces used: `POST /api/share` (`src/server/routes/share.mjs`), `POST /api/memory/search/semantic` and `GET /api/memory` (`src/server/routes/memory.mjs`), `GET /api/brains[/:id/nodes]` (`routes/brains.mjs`), `GET|DELETE /api/research` (`routes/research.mjs`), `POST /api/vault/compile`, `POST /v1/chat/completions` (`src/server/api.mjs:355`), `GET /api/extension/status` (`routes/extension.mjs`), `/api/collab/*` + `/collab-ws` (`routes/collab.mjs`).

## 2. Broken or wrong behavior

### 2.1 Security

1. **Stored XSS on every website** — `content-script.js:339-346` interpolates `mem.title`, `mem.content` and `mem.category` from the brain into `innerHTML` inside the overlay. Memory text is user-captured web content (selections, excerpts), so a captured `<img src=x onerror=…>` executes inside whatever page is open later. The closed shadow root doesn't stop script execution.
2. **Collab JWTs can be forged** — `src/server/routes/collab.mjs:10`: `JWT_SECRET = process.env.JWT_SECRET || 'total-recall-collab-secret-key-1234'`. The launchd brain does not set `JWT_SECRET`, so anyone who reads the public source can mint a token for any username.
3. **Collab chat is not scoped to groups** — `collab.mjs` `broadcastToUrl` sends `CHAT_MESSAGE` to every socket subscribed to the same URL, whatever their group. Two unrelated groups reading the same page see each other's messages.
4. **Absolute server paths leak through search** — live `POST /api/memory/search/semantic` results carry `_filePath`, `_filepath` and `_brainVault` (absolute vault paths). The `/api/memory` list route strips these with `sanitizeNode`; the semantic route does not.

### 2.2 Features that don't work

5. **The in-page pill fires on almost every page.** Search scores come from Reciprocal Rank Fusion (`src/core/search.mjs:199-222`) and are rank-based: the top semantic-only hit always scores ≈0.49, however unrelated it is. Live probes:
   - "Hacker News" → *ElevenLabs Text-to-Speech research report* (0.605)
   - "Wikipedia" → *OpenWiki init plan* (0.492)

   Nothing in the response says whether a hit is actually similar, so the extension can't filter out noise.
6. **Overlay renders `undefined`.** It reads `mem.content` (`content-script.js:341`), but semantic results carry `body`. Session hits (`type: 'session'`) have no title, category or body at all, and 3 of the top 5 hits for "total recall browser extension" were sessions.
7. **The popup is dead code.** `manifest.json` has no `action.default_popup`, and `background.js:14` sets `openPanelOnActionClick: true`, so `popup/*` (452 lines) never opens. Its "update available" link points at `/health`, not a download.
8. **"Recent Captures" isn't recent.** `sidepanel.js:113-131` fetches `GET /api/memory`, which returns the first 200 nodes in vault walk order (`memory.mjs:122-170`). It then sorts only that page, so newer captures past node 200 never show up. The global vault has 1,172 nodes.
9. **The active brain is ignored for search and capture.** `QUERY_BRAIN` drops `brainId` (`background.js:84`), and `share()` never sends it, so "Project" mode still searches and writes the global vault. Only the recent list and chat respect it.
10. **Chat is pinned to Gemini.** `brain-client.js:73` and `sidepanel.js:379` hardcode `model: 'gemini'`. `api.mjs:395-398` turns that into "elevate the agy/gemini agent to priority 0", which overrides the user's runtime routing. It also breaks the standing rules to avoid the Gemini API and never hardcode model strings.
11. **"Remember Page" saves only the URL.** With no excerpt, `share.mjs:102` stores `content: url`, so the memory holds no information about the page.
12. **Settings don't do what they say.**
    - **Capture Granularity** (Off/Minimal/Full, `options.html:41-59`) is read by nothing except the on/off bit.
    - **Passive tracking** ("Capture page logs in background") captures nothing. It only turns the related-memories pill on and off.
13. **Remote brains can't be reached.** `host_permissions` covers localhost only (`manifest.json:7`). Pointing the extension at a mesh or droplet brain fails CORS or permission checks with no explanation.
14. **The auth-error badge never clears.** `brain-client.js:37-40` sets a red `!` on 401 and never removes it, even after the PAT is fixed.
15. **Hidden vault write on every panel open.** `sidepanel.js:613-635` (`recordRememberInvariants`) silently runs a search and, on a miss, writes a hard-coded invariant (`never-use-copilot`) into the user's brain each time the side panel opens.
16. **The preconfigured "self-heal" can overwrite a saved PAT** (`brain-client.js:84-95`). Today it's inert only because `preconfigured.js` is always empty, since the server deliberately never injects secrets (`extension.mjs:30-31`). The file and the logic are dead.
17. **Content-script listener keeps every message channel open.** `content-script.js:515` returns `true` for every message type, not just the one it answers.
18. **The research feed misses states.** It shows only a raw status string. There's no way to queue a topic from the panel, and nothing links to the dashboard.

### 2.3 Collab in the extension

The Collab tab (`sidepanel.html:133-201`, `sidepanel.js:677-1082`, ~500 lines) needs its own username/password account on the brain's collab store. The dashboard already has a full `CollabPage.tsx` on the same API.

In the extension it can't do its job: by default the brain is reached at `127.0.0.1` through localhost-only host permissions, so the only person who can join the "Site Chat Room" is you. It also carries the two security bugs above (2, 3). It's the most cramped part of the panel, with fourteen inline `style=` attributes.

## 3. Visual quality vs the app

The dashboard design system is in `frontend/src/index.css:6-68`:

- Deep slate surfaces (`#070b14 / #0c1220 / #121a2b / #172033`)
- Brand blue accent `#3b82f6`
- Slate text (`#f1f5f9 / #94a3b8 / #64748b`)
- Glass surfaces, 8/12/18 px radii, Inter + JetBrains Mono
- The vault-arch mark `frontend/public/brand/total-recall-icon.svg` in the sidebar, and the cube as the favicon

The extension uses none of that:

- **Palette.** It's built on Catppuccin Mocha (`#1e1e2e`, `#cba6f7` mauve, `#89b4fa`, `#f38ba8`), a different product's look.
- **Icons.** Emoji serve as the icon system (🧠 📌 🔬 💬 ⚙️ 👥 ⏳ 🔄), and they render differently on every OS.
- **Toolbar icon.** `icons/icon-*.png` are **solid indigo squares** (`#6366f1` placeholder, per `icons/README.md:22-24`), not the brand mark.
- **Inline styles.** 40+ `style=` attributes in `sidepanel.html` and the popup footer. Spacing and type scale are ad hoc.
- **Dead code.** `sidepanel.css` is 971 lines, much of it styling for elements that no longer exist.

## 4. What's worth keeping

| Feature | Verdict | Reason |
|---|---|---|
| Context menus (page/selection → remember, research) | Keep, extend | The main capture path |
| Side panel search | Keep, fix | Core recall |
| Recent captures | Keep, fix ordering | Useful feedback after capture |
| Quick note | Keep | Cheap and useful |
| Page-grounded chat | Keep, fix model routing | A good fit for a side panel |
| Research feed + cancel | Keep, add queueing | Mirrors the daemon's research queue |
| Brain selector / block domain / recompile | Keep, move into a settings sheet | Useful but secondary |
| Related-memories pill | Keep only with real relevance filtering, off by default | Noise today |
| Popup | **Remove** | Never reachable |
| Capture granularity | **Remove** | Does nothing |
| Hidden invariant write | **Remove** | Unwanted side effect |
| `preconfigured.js` self-heal | **Remove** | Dead and hazardous |
| Collab tab | **Remove from extension** (server bugs still fixed) | Duplicates the dashboard, can't work over localhost, security bugs |
| Optional `history`/`webNavigation` perms | **Remove** | Nothing uses them |

## 5. Test coverage

- `src/server/routes/extension.spec.mjs` covers only `/api/extension/status|download`.
- Nothing tests the extension JS itself.
- `collab.spec.mjs` exists but doesn't check secret handling or broadcast scoping.
