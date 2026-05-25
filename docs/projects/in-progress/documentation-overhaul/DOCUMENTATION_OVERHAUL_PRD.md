# Documentation Overhaul PRD

## 1. Overview & Objectives

### Goal
The goal of this project is to completely overhaul, synchronize, and update all user, developer, and kernel documentation for the **Total Recall Sovereign AI OS**. 

As the project has progressed through rapid feature development (including the transition to SSSS v2, dual-layer brain architecture, selectable deployment locations, automatic frontend building, conflict resolution, sandbox VM modules, and REST-first APIs), our documentation has drifted. This project brings all documentation to 100% accuracy, providing a solid knowledge base for everyday operations and future developers.

### Objectives
- Document the **Dual-Layer Brain Architecture** (Global `~/.agent` and Project-level `<repo>/.agent`).
- Document the **Structured Semantic Syntax System (SSSS) v2** schema standards (including strict frontmatter validation fields, modalities, sentiment targets, and confidence decay trackers).
- Document the **REST API Surface & Operations** (Bearer PAT token authentication, Vector Semantic Search, health endpoints, research queue).
- Document the **Install, Initialization, and Selectable Deployment** workflows (installing global vs. project layers, Cloudflare quick tunnels, local servers, custom domains).
- Document the **Daemon Lifecycle and JIT Sandbox** execution constraints (`experimental-vm-modules`, resource capping, watchdog logging, circuit breakers).
- Update the **help command outputs and interactive references** to match current capabilities.

---

## 2. Target Areas & Scope

### A. Core Architecture Documentation
Update `docs/architecture/` (or create where missing) to define:
- Dual-layer brain orchestration and file-system resolution priorities.
- Conflict detection and quarantine state machine (Protected invariant clash, auto-resolution, quarantine folder).
- JIT Sandbox VM constraints and progressive validation loop.

### B. Installation & Setup Documentation
Update `README.md` and installation scripts to explain:
- Global brain initialization vs. project-level sandbox mapping.
- The `npx total-recall init` interactive wizard, showing all options (Local, Quick Tunnel, Custom Domain, etc.).
- Auto-building frontend workflow during deployment.

### C. Developer & API References
Create/update documentation for:
- Full REST API reference with exact `curl` templates and request/response schema specifications.
- SSSS v2 Schema reference (Zod mapping, strict modal validations, sentiment targets, decay logic).
- Research Queue interaction model (cloud-brain REST queueing vs. zero local footprint).

### D. System Help Systems
Synchronize:
- `npx total-recall help` outputs.
- Compiled shims and instruction keepers (`INSTRUCTIONS.md`, `.cursorrules`, etc.).

---

## 3. Acceptance Criteria

- [ ] All major architectural components are detailed to 100% conceptual and programmatic accuracy.
- [ ] Install guides detail both dual-layer installs (global/project) and location selection wizard choices.
- [ ] Strict SSSS v2 schema elements are fully mapped out.
- [ ] No references to old SSSS v1 parameters (e.g. `modality: descriptive`) remain.
- [ ] The REST API is thoroughly documented with authentic `curl` patterns and PAT token setups.
- [ ] Post-build verification and linter scripts run successfully over the revised documentation.
