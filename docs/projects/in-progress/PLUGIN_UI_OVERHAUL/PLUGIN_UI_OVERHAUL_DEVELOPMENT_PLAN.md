# PLUGIN_UI_OVERHAUL — Development Plan

> **Project Prefix**: `PLUGIN_UI_OVERHAUL`
> **Status**: In Progress
> **Date**: 2026-10-22
> **Author**: Antigravity

---

## Phases & Deliverables

### Phase 1: Core Shell & Navigation Overhaul
1. **Workspace Separation in [`PluginsPage.tsx`](file:///Users/gregoryiteen/github/total-recall/frontend/src/pages/PluginsPage.tsx)**:
   - **My Cards Tab**: Renders ONLY plugins that are user-owned and activated in the current workspace.
   - **Plugin Store Tab**: Organizes unowned, bundled, and mesh plugins into a catalog with category filters, descriptions, permissions, live previews, and 1-click install.
2. **Guaranteed Identity Header in [`CardEngine.tsx`](file:///Users/gregoryiteen/github/total-recall/frontend/src/components/plugins/card/CardEngine.tsx)**:
   - Ensure the standardized top Header (Icon, Title, Version, Active Pill, Settings Drawer) renders on all cards.
   - Remove destructive CSS that stripped borders and backgrounds on owned elements.

### Phase 2: Agent Plugin Recipe Specification & Workflow
1. **Recipe Contract**:
   - Establish declarative recipe schema defining manifest fields, CLI verbs, layout templates, brand tokens, and custom UI components.
2. **Private Use vs. Store Publishing**:
   - Integrate one-click "Publish to Store" (`deploy-store`) vs. private workspace ownership.
3. **Agent Action Interface**:
   - Provide a direct "Create Plugin with Agent" action in the UI generating pre-filled recipe briefs for coding agents.

### Phase 3: The 34-Plugin Recipes & Card Overhauls
Refactor and align all 34 plugins to the Recipe standard (authentic domain data, direct operational buttons, zero fake Winamp skins or audio equalizers):
- [ ] 01. `auth` (Auth & Secrets)
- [ ] 02. `cli-agents` (Command Fleet)
- [ ] 03. `code-quality` (Code Quality Gates)
- [ ] 04. `composable-cli` (Composable CLI)
- [ ] 05. `creative-search` (Metasearch)
- [ ] 06. `decision` (Decisions)
- [ ] 07. `deploy` (Zero-Downtime Deploy)
- [ ] 08. `design` (Design System Engine)
- [ ] 09. `domains` (Holy MX DNS)
- [ ] 10. `dsh` (DeepSeek Harness)
- [ ] 11. `embeddings` (Local Embeddings)
- [ ] 12. `git-sentinel` (Git Sentinel)
- [ ] 13. `hermes` (Hermes Agent)
- [ ] 14. `image-generator` (Visual Studio)
- [ ] 15. `maps` (Google Maps & Routing)
- [ ] 16. `marketing` (Brand Vision & Copy)
- [ ] 17. `mesh` (Tailscale Mesh Network)
- [ ] 18. `okf` (Open Knowledge Framework)
- [ ] 19. `openclaw` (OpenClaw Gateway)
- [ ] 20. `openwiki` (OpenWiki Knowledge Hub)
- [ ] 21. `operator-alerts` (Operator Alerts)
- [ ] 22. `phone` (Telnyx Telephony)
- [ ] 23. `phone-companion` (Gro CRM Companion)
- [ ] 24. `security` (Machine Security Scanner)
- [ ] 25. `signing` (Digital Agreement Signing)
- [ ] 26. `skill-manager` (Skill Manager)
- [ ] 27. `sticker-generator` (Sticker Studio)
- [ ] 28. `stripe` (Stripe Payments)
- [ ] 29. `system-monitor` (System Monitor)
- [ ] 30. `text` (Telnyx Messaging)
- [ ] 31. `tickets` (Velvet Rope)
- [ ] 32. `tr-transcribe` (Transcription)
- [ ] 33. `translator` (BabelStone Multilingual)
- [ ] 34. `user-automations` (Scheduled Tasks)

### Phase 4: Verification, Gates & Delivery
- Frontend Vitest suite and TypeScript typecheck.
- Responsive layout verification at mobile (360px), tablet (768px), and desktop (1280px).
- Verification of unowned cards residing strictly in the Plugin Store.
- Clean git commit and push.
