# PLUGIN_UI_OVERHAUL — Development Plan

> **Project Prefix**: `PLUGIN_UI_OVERHAUL`
> **Status**: In Progress
> **Date**: 2026-10-22
> **Author**: Antigravity

---

## Phases

### Phase 1: Core CardEngine Shell Hardening
- Audit and repair [`CardEngine.tsx`](file:///Users/gregoryiteen/github/total-recall/frontend/src/components/plugins/card/CardEngine.tsx) so plugin identity, title, and status are consistently visible across all cards.
- Ensure uniform card layout metrics and spacing across all templates.

### Phase 2: One-By-One Plugin Card Audits & Improvements (Plugins 1–34)
Audit each plugin individually with Greg, presenting concrete findings and proposed upgrades for user alignment:
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

### Phase 3: Verification & Test Gates
- Run frontend typecheck and tests.
- Verify responsive layout across all 34 cards.
- Full git commit and push.
