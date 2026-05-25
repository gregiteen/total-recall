# Documentation Overhaul Development Plan

This document outlines the step-by-step phased development plan for overhauling, validating, and synchronizing the system-level documentation of the **Total Recall Sovereign AI OS**.

---

## 📅 Phased Execution Plan

### ⏳ Phase 1: Interactive Installation & Selectable Deployment Guides
- **Objective**: Author clear user-facing documentation detailing how to install, initialize, and deploy the Sovereign OS.
- **Tasks**:
  - Create `docs/setup/INSTALLATION.md` detailing:
    - Running `npx total-recall init` wizard.
    - Configuration options for UI deployment (Local Host bind vs. Cloudflare quick/named tunnels vs. Custom Domains).
    - Explanation of the frontend auto-build process during server startup if `frontend/dist/` is missing.
    - Provisioning the dual-layer brain (creating config files in `~/.agent/` and project-specific files).

### ⏳ Phase 2: Dual-Layer Brain & Conflict quarantine guide
- **Objective**: Document the dual-layer vault topology, file precedence, and conflict detection structures.
- **Tasks**:
  - Create `docs/architecture/DUAL_LAYER_BRAIN.md` detailing:
    - Global Brain (`~/.agent/memory-vault/`) vs. Project Brain (`<repo>/.agent/memory-vault/`).
    - File precedence: How the compiler reads both vaults, prioritizes local project slugs over global slugs for overlaps, and merges them into `graph-index.jsonl`.
    - Drift detection: How `rebuild` checks for discrepancies across both layers.
    - Conflict detection and quarantine state machine: What happens during protected invariant clashes, auto-resolving human vs. machine rules, and how conflict files are logged in `memory-inbox/`.

### ⏳ Phase 3: SSSS v2 frontmatter specification & REST API Reference
- **Objective**: Document the strict schema structures and port 3000 REST API surface.
- **Tasks**:
  - Update `.agent/skills/total-recall/SKILL.md` (the master guide) to include:
    - Complete SSSS v2 schema specifications (decay trackers, Modality must/must_not/should/should_not, polarity sentiment, absolute invariants).
    - Extensive REST API routing table with exact `curl` templates and PAT token header authentication (`Authorization: Bearer <PAT>`).
    - Endpoint details for `/health`, `/api/memory`, vector semantic search `/api/memory/search/semantic`, compile actions `/api/vault/compile`, and research queue `/api/research`.

### ⏳ Phase 4: CLI Help system & Instruction Keepers Sync
- **Objective**: Align all terminal help outputs and compiler rule shims.
- **Tasks**:
  - Audit and update `src/cli/help.mjs` outputs to ensure all commands are described accurately.
  - Update `.agent/skills/total-recall/memory-vault/concepts/cli-help-reference.md` frontmatter and contents.
  - Update root `README.md` to align quickstart commands and tunneling guidelines.

### ⏳ Phase 5: Verification & Testing
- **Objective**: Guarantee that all documentation links, references, and schemas compile flawlessly.
- **Tasks**:
  - Run `node bin/total-recall.mjs lint --strict` to verify vault schema validation is passing at 100%.
  - Run `npx total-recall compile` to rebuild all local indexes.
  - Perform link validation across recently added markdown documents.
