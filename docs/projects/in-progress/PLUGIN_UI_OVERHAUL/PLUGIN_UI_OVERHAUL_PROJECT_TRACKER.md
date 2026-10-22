# PLUGIN_UI_OVERHAUL — Project Tracker

> **Project Prefix**: `PLUGIN_UI_OVERHAUL`
> **Status**: In Progress
> **Date**: 2026-10-22
> **Author**: Antigravity

---

## Active Checklist

### Architectural Foundations
- [ ] Core CardEngine Shell: Ensure guaranteed title, badge, and status presence across all plugin modes.
- [ ] UI Workspace Separation: Display ONLY user-owned cards on the main workspace; route unowned cards to the Plugin Store.
- [ ] Agent Plugin Recipe Specification: Document the standardized Recipe format used by coding agents to author plugins.
- [ ] Private vs. Store Lifecycle: Support private local usage versus one-click hash-pinned store publishing.

### 34-Plugin Recipes & Proposals (1–34)
- [ ] Plugin 01/34: `auth` recipe & card overhaul
- [ ] Plugin 02/34: `cli-agents` recipe & card overhaul
- [ ] Plugin 03/34: `code-quality` recipe & card overhaul
- [ ] Plugin 04/34: `composable-cli` recipe & card overhaul
- [ ] Plugin 05/34: `creative-search` recipe & card overhaul
- [ ] Plugin 06/34: `decision` recipe & card overhaul
- [ ] Plugin 07/34: `deploy` recipe & card overhaul
- [ ] Plugin 08/34: `design` recipe & card overhaul
- [ ] Plugin 09/34: `domains` recipe & card overhaul
- [ ] Plugin 10/34: `dsh` recipe & card overhaul
- [ ] Plugin 11/34: `embeddings` recipe & card overhaul
- [ ] Plugin 12/34: `git-sentinel` recipe & card overhaul
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
