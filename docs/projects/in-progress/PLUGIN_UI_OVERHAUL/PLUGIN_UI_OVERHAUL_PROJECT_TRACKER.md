# PLUGIN_UI_OVERHAUL — Project Tracker

> **Project Prefix**: `PLUGIN_UI_OVERHAUL`
> **Status**: In Progress
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
- [x] Plugin 10/34: `dsh` recipe & card overhaul (purged fake synapse canvas and winamp skin, live profile telemetry, tool inventory, 6 verbs)
- [x] Plugin 11/34: `embeddings` recipe & card overhaul (purged fake vector scatter canvas, live local model telemetry, vault coverage inspector, 6 verbs)
- [x] Plugin 12/34: `git-sentinel` recipe & card overhaul (purged fake pulse canvas, live branch and worktree hygiene telemetry, diffstat, 4 verbs)
- [ ] Plugin 13/34: `hermes` recipe & card overhaul
- [ ] Plugin 14/34: `image-generator` recipe & card overhaul
- [ ] Plugin 15/34: `maps` recipe & card overhaul
- [ ] Plugin 16/34: `marketing` recipe & card overhaul
- [ ] Plugin 17/34: `mesh` recipe & card overhaul
- [ ] Plugin 18/34: `okf` recipe & card overhaul
- [ ] Plugin 19/34: `openclaw` recipe & card overhaul
- [ ] Plugin 20/34: `openwiki` recipe & card overhaul
- [ ] Plugin 21/34: `operator-alerts` recipe & card overhaul
- [ ] Plugin 22/34: `phone` recipe & card overhaul
- [ ] Plugin 23/34: `phone-companion` recipe & card overhaul
- [ ] Plugin 24/34: `security` recipe & card overhaul
- [ ] Plugin 25/34: `signing` recipe & card overhaul
- [ ] Plugin 26/34: `skill-manager` recipe & card overhaul
- [ ] Plugin 27/34: `sticker-generator` recipe & card overhaul
- [ ] Plugin 28/34: `stripe` recipe & card overhaul
- [ ] Plugin 29/34: `system-monitor` recipe & card overhaul
- [ ] Plugin 30/34: `text` recipe & card overhaul
- [ ] Plugin 31/34: `tickets` recipe & card overhaul
- [ ] Plugin 32/34: `tr-transcribe` recipe & card overhaul
- [ ] Plugin 33/34: `translator` recipe & card overhaul
- [ ] Plugin 34/34: `user-automations` recipe & card overhaul

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
