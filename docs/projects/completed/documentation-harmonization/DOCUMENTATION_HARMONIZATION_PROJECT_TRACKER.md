# DOCUMENTATION_HARMONIZATION — Project Tracker

> **Status**: ✅ Completed  
> **Last Updated**: May 25, 2026  
> **Owner**: gregiteen

---

## 📅 Roadmap Overview

```mermaid
gantt
    title Documentation Harmonization Roadmap
    dateFormat  YYYY-MM-DD
    section Phase 1: Core Alignment
    README & ARCHITECTURE Updates             :active,   des1, 2026-05-25, 2026-05-25
    section Phase 2: Command & API Guides
    CLI & REST Reference Updates              :planned,  des2, 2026-05-25, 2026-05-25
    section Phase 3: VFS & Diagnostics
    SSSS & Repo-Expert Skill Updates          :planned,  des3, 2026-05-25, 2026-05-25
    section Phase 4: Verification
    Code Quality & Compile Verification       :planned,  des4, 2026-05-25, 2026-05-25
```

---

## 📋 Task Checklist

### ✅ Phase 1: Core OS & VFS Alignment (100% COMPLETE)
- [x] Overhaul [README.md](file:///Users/greg/Github/total-recall/README.md)
  - [x] Purge local Ollama local-model configurations and CX42 model tables
  - [x] Detail setup wizard `npx total-recall init` and selectable deployment locations (quick tunnel, named tunnel, local, custom domain)
  - [x] Document Dual-Layer Brain System (Global vs Project brain layers)
  - [x] Update folder layout to map data directories under the `.agent/skills/total-recall/` meta-skill folder
  - [x] Add backup push-git and restore commands, and service uninstaller boundaries
- [x] Overhaul [ARCHITECTURE.md](file:///Users/greg/Github/total-recall/docs/ARCHITECTURE.md)
  - [x] Purge Gemma 4 and local Ollama inference references
  - [x] Document Unified Headless CLI Dispatch system (`dispatch.mjs`), prioritized agent registry (`agents.yml`), and dynamic model selectors
  - [x] Correct VFS directory tree structure to place SSSS vault, cache, and config under the meta-skill `skills/total-recall/` folder
  - [x] Document vault caching (`vault-cache.mjs`), single-process write invalidations, cost-limiting supervisors (`budget.yml`), POSIX sandbox isolation (namespaces, whitelist), and watchdog processes
  - [x] Detail dynamic model resolution and auto-healing dimension mismatch re-embedding

### ✅ Phase 2: Command & API Guides (100% COMPLETE)
- [x] Overhaul [cli-reference.md](file:///Users/greg/Github/total-recall/docs/reference/cli-reference.md)
  - [x] Align `deploy` and `setup` to reflect remote API keys provisioning, launchd/systemd platform autostart, Caddy reverse-proxying, and Cloudflare tunnels
  - [x] Document commands: `init`, `connect`, `remember`, `recall`, `research`, `backup`, `restore`, `sync`, `status`, `daemon`, `relay`, `config`, `skill`, `uninstall` with `--global`/`--project` flag support
  - [x] Update environment variables table and `secrets.enc` GPG encryption description
- [x] Overhaul [api-reference.md](file:///Users/greg/Github/total-recall/docs/reference/api-reference.md)
  - [x] Remove references to Ollama and local LLMs
  - [x] Add details for the dual-layer brain endpoints (`GET /api/brains` and `GET /api/brains/:id/nodes`)
  - [x] Add details for the background research queue endpoints (`GET /api/research`, `POST /api/research`, `DELETE /api/research/:id`)
  - [x] Document local session relay ingestion and content-hash SHA-256 deduplication

### ✅ Phase 3: VFS Specification & Diagnostic Skills (100% COMPLETE)
- [x] Overhaul [SSSS.md](file:///Users/greg/Github/total-recall/docs/SSSS.md)
  - [x] Update VFS layout map and pathways to point inside `.agent/skills/total-recall/`
  - [x] Incorporate SSSS v2 memory Zod schema fields (schema_version 2, confidence, importance, modality, decay trackers, sentiment polarity, and ontology SPO checks)
  - [x] Document research queue task markdown formats
- [x] Overhaul [.agent/skills/repo-expert/SKILL.md](file:///Users/greg/Github/total-recall/.agent/skills/repo-expert/SKILL.md)
  - [x] Purge local Gemma 4 and Ollama VM details and VM quantizations
  - [x] Update system topology diagram to reflect remote dispatches and headless CLI agent dispatches
  - [x] Align directory map to `.agent/skills/total-recall/`
  - [x] Detail dynamic model resolution and embedding selectors (`resolveGenerativeModel`, `resolveEmbeddingModel`)

### ✅ Phase 4: Quality Verification & Sync (100% COMPLETE)
- [x] Run typescript full checks (`node .agent/skills/code-quality/scripts/start-here-ts.mjs`) returning `0 TS errors`
- [x] Run lint checks (`node .agent/skills/code-quality/scripts/start-here-lint.mjs`) returning `0 lint problems`
- [x] Run pre-push quality gate (`node scripts/code-quality-gate.mjs`)
- [x] Rebuild rules and compile shims via `npx total-recall compile` (all shims update correctly)
