# DOCUMENTATION_HARMONIZATION — Development Plan

This document establishes the step-by-step development strategy to align the Total Recall documentation suite with the completed sovereign OS changes.

## 📅 Execution Phases

### Phase 1: Core OS & VFS Alignment (README & Architecture)
- **Task 1.1: Rewrite `README.md`**
  - Purge local Ollama inference, Hetzner VM quantizations, and model guides.
  - Detail `npx total-recall init` interactive steps and selectable deployment targets.
  - Highlight the Dual-Layer Brain System and centralize directories map inside the `.agent/skills/total-recall/` meta-skill namespace.
  - Document auto-backups (`--push-git`) and the uninstallation boundaries.
- **Task 1.2: Overhaul `docs/ARCHITECTURE.md`**
  - Purge Gemma 4 VM local inference specs and Kokoro references.
  - Detail the Unified Headless CLI Dispatch framework (`dispatch.mjs`), prioritized agent registry (`agents.yml`), and dynamic model selectors.
  - Correct the virtual filesystem diagram to locate SSSS vaults and configs under the meta-skill `skills/total-recall/` folder.
  - Document vault caching (`vault-cache.mjs`), single-process write invalidations, cost-limiting supervisors (`budget.yml`), POSIX sandbox isolation (namespaces, whitelist), and watchdog processes.

### Phase 2: Command & API Guides (CLI & REST Reference)
- **Task 2.1: Update `docs/reference/cli-reference.md`**
  - Revise `deploy` and `setup` commands to reflect remote API keys provisioning, launchd/systemd platform autostart, Caddy reverse-proxying, and Cloudflare tunnels.
  - Document new commands (`remember`, `recall`, `research`, `backup`, `restore`, `sync`, `status`, `daemon`, `relay`, `config`, `skill`, `uninstall`) with `--global`/`--project` flag support.
  - Update environment variables and `secrets.enc` GPG encryption description.
- **Task 2.2: Update `docs/reference/api-reference.md`**
  - Remove all Ollama references.
  - Add details for the dual-layer brain endpoints (`GET /api/brains`, `GET /api/brains/:id/nodes`).
  - Add details for the background research queue endpoints (`GET /api/research`, `POST /api/research`, `DELETE /api/research/:id`).
  - Detail local session relay ingestion and content-hash SHA-256 deduplication.

### Phase 3: VFS Specification & Diagnostic Skills (SSSS & Repo-Expert)
- **Task 3.1: Harmonize `docs/SSSS.md`**
  - Align all layout maps and text pathways to inside the `.agent/skills/total-recall/` namespace.
  - Document SSSS v2 memory Zod schema fields (schema_version 2, confidence, importance, modality, decay trackers, sentiment polarity, and ontology SPO checks).
  - Incorporate research queue task markdown specs.
- **Task 3.2: Re-engineer `.agent/skills/repo-expert/SKILL.md`**
  - Purge local Gemma 4 VM specs andquantizations.
  - Re-draw system topology diagram to show remote dispatches and headless CLI agent dispatches.
  - Align directory hierarchies to `.agent/skills/total-recall/`.
  - Detail dynamic model resolution and embedding selectors.

### Phase 4: Quality Verification & Sync
- **Task 4.1: Code Quality Check**
  - Run typescript checker (`node .agent/skills/code-quality/scripts/start-here-ts.mjs`) to verify zero errors.
  - Run lint checker (`node .agent/skills/code-quality/scripts/start-here-lint.mjs`) to verify zero errors.
  - Run pre-push quality gate (`node scripts/code-quality-gate.mjs`).
- **Task 4.2: Vault Recompile**
  - Execute `npx total-recall compile` to propagate all invariants and preferences correctly to all active shims.
  - Verify that the revised documentation surfaces look clean and professional.
