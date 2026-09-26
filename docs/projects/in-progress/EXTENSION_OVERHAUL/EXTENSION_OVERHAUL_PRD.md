# EXTENSION_OVERHAUL — PRD

## Problem

The Chrome extension is the brain's main capture surface in the browser, and today it undermines trust. The audit (`EXTENSION_OVERHAUL_AUDIT.md`) found:

- **Security.** A stored-XSS path into every website (§2.1-1). A forgeable collab auth secret (§2.1-2). Collab chat that isn't scoped to groups (§2.1-3). Absolute path leakage from search (§2.1-4).
- **Recall noise.** The related-memories pill fires on nearly every page, because search scores are rank-based (§2.1-5, 6).
- **Broken or misleading features.** A dead popup, fake settings, recents that aren't recent, the active brain ignored, chat pinned to Gemini, and a hidden vault write (§2.2).
- **Wrong look.** It doesn't resemble the dashboard. Catppuccin palette, emoji icons, and a placeholder toolbar icon (§3).

## Goals

1. **Everything shown works.** No dead UI, no fake settings, no hidden writes.
2. **It looks like Total Recall.** Same tokens, brand mark, type scale and component language as the dashboard.
3. **Recall is trustworthy.** Related memories appear only when they're actually similar, and captures carry real content.
4. **Capture takes one gesture:** a keyboard shortcut, the context menu, or a single button.
5. **Security holes found in the audit are closed.**

## Scope

### In scope

- Full visual rebuild of the side panel, options page and in-page overlay on the dashboard design tokens. SVG icon set, brand toolbar icons.
- **Side panel tabs.**
  - **Recall:** current-page context card, "saved before" detection, search, true recent captures.
  - **Chat:** page-grounded, server-default model routing, persisted per browser session, safe markdown rendering.
  - **Research:** status groups, queue-a-topic, cancel, open in dashboard.
  - **Settings sheet:** brain selector, page-recall toggle, block domain, recompile, open options/dashboard.
- **Connection/onboarding state** when the brain is unreachable or the PAT is missing or invalid.
- **Richer capture.** Remember Page sends the selection, or else the meta description plus leading readable text, tagged with the hostname. Adds a "Remember link" context menu.
- **New features.**
  - Keyboard shortcuts: open panel, remember page.
  - "Ask Total Recall" on a selection: opens the panel with the chat pre-filled.
  - Omnibox keyword `tr` for searching the brain from the address bar.
  - Per-tab badge count of related memories.
- **Remote brains.** Request host permission for a non-localhost brain URL on save.
- **Removals.** Popup, capture granularity, `preconfigured.js`, hidden invariant write, Collab tab, unused optional permissions.
- **Server fixes.**
  - Semantic search: strip `_`-prefixed internal fields, expose raw cosine `similarity`, add `content`.
  - `GET /api/memory?sort=recent`.
  - Collab: persisted random JWT secret, group-scoped chat broadcast.

### Out of scope

- Migrating the collab JSON store to SSSS VFS. That's a known violation of VFS-first state, and it belongs to its own project.
- Streaming chat responses.
- Firefox/Safari ports.
- Chrome Web Store publication.

## Success criteria

| # | Criterion | Verified by |
|---|---|---|
| S1 | No `innerHTML` receives brain data unescaped in the content script | grep + unit test of the overlay renderer |
| S2 | Pill does not appear for unrelated pages (e.g. "Hacker News", "Wikipedia" titles) against the live brain | E2E with Playwright + live brain |
| S3 | Every control in the side panel performs a real API call that succeeds against the live brain | E2E walkthrough |
| S4 | Recent list's first item is the capture just made | E2E |
| S5 | Chat request body contains no `model` field unless the user picks one | unit test of `BrainClient.chat` |
| S6 | Extension palette uses only dashboard tokens (no Catppuccin hexes remain) | `grep -E "#1e1e2e\|#cba6f7\|#89b4fa\|#f38ba8\|#313244" extension/` returns nothing |
| S7 | Collab tokens signed with the old default secret are rejected | `collab.spec.mjs` |
| S8 | Semantic search responses contain no `_filePath`/`_brainVault` | `memory` route spec |
| S9 | Full vitest suite green | test skill run |

## Prioritization (Total Recall framework)

1. Data safety: XSS, collab forgery, path leak, hidden vault write.
2. Correctness of capture and recall: brain scoping, recents, relevance gating, capture content.
3. Chat routing: no hardcoded Gemini.
4. UI rebuild on the design system.
5. New conveniences: shortcuts, omnibox, ask-about-selection, badge.

## Risks

- **Removing the Collab tab** takes away a feature built on purpose (`aec2cda`). Mitigation: the dashboard CollabPage still offers it on the same API, and the server-side security fixes apply to both.
- **Rotating the collab JWT secret** logs out existing collab sessions once. Acceptable, since those tokens were forgeable anyway.
- **Restarting the local brain** to load the server fixes briefly interrupts the daemon.
