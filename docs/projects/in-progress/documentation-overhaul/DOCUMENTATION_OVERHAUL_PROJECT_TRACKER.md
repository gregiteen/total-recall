# Documentation Overhaul Project Tracker

## Project Metadata
- **Status**: `in-progress`
- **Owner**: AI Developer Agent
- **Start Date**: 2026-05-25
- **End Date**: TBD

---

## 🗺️ Phase Checklist

### ⏳ Phase 1: Interactive Installation & Selectable Deployment Guides
- [ ] Create `docs/setup/INSTALLATION.md`
- [ ] Detail interactive wizard steps for `npx total-recall init`
- [ ] Detail deployment mode settings (Local bind, Cloudflare quick tunnel, custom domains)
- [ ] Detail automatic frontend React SPA build process on server start

### ⏳ Phase 2: Dual-Layer Brain & Conflict Quarantine Guide
- [ ] Create `docs/architecture/DUAL_LAYER_BRAIN.md`
- [ ] Detail dual-layer resolution precedence (Project vault vs. Global vault)
- [ ] Detail combined compilation and index generation (`graph-index.jsonl`)
- [ ] Detail dual-layer drift validation logic in `rebuild` command
- [ ] Detail conflict detection, quarantine, and auto-resolution mechanisms

### ⏳ Phase 3: SSSS v2 Frontmatter Specification & REST API Reference
- [ ] Update `.agent/skills/total-recall/SKILL.md` (Master Guide)
- [ ] Add SSSS v2 frontmatter schema specification (confidence, importance, modalities, polarity, decay trackers)
- [ ] Add extensive REST API reference table (GET/POST routes, JSON payloads, Bearer PAT authentication)
- [ ] Document research queue integration endpoints (`/api/research`)

### ⏳ Phase 4: CLI Help System & Instruction Keepers Sync
- [ ] Audit and update `src/cli/help.mjs` outputs
- [ ] Synchronize `concepts/cli-help-reference.md` memory node
- [ ] Align root `README.md` commands and reverse-proxy guidelines

### ⏳ Phase 5: Testing & Verification
- [ ] Run strict schema validator on all docs memory nodes
- [ ] Execute index compilation on modified vault nodes
- [ ] Validate all newly introduced markdown links
