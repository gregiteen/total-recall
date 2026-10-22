# PLUGIN_UI_OVERHAUL — Project Tracker

> **Project Prefix**: `PLUGIN_UI_OVERHAUL`
> **Status**: Completed
> **Date**: 2026-10-22
> **Author**: Antigravity

---

## Active Checklist

### Architectural Foundations
- [x] Core CardEngine Shell: Ensure guaranteed title, badge, and status presence across all plugin modes.
- [x] UI Workspace Separation: Display ONLY user-owned cards on the main workspace; route unowned cards to the Plugin Store.
- [x] Agent Plugin Recipe Specification: Document the standardized Recipe format used by coding agents to author plugins.
- [x] Private vs. Store Lifecycle: Support private local usage versus one-click hash-pinned store publishing.

### 34-Plugin Recipes & Proposals (1–34)
- [x] Plugin 01/34: `auth` recipe & card overhaul (live passkey/OAuth status, 6 domain controls, console copy)
- [x] Plugin 02/34: `cli-agents` recipe & card overhaul (discovered agent matrix, node target telemetry, 6 verbs)
- [x] Plugin 03/34: `code-quality` recipe & card overhaul (purged fake oscilloscope, deterministic gate matrix, fail-closed telemetry)
- [x] Plugin 04/34: `composable-cli` recipe & card overhaul (purged fake canvas animation, live command inventory, target input, 6 verbs)
- [x] Plugin 05/34: `creative-search` recipe & card overhaul (purged fake radar canvas and winamp skin, live SearXNG health, multi-category chips, 6 verbs)
- [x] Plugin 06/34: `decision` recipe & card overhaul (purged fake radar sweep, live decision sets, provider-neutral Field Copilot telemetry, 6 verbs)
- [x] Plugin 07/34: `deploy` recipe & card overhaul (purged fake orbital canvas, live dual-slot Blue/Green visualizer, fail-safe traffic inspection)
- [x] Plugin 08/34: `design` recipe & card overhaul (purged fake spectrum canvas, live DESIGN.md token telemetry, real swatch deck, CSS/Tailwind export)
- [x] Plugin 09/34: `domains` recipe & card overhaul (purged fake propagation canvas, live Vercel DNS team telemetry, target domain selector, DNS records)
- [x] Plugin 10/34: `dsh` recipe & card overhaul (purged fake synapse canvas and winamp-classic skin, live profile telemetry, tool inventory, 6 verbs)
- [x] Plugin 11/34: `embeddings` recipe & card overhaul (purged fake vector scatter canvas, live local model telemetry, vault coverage inspector, 6 verbs)
- [x] Plugin 12/34: `git-sentinel` recipe & card overhaul (purged fake pulse canvas, live branch and worktree hygiene telemetry, diffstat, 4 verbs)
- [x] Plugin 13/34: `hermes` recipe & card overhaul (purged fake pulse canvas, live runtime and gateway supervisor telemetry, task dispatch, 6 verbs)
- [x] Plugin 14/34: `image-generator` recipe & card overhaul (purged fake prism canvas, live fal.ai model profiles, aspect ratio chips, prompt generator)
- [x] Plugin 15/34: `maps` recipe & card overhaul (purged fake radar canvas and winamp skin, live Google Maps telemetry, location input, geocoding & routing)
- [x] Plugin 16/34: `marketing` recipe & card overhaul (purged fake canvas and winamp skin, live brand tone telemetry, SEO audit targets, 6 verbs)
- [x] Plugin 17/34: `mesh` recipe & card overhaul (purged fake mesh canvas and winamp skin, live Headscale telemetry, preauth key minting, 6 verbs)
- [x] Plugin 18/34: `okf` recipe & card overhaul (purged fake lattice canvas and winamp skin, live schema validation matrix, target selector, 4 verbs)
- [x] Plugin 19/34: `openclaw` recipe & card overhaul (purged fake lobster radar canvas, live WebSocket gateway telemetry, channels matrix, 4 verbs)
- [x] Plugin 20/34: `openwiki` recipe & card overhaul (purged fake constellation canvas and winamp skin, live hubs counter, ingest bar, 4 verbs)
- [x] Plugin 21/34: `operator-alerts` recipe & card overhaul (purged fake RF canvas, live channel matrix, severity selector, dispatch bar, 4 verbs)
- [x] Plugin 22/34: `phone` recipe & card overhaul (purged fake VU equalizer canvas and winamp skin, live Telnyx inventory, E.164 dial bar, 5 verbs)
- [x] Plugin 23/34: `phone-companion` recipe & card overhaul (purged fake wireless canvas and mobile skin, live Gro CRM runtime telemetry, push form, 4 verbs)
- [x] Plugin 24/34: `security` recipe & card overhaul (purged winamp skin, touch-ergonomic assessment actions, mesh fleet target selector, 5 verbs)
- [x] Plugin 25/34: `signing` recipe & card overhaul (purged fake wax seal canvas and hifi skin, Documenso Seal telemetry, SHA-256 audit, 4 verbs)
- [x] Plugin 26/34: `skill-manager` recipe & card overhaul (purged fake convergence canvas, target mesh node telemetry, single-skill routing bar, 4 verbs)
- [x] Plugin 27/34: `sticker-generator` recipe & card overhaul (purged fake audio equalizer bars and winamp skin, 300 DPI production specs, shape chips, quote calculator)
- [x] Plugin 28/34: `stripe` recipe & card overhaul (purged fake ledger velocity canvas and winamp skin, live merchant API telemetry, currency switcher, 5 verbs)
- [x] Plugin 29/34: `system-monitor` recipe & card overhaul (purged fake dual-trace CPU/RAM canvas, real host metrics, live load averages, dynamic RAM bar gauge)
- [x] Plugin 30/34: `text` recipe & card overhaul (purged fake carrier wave dots canvas and synth skin, fixed invalid data-cmd, Telnyx 10DLC route telemetry, SMS form)
- [x] Plugin 31/34: `tickets` recipe & card overhaul (purged fake laser scan canvas and arcade skin, configured signing secret, box office admissions telemetry, QR token bar)
- [x] Plugin 32/34: `tr-transcribe` recipe & card overhaul (purged fake waterfall canvas and studio skin, acoustic model telemetry, word timestamp alignment, audio input)
- [x] Plugin 33/34: `translator` recipe & card overhaul (purged fake lexical wave canvas and winamp skin, Rosetta Stone theme, 10 Festech locales, SSSS v2 frontmatter)
- [x] Plugin 34/34: `user-automations` recipe & card overhaul (purged fake clock canvas and pocket arcade skin, Chronos theme, mesh-wide cron schedule matrix, 2 verbs)
- [x] Visual Inspection: Real Google Chrome headless Playwright verification across all 34 custom element cards (dimensions, shadow DOM, touch targets >= 44px, button dispatch, 0 console errors)
- [x] Bug Fixes: Resolved Chromium `CustomElementRegistry` duplicate constructor collisions across 5 plugins (`creative-search`, `decision`, `openwiki`, `translator`, `user-automations`), and added missing card declarations in `hermes` and `sticker-generator`
- [x] Publication: Published all 34 plugins to the public npm registry under `gregiteen` and `@gregiteen/signed-gi-client`, and published `total-recall-brain@3.40.4`
- [x] Mesh Propagation: Deployed `total-recall-brain@3.40.4` to all 179 project brains across the workspace, and updated global CLIs on Mac Mini, Cloud Droplet, and MacBook

---

## Action Log

| Timestamp (UTC) | Agent | Action | Result / evidence |
| --- | --- | --- | --- |
| 2026-10-22T14:34:00Z | Antigravity | Initiated project-management lifecycle for plugin UI overhaul | Created 5-file project docs under docs/projects/in-progress/PLUGIN_UI_OVERHAUL/ |
| 2026-10-22T14:37:00Z | Antigravity | Completed complete source audit of all 34 plugin manifests and CardEngine.tsx | Identified root cause of missing card titles and skin inconsistencies |
| 2026-10-22T14:38:00Z | Antigravity | Initiated one-by-one plugin review starting with Plugin 01 (auth) | Audit findings and proposed improvements prepared |
| 2026-10-22T14:41:00Z | Antigravity | Expanded audit to cover all 34 installed plugins with bespoke domain recipes | Prepared cool, functional design proposals for all 34 plugins in audit doc |
| 2026-10-22T14:44:00Z | Antigravity | Integrated user direction on owned cards vs plugin store | Clarified that only user-owned cards display in workspace, unowned cards live in store |
| 2026-10-22T14:46:00Z | Antigravity | Incorporated agent recipe architecture per user mandate | Codified that users' agents build plugins from recipes, supporting private use or store deployment |
| 2026-10-22T14:53:00Z | Antigravity | Generated exhaustive individual audit and bespoke recipe plan for all 34 plugins | Documented in PLUGIN_UI_OVERHAUL_AUDIT.md covering 1,317 lines of ground-truth evidence |
| 2026-10-22T15:08:00Z | Antigravity | Overhauled PluginsPage.tsx with strict Workspace vs. Plugin Store separation | Display only user-owned active cards on workspace; optional plugins routed to catalog with + Add to Workspace |
| 2026-10-22T15:10:00Z | Antigravity | Added Agent Plugin Recipe modal and copy prompt workflow | Implemented hero banner and recipe modal supporting private local vs. store deployment paths |
| 2026-10-22T15:12:00Z | Antigravity | Purged winamp-classic skins across scaffold plugin manifests | Removed legacy skin keys in auth, mesh, security, code-quality, and openwiki |
| 2026-10-22T15:14:00Z | Antigravity | Verified complete test suite and production build | 50 test files passed (220 tests), tsc and vite build succeeded with exit code 0 |
| 2026-10-22T15:58:00Z | Antigravity | Overhauled Plugin 01 (auth) card face | Live telemetry for passkeys and OAuth, 6 administrative actions, live terminal copy |
| 2026-10-22T16:00:00Z | Antigravity | Overhauled Plugin 02 (cli-agents) card face | Multi-agent discovery matrix, target node telemetry, 6 management actions |
| 2026-10-22T16:01:00Z | Antigravity | Overhauled Plugin 03 (code-quality) card face | Purged illegal fake waveform canvas, added real deterministic gate matrix and fail-closed telemetry |
| 2026-10-22T16:04:00Z | Antigravity | Overhauled Plugin 04 (composable-cli) card face | Purged fake canvas flow animation, built bespoke CmdSmith UI with live inventory, target selector, 6 verbs, all 28 tests pass |
| 2026-10-22T16:07:00Z | Antigravity | Overhauled Plugin 05 (creative-search) card face | Purged fake radar canvas and winamp-classic skin, fixed legacy engineGroups config breakage, live SearXNG health and categories |
| 2026-10-22T16:09:00Z | Antigravity | Overhauled Plugin 06 (decision) card face | Purged fake radar sweep, fixed auth-client test breakage, implemented provider-neutral Field Copilot telemetry, all 32 tests pass |
| 2026-10-22T16:10:00Z | Antigravity | Overhauled Plugin 07 (deploy) card face | Purged fake orbital canvas, implemented dual-slot Blue/Green visualizer, fail-safe traffic inspection, all 27 tests pass |
| 2026-10-22T16:11:00Z | Antigravity | Overhauled Plugin 08 (design) card face | Purged fake spectrum canvas, implemented live DESIGN.md token telemetry, real swatch deck, CSS/Tailwind export, all 43 tests pass |
| 2026-10-22T16:13:00Z | Antigravity | Overhauled Plugin 09 (domains) card face | Purged fake propagation canvas, implemented live Vercel DNS team telemetry, target domain selector, DNS records, all 75 tests pass |
| 2026-10-22T16:14:00Z | Antigravity | Overhauled Plugin 10 (dsh) card face | Purged fake synapse canvas and winamp-classic skin, implemented neutral Field Copilot harness telemetry, all 4 tests pass |
| 2026-10-22T16:15:00Z | Antigravity | Overhauled Plugin 11 (embeddings) card face | Purged fake vector scatter canvas, implemented local Ollama model telemetry, vault coverage inspector, all 11 tests pass |
| 2026-10-22T16:16:00Z | Antigravity | Overhauled Plugin 12 (git-sentinel) card face | Purged fake pulse canvas, implemented live worktree hygiene and branch telemetry, all 9 tests pass |
| 2026-10-22T16:18:00Z | Antigravity | Overhauled Plugin 13 (hermes) card face | Purged fake pulse canvas, implemented live supervisor and gateway telemetry, task dispatch, all 2 tests pass |
| 2026-10-22T16:19:00Z | Antigravity | Overhauled Plugin 14 (image-generator) card face | Purged fake prism canvas, implemented live fal model profiles, aspect ratio chips, all 7 tests pass |
| 2026-10-22T16:20:00Z | Antigravity | Overhauled Plugin 15 (maps) card face | Purged fake radar canvas and winamp skin, implemented live Google Maps telemetry, location input and geocoding, all 11 tests pass |
| 2026-10-22T16:22:00Z | Antigravity | Overhauled Plugin 16 (marketing) card face | Purged fake canvas and winamp skin, added live brand voice telemetry and SEO audit targets, all 4 tests pass |
| 2026-10-22T16:24:00Z | Antigravity | Overhauled Plugin 17 (mesh) card face | Purged fake mesh canvas and winamp skin, added Headscale control server telemetry and preauth key issuance, all 7 tests pass |
| 2026-10-22T16:26:00Z | Antigravity | Overhauled Plugin 18 (okf) card face | Purged fake lattice canvas and winamp skin, added live OKF schema matrix and directory target picker, all 2 tests pass |
| 2026-10-22T16:27:00Z | Antigravity | Overhauled Plugin 19 (openclaw) card face | Purged fake lobster radar pulse canvas, implemented real WebSocket gateway telemetry, channel matrix, all 2 tests pass |
| 2026-10-22T16:29:00Z | Antigravity | Overhauled Plugin 20 (openwiki) card face | Purged fake constellation canvas and winamp skin, added live documentation hubs counter and ingest bar, all 4 tests pass |
| 2026-10-22T16:30:00Z | Antigravity | Overhauled Plugin 21 (operator-alerts) card face | Purged fake RF canvas, added active notification channels matrix, severity selector, dispatch bar, all 12 tests pass |
| 2026-10-22T16:32:00Z | Antigravity | Overhauled Plugin 22 (phone) card face | Purged fake audio VU equalizer canvas and winamp skin, implemented live Telnyx number inventory, dialer bar, all 78 tests pass |
| 2026-10-22T16:33:00Z | Antigravity | Overhauled Plugin 23 (phone-companion) card face | Purged fake wireless canvas and mobile skin, implemented Gro CRM target telemetry, Expo mobile runtime, push form, all 7 tests pass |
| 2026-10-22T16:35:00Z | Antigravity | Overhauled Plugin 24 (security) card face | Purged winamp-classic skin, implemented touch-ergonomic assessment actions, mesh fleet selector, finding table, all 28 tests pass |
| 2026-10-22T16:36:00Z | Antigravity | Overhauled Plugin 25 (signing) card face | Purged fake wax seal canvas and hifi skin, implemented Documenso Seal telemetry, SHA-256 audit, token vault, all 91 tests pass |
| 2026-10-22T16:37:00Z | Antigravity | Overhauled Plugin 26 (skill-manager) card face | Purged fake convergence curve canvas, added target mesh node telemetry, single-skill routing query bar, all 11 tests pass |
| 2026-10-22T16:38:00Z | Antigravity | Overhauled Plugin 27 (sticker-generator) card face | Purged fake audio equalizer bars and winamp skin, added 300 DPI production specs, shape chips, quote calculator, all 4 tests pass |
| 2026-10-22T16:39:00Z | Antigravity | Overhauled Plugin 28 (stripe) card face | Purged fake ledger velocity canvas and winamp skin, added live merchant API telemetry, currency switcher, checkout, all 11 tests pass |
| 2026-10-22T16:40:00Z | Antigravity | Overhauled Plugin 29 (system-monitor) card face | Purged fake dual-trace CPU/RAM canvas, implemented real Darwin/Apple M4 host metrics, load averages, RAM gauge, all 4 tests pass |
| 2026-10-22T16:41:00Z | Antigravity | Overhauled Plugin 30 (text) card face | Purged fake carrier wave dots canvas and synth skin, fixed invalid command button, Telnyx 10DLC route telemetry, all 49 tests pass |
| 2026-10-22T16:42:00Z | Antigravity | Overhauled Plugin 31 (tickets) card face | Purged fake laser scan canvas and arcade skin, configured signing secret, box office admissions telemetry, QR check-in, all 14 tests pass |
| 2026-10-22T16:43:00Z | Antigravity | Overhauled Plugin 32 (tr-transcribe) card face | Purged fake waterfall canvas and studio skin, implemented acoustic model telemetry, word timestamp alignment, all 2 tests pass |
| 2026-10-22T16:45:00Z | Antigravity | Overhauled Plugin 33 (translator) card face | Purged fake lexical wave canvas and winamp skin, implemented Rosetta Stone theme, 10 Festech locales, SSSS v2 frontmatter, all 5 tests pass |
| 2026-10-22T16:46:00Z | Antigravity | Overhauled Plugin 34 (user-automations) card face | Purged fake clock canvas and pocket arcade skin, implemented Chronos theme, mesh-wide cron schedule matrix, all 3 tests pass |
| 2026-10-22T17:15:00Z | Antigravity | Headless Chrome visual inspection across all 34 custom element cards | Rendered each card in real Google Chrome via Playwright, verified dimensions, shadow DOM, touch targets, and captured 34 screenshots |
| 2026-10-22T17:22:00Z | Antigravity | Resolved CustomElementRegistry constructor collisions | Subclassed duplicate custom element tag constructors across 5 plugins, eliminating Chromium registration errors |
| 2026-10-22T17:28:00Z | Antigravity | Published all 34 plugins and total-recall-brain@3.40.4 to npm registry | Public packages live on npm under gregiteen and @gregiteen/signed-gi-client |
| 2026-10-22T17:33:00Z | Antigravity | Cluster-wide propagation and independent version verification | Deployed total-recall-brain@3.40.4 across all 179 project brains, updated global CLIs on Mac Mini, Cloud Droplet, and MacBook |
