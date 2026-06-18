# Changelog

All notable changes to this project will be documented in this file.

## [3.9.0] — 2026-06-18

### ✨ Features
- **`connect` projects repo skills as native slash commands** across IDEs via the open Agent Skills standard. Every `.agent/skills/<name>/SKILL.md` is symlinked into the connected client's Agent-Skills directory so it becomes a `/<name>` slash command:
  - **Claude Code** → `<project>/.claude/skills/` (project-scoped)
  - **Antigravity CLI** → `<project>/.agents/skills/` (project-scoped; replaces the deprecated Gemini CLI `~/.gemini/commands` location)
  - **Codex** → `~/.codex/skills/` (global — Codex has no project-local skills dir)
- **Self-healing skill symlinks**: a broken or stale skill link (e.g. after the source repo moves) is refreshed automatically on `connect`, without requiring `--force`.

### 🐛 Bug Fixes
- **Nested symlink projections no longer dangle**: `connect` targets like Antigravity's `.agents/rules/AGENTS.md` now create their parent directory and point the symlink at `INSTRUCTIONS.md` using a path relative to the link's own directory, instead of a hardcoded `INSTRUCTIONS.md` that resolved incorrectly from a nested folder.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.9.0`.

## [3.8.1] — 2026-06-18

### ✨ Features
- **Unbreakable Invariant Enforcements**: Surface compiler now wraps invariant and correction injections in aggressive system prompt override boundaries (`# 🔴 ABSOLUTE SYSTEM OVERRIDE 🔴`) to structurally protect memory rules from ephemeral IDE prompt interference.
- **Native Memory Deduplication**: CLI `remember` automatically scans for existing nodes in the category and gracefully archives duplicates based on >80% textual Jaccard similarity or identical titles, preventing context saturation from repeated corrections.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.8.1`.

## [3.8.0] — 2026-06-18
### ✨ Features
- **OKF-Aligned Surface Compilation Quality** (inspired by OKF enrichment agent patterns):
  - **Modality Markers**: Compiled shims now prefix every rule with `[MUST]`, `[MUST NOT]`, `[SHOULD]`, `[CORRECTION]`, or `[PREF]` — giving agents instant priority signal instead of treating all rules identically.
  - **Title/Body Deduplication**: Auto-generated "Self-captured memory:" titles that echo the body are now detected and eliminated, preventing doubled text in compiled output.
  - **Sentence-Boundary Truncation**: Long rules are now truncated at the nearest sentence boundary instead of mid-word, producing cleaner summaries.
  - **Content Deduplication**: Rules with identical body text are automatically deduplicated during compilation, keeping the higher-importance node.
  - **Compact CLI Reference**: Replaced the 73-line CLI reference manual with an 8-line Quick Reference block (OKF §6 progressive disclosure), moving rules from line 79 to line 15 of compiled shims.

### 🐛 Bug Fixes
- **Force Flag Propagation**: The `force` parameter is now threaded through the entire compilation pipeline (`compileSurface` → `compilePointers` → `writeShim` → `buildRulesBlock` → `compactNode`). Previously, forced recompilation skipped the vault-hash check but still served stale compaction cache entries. Cache writes use OKF augmentation pattern: reloads full cache before writing to preserve other nodes' entries.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.8.0`.

## [3.7.0] — 2026-06-18

### ✨ Features
- **Open Knowledge Format (OKF v0.1 Draft) Integration**:
  - Implemented bidirectional schema mappings, allowing GCP/git-based knowledge catalogs to sync with the SSSS v2 memory vault.
  - Added `total-recall ingest okf <path>` to recursively import OKF bundles with custom override parameters, conflict strategies, and automated background recompilation.
  - Added `total-recall export <path> --okf` to export SSSS memories as OKF-compliant bundles with directory partitions, `index.md` relative links compilation, and `log.md` chronologically populated audit logs.
  - Added `total-recall lint --okf` to audit memory nodes for OKF metadata parameters, supporting `--strict` error conversion.
  - Enhanced graph indexing by expanding relative Markdown links extraction (`[text](./target.md)`).
  - Created a dedicated `okf` skill package detailing format specifications, helper script wrappers, validation assertions, and delegation prompts.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.7.0`.

## [3.6.10] — 2026-06-17

### 🐛 Bug Fixes
- **Shim Injection Target Fix**: Fixed a bug in `surface.mjs` where `compilePointers` mapped Gemini and Antigravity clients to empty arrays, causing them to be silently skipped during surface injection. They now properly map to `GEMINI.md` and `AGENTS.md`. Additionally, `compileSurface` now correctly tracks and reports the exact number of updated shims to the CLI.

## [3.6.9] — 2026-06-13

### ✨ Features
- **SSSS Improvements Epic**: Completed and archived the full SSSS Improvements project — secure memory validation with schema v2 conditional requirements (`TotalRecallMemoryValidator`), feedback privacy scopes to prevent workspace data leaking into system cache, and optimizer promotion pipeline (`workspace` → `system_candidate` → `system_promoted`) with strict provenance stripping and PII redaction.

### 🐛 Bug Fixes
- **Context Bloat (Definitive Fix)**: Completely removed the fallback shim generation loop in `surface.mjs`. When `clients.json` is missing, only the canonical `INSTRUCTIONS.md` is now written. Client-specific shims (`.cursorrules`, `.clauderules`, `AGENTS.md`, etc.) are exclusively generated via `npx total-recall connect`. This supersedes the partial fixes in v3.6.7 and v3.6.8.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.6.9`.

## [3.6.8] — 2026-06-11

### 🐛 Bug Fixes
- **Restored IDE Support**: Restored out-of-the-box IDE support without triggering context bloat by generating hidden dotfile shims (e.g. `.clauderules`, `.codexrules`) by default instead of `.md` files that are eagerly globbed by Antigravity and Gemini.

## [3.6.7] — 2026-06-11

### 🐛 Bug Fixes
- **Context Bloat Reduction**: Patched a fallback loop in the `surface.mjs` compiler that was indiscriminately writing full copies of active vault directives to multiple IDE shim files, consuming 80KB+ of context. Now, only the canonical `INSTRUCTIONS.md` is generated by default unless IDEs are explicitly registered via `.agent/config/clients.json`.
- **Symlink Preservation**: Added protection in `writeShim` to preserve existing symbolic links rather than unlinking and hard-copying them, preventing further rule duplication.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.6.7`.

## [3.6.6] — 2026-06-09

### 🐛 Bug Fixes
- **Extension Side Panel Flow**: Removed `default_popup` from `manifest.json` and added dynamic `sidePanel.setPanelBehavior` routing so clicking the extension icon organically opens the side panel.
- **Unauthenticated Errors**: The extension content script now inspects API failure payloads and explicitly renders a visible `❌ Auth Error - Check PAT` toast rather than failing silently if `total-recall` requests return a 403.
- **Research Queue Slugs**: Repaired the dynamic task generation lifecycle in `scheduler.mjs` and `daemon-loop.mjs` to properly propagate and respect `node_slug`, preventing human-readable topic strings from corrupting the factual document slugs.
- **Completed Scheduler Tasks**: `GET /api/tasks` now cleanly filters out completed tasks by default. Added a new `DELETE /api/tasks/cleanup` endpoint to easily garbage-collect execution piles.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.6.6`.

## [3.6.5] — 2026-06-05

### 🐛 Bug Fixes
- **BrainSelector UX**: Fixed brain selection buttons failing to trigger correctly by replacing invalid HTML nested inputs with valid wrapper `<div>`s, properly isolating checkbox toggles from single-select actions, and ensuring the dropdown closes dynamically on selection.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.6.5`.

## [3.6.4] — 2026-06-02
### ✨ Features
- **CLI Agent Diagnostics Panel**: Replaced the deprecated mock model-pulling widget on the Deployments page with a functional diagnostics panel. It connects to the new `POST /api/diagnostics/agents` endpoint, runs `upgrade --agents` in the background, and outputs live CLI results.
- **Clean Collaboration Labels**: Cleaned up the simulated sandbox styling terminology in the CollabPage views, renaming it to clear real-world descriptors like "Connect URL" and "Active browse context URL".

### 📦 Publishing
- Published to npm as `total-recall-brain@3.6.4`.

## [3.6.3] — 2026-06-02

### ✨ Features
- **Real Browser-Level Collaboration**: Integrated group sharing of webpage annotations, live user presence counting, and real-time site-scoped messaging directly into the Chrome Extension side panel (replacing the simulated sandbox).
- **Check for Updates Button**: Added a manual "Check for Updates" button to the System Health Page to check registry versions on demand.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.6.3`.

## [3.6.2] — 2026-06-02

### ⚡ Performance & UX
- **Optimized Claude Code Completions in UI**: Added `--setting-sources local` and `--tools ""` to the default and compiled `claude` agent flags, bypassing the loading of the user's 30 global plugins and disabling local directory/command scanning, speeding up UI responses significantly.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.6.2`.

## [3.6.1] — 2026-06-02

### 🐛 Bug Fixes
- **CLI Agent Key Isolation**: Patched runtime spawning logic to delete `GOOGLE_API_KEY` for `antigravity` and `gemini` agent commands, preventing API key validation errors when both keys are loaded.
- **Codex Git Trust Flags**: Added `--skip-git-repo-check` to the default `codex` flags to prevent execution failures in untrusted git directories.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.6.1`.

## [3.6.0] — 2026-06-02

### ✨ Features
- **Collaborative Workspaces & Teams Platform**: Integrated user auth, invite-code groups, URL note-pinning, and simulation sandbox in the visual dashboard.
- **WebSocket Synchronization Channel**: Built real-time message broadcasting and presence indicators over secure WebSocket links `/collab-ws`.
- **Dedicated Markdown Help Document Viewer**: Added HelpPage.tsx dynamically reading guides (CLI, SSSS spec, System Architecture, Collaboration) from the backend API.
- **Glassmorphic Graph Overlay Chat**: Elevated Chat workspace with interactive, translucent glass backdrop overlays rendering on top of the background 3D Sovereign Graph.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.6.0`.

## [3.5.0] — 2026-06-02

### ✨ Features
- **Core Self-Update System**: Integrated `/api/update/check` and `/api/update/run` endpoints into the REST router to query the npm registry for updates, pull the latest git code, install dependencies, and reboot the system kernel.
- **Health Check Update Alerts & Dynamic UI**: Modified the frontend Health Page to dynamically fetch update availability, display an animated update banner, prompt for confirmation, and run the self-update sequence.
- **Progress Overlay & Resilient Polling Recovery**: Built an updating spinner overlay with blurred glassmorphic backdrops and programmed auto-polling to restore the tab state once the server restarts.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.5.0`.

## [3.4.0] — 2026-06-02

### ✨ Features
- **Hybrid Semantic/Lexical Search (RRF)**: Merged cosine-similarity vector search and keyword matching density (TF-IDF approximation) using Reciprocal Rank Fusion (RRF), improving recall accuracy across exact code identifiers, symbol names, and intent.
- **Hierarchical Parent-Child Search**: Documents and rules are chunked and embedded individually under the parent slug's index. The pluggable search engine compares query embeddings against both parent and children vectors, matching on maximum similarity.
- **Pluggable Vector Store Interface**: Extracted vector index storage and scanning loops into a modular `VectorStore` class (`src/core/vector-store.mjs`), enabling seamless drop-in integrations of native engines (SQLite-VSS, HNSWLib) while preserving database-free flat-file VFS.
- **Instruction Compaction**: Implemented a smart heuristic rule compactor that limits rules in prompt shims to 180 characters (merging title and first body sentence, eliminating redundancies). Added cache-backed LLM compiler options enabled via `TR_LLM_COMPACT=true`.
- **Category Partitioning**: Kept prompt shims lightweight by reserving active injection shims strictly for high-priority `invariants`, `preferences`, and `anti-patterns`, while keeping `facts`, `concepts`, and `decisions` strictly search-only (recall mode).
- **Asynchronous Compile Backgrounding**: Spawns detached, unreferenced compiler subshells (`process.argv[0] compile`) during CLI remembers/forgets, preventing write latency blocking for the developer.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.4.0`.

## [3.3.0] — 2026-05-30

### ✨ Features
- **Permanent Chrome Extension Card**: Added a permanent, visually premium Chrome Extension Card to the Integrations page with a direct dynamic zip download button (`/api/extension/download`).
- **Defensive JavaScript Hardening**: Hardened popup and sidepanel quick-action buttons to query tabs defensively, preventing API errors on invalid webpage tabs (like system pages).

### 🐛 Bug Fixes & Refinement
- **Chrome Extension Tabs Permission**: Added the `"tabs"` permission to MV3 `manifest.json`, granting the extension direct access to active tab URLs/titles for seamless "Remember Page" and "Research Page" capabilities.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.3.0`.

## [3.2.3] — 2026-05-29

### ✨ Features
- **Chrome Extension Side Panel Redesign**: Overhauled the side panel layout with a modern tab navigation system (`Memories`, `Chat`, `Research`, `Settings`).
- **Context-Aware Web Grounding**: Integrated real-time grounding inside the Extension Chat, automatically retrieving page text selections or inner DOM body text to enrich prompt completions.
- **Interactive UI Feedback**: Added smooth `:active` scale transitions and asynchronous click-loading states (`⏳ Remembering...` / `⏳ Researching...` / `⏳ Saving...`) in both the side panel and popup extension views.
- **Sovereign Settings Shortcuts**: Added direct controls inside the settings tab for selecting active project brain layers, fast domain blocklisting, and manual index recompilation.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.2.3`.

## [3.2.0] — 2026-05-29

### ✨ Features
- **Chrome Extension Download from Dashboard**: New `GET /api/extension/download` endpoint streams the extension directory as a `.zip`. Dismissible banner on the Chat home page prompts install when extension is available but not yet connected.
- **Extension Connection Detection**: `GET /api/extension/status` returns `{ available, connected }`. The share endpoint writes a `.extension-connected` marker when the extension first phones home.
- **Settings Extension Card**: Permanent download card with installation instructions in the Settings page.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.2.0`.

## [3.1.2] — 2026-05-29

### 🐛 Bug Fixes & Refinement
- **BrainSelector UI Selection:** Refactored sidebar dropdown clicks; clicking a row switches the active context to that single brain (single-select), while checking the checkbox toggles multiple layers (multi-select).
- **Non-Intrusive Test Isolation:** Patched `src/core/research-queue.mjs` and `fact-seeker.spec.mjs` to dynamically bind queue directory writes relative to `AGENT_DIR` during test runs, preventing tests from polluting the active live research queue.

## [3.1.1] — 2026-05-29

### 🧠 Brain Architecture Overhaul
- **Decoupled Brain Layers**: Removed blind global-to-project merge from `compileSurface()`. Global and project brains are now fully independent vaults.
- **Client-Aware Surface Compiler**: `compilePointers()` reads `config/clients.json` and only writes shim files for connected IDE clients (backward compatible — writes all if no config).
- **Temporal Rules Engine**: New `expires_at` schema field, `--expires <duration>` CLI flag (e.g. `7d`, `2w`), and auto-archive of expired rules during compilation.
- **Brain-Scoped API Routes**: All `/api/memory` endpoints and chat completions accept `?brain=<id>` query param or `brainId` body field. Defaults to global brain.
- **Thread-Brain Binding**: Chat threads now carry `brainId` — switching threads auto-switches the active brain context in the dashboard.
- **Environment-Aware Surfaces**: `buildRulesBlock()` accepts `{ consumer }` option; API consumers get a minimal header instead of full CLI quickstart docs.

### 🔌 Chrome Extension (MV3)
- **Context Menus**: Right-click "Send to Brain", "Remember This" (selected text), "Research This"
- **Side Panel**: Semantic memory search, quick actions (Remember/Research/Quick Note), live research feed
- **Popup**: Quick note, URL share (auto-filled), passive tracking toggle, connection status
- **Content Script**: Shadow DOM floating pill showing related memory count per page
- **Options Page**: Brain URL, PAT token, domain blocklist, capture granularity settings

### 📥 Ingestion Pipeline
- **Share-to-Brain API**: `POST /api/share` endpoint with auto-routing heuristic (URL → research, text → remember) + `npx total-recall share` CLI command
- **Google Takeout Parser**: `npx total-recall ingest google-takeout <path>` with parsers for Search History, Chrome Bookmarks, Google Keep, YouTube History. Supports `--dry-run`, `--types`, `--max-age`.
- **SSSS Schema Extensions**: Added `x_location`, `x_media_refs`, `x_browser_context` optional fields
- **Open Source Whitelist**: `quick-capture.mjs` now accepts any valid kebab-case source (not just `slack`/`discord`)

### 🔬 Research UI Enhancements
- **Lifecycle Controls**: Pause, Resume, Re-run, Steer, Conclude, Cancel buttons on research items
- **Steer Modal**: Direct research with custom direction notes
- **Expand/Collapse Reports**: Gradient fade at 500px with toggle (replaces fixed 350px cap)
- **Rich Citation Cards**: Favicons, domain names, "Research deeper" button
- **URL Detection in Chat**: Auto-detects URLs in chat input, shows [🔬 Research] [📌 Remember] action bar

### 🐛 Bug Fixes
- **CLI agent spawning environment**: Fixed environment variable propagation inside `spawnSync` when spawning local CLI agents headlessly by injecting config-loaded API keys (such as `GOOGLE_API_KEY`, `TAVILY_API_KEY`, etc.) directly from `secrets.enc` into the spawned environment.
- **POST /api/share syntax error**: Made the Express route handler callback `async` to resolve dynamic import syntax errors.
- **Route Manifest Validation**: Added `GET /api/extension/status` to `route-manifest.json` to align with the live API routes and pass testing.
- **BrainSelector**: Fixed checkbox `readOnly`/`onClick` swallowing clicks, removed deselect guard, added empty state
- **localStorage Persistence**: `activeBrainId` survives page reload
- **Route Manifest**: Updated for new `/api/share` endpoint

### 📊 Testing
- **335 tests** across 45 test files — all passing
- 0 TypeScript errors, 0 lint issues


## [1.0.0] — 2026-05-01

### 🎉 Initial Release

Total Recall is a local-only, Markdown-first cognitive memory system for AI coding agents.

### Core Engine
- **4-Layer Memory Architecture**: Episode Archive → Search Index (FTS5) → Knowledge Graph (Zettelkasten wiki) → Behavioral Surface
- **Signal Score Ranking**: `intensity × (access+1)^0.5 × max(0.1, 0.5^(days/half_life))` with type-specific decay rates
- **Behavioral Surface Compiler**: Auto-generates curated rules from wiki nodes, injected into system prompt
- **Behavioral Steering**: `total-recall steer --type always|never|correct "directive"` for immediate behavior changes
- **Dream Daemon**: Consolidation cycle (NREM/REM/decay/prune) for memory maintenance
- **FTS5 Full-Text Search**: Sub-50ms search across all memory tiers (BM25 ranked)
- **Episode Archive**: Structured session logs with YAML frontmatter, organized by date

### Co-Processor
- **Real-time Background Daemon**: Watches conversations and runs 5 parallel analysis checks
- **Steering Detection**: Identifies "always", "never", "correct" directives
- **Sentiment Analysis**: Detects user mood shifts (praise, frustration)
- **Relevance Check**: Surfaces related memories via FTS5
- **Contradiction Detection**: Flags statements conflicting with wiki knowledge
- **System 2 Researcher**: Background web-backed fact-checking of uncertain claims

### IDE Support (Phase 11-14)
- **IDE Watchers**: Antigravity, Claude Code, Cursor, Aider, Windsurf, Generic
- **CLI Adapters**: Gemini, Claude, Codex, Aider, Copilot (+ any CLI agent)
- **`total-recall sync-prompts`**: Auto-detects IDEs and writes surface to native formats
  - Cursor: `.cursor/rules/total-recall.mdc` (MDC format)
  - Windsurf: `.windsurf/rules/total-recall.md`
  - Roo Code: `.roo/rules/total-recall.md`
  - Continue: `.continue/rules/total-recall.md`
  - INSTRUCTIONS.md / CLAUDE.md: Section injection with symlink detection
- **Multi-file config**: `systemPromptFiles` array for simultaneous injection

### Multi-Agent Pipeline
- **3-Agent Extraction**: Archivist (Gemini Flash), Synthesizer (Claude), Fact-Checker (Codex)
- **CLI Agent Adapters**: Override any role with `agents.default` in config
- **Non-blocking dispatch**: Pipeline runs as background fire-and-forget

### Notifications (Phase C4)
- **Multi-channel**: macOS native, Slack, Discord, Email
- **Directory-based queue**: `~/.total-recall/notifications/`
- **CLI**: `total-recall notify "title" "message"`

### Security (Phase 18)
- **Zero shell injection**: All CLI dispatches use `spawn()` with argument arrays
- **AES-256-GCM**: Encrypted config sharing (PBKDF2 600K iterations, SHA-512)
- **File permissions**: `~/.total-recall/` at `0o700`, `.env` at `0o600`
- **Secrets management**: `.env`, `*.key`, `*.pem` in `.gitignore`
- **Minimum password**: 8 characters for encrypted config bundles

### Concurrent Handoff (Phase 17)
- **HANDOFF.md-first**: Self-sufficient handoff written as Step 1 of /switch
- **Resilient boot**: /start uses priority cascade `START.md → HANDOFF.md → raw files`
- **Zero blocking**: Incoming agent can start immediately without waiting for outgoing

### Documentation
- **README**: IDE compatibility matrix, "Choose Your IDE" quick start
- **Per-IDE Guides**: Antigravity, Claude Code, Cursor, Windsurf, Aider, Generic
- **Architecture Guide**: Adapter patterns, surface sync system, concurrent handoff model
- **Prompt Templates**: Archivist, Synthesizer, Fact-Checker templates in `templates/prompts/`

### Testing
- **73 tests** across 29 suites covering: utils, ranking, wiki, episodes, dream, FTS5, crypto, watchers, notifications, lint
