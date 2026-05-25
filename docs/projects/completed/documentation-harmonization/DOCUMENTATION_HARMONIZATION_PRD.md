# DOCUMENTATION_HARMONIZATION — Product Requirement Document (PRD)

## 1. Overview & Problem Statement
Since the migration from local Ollama/Gemma 4 configurations to the unified remote intelligence dispatch system and the consolidation of the VFS data folders inside the `.agent/skills/total-recall/` meta-skill namespace, the primary system documentation has experienced substantial drift. Several manuals (`README.md`, `docs/ARCHITECTURE.md`, `docs/SSSS.md`, `.agent/skills/repo-expert/SKILL.md`, and references) still refer to local model quantization, VM memory specs, and outdated sibling directory layouts under `.agent/`.

This PRD defines the requirements for a comprehensive alignment pass across all system documentation to ensure that the developer manuals perfectly match the implemented codebase and current VFS topologies.

## 2. Goals
- **100% Accuracy**: Align all system documentation with the real VFS file pathways and remote CLI agent dispatch topologies.
- **Drift Purge**: Eliminate all outdated references to local Gemma 4, Ollama VM setups, and deleted folders (`scaffold/`, `scratch/`, `windsurf`).
- **Comprehensive Coverage**: Ensure all major features shipped in the 8 completed epics (layered brain architecture, rate limiters, relay daemon, cost controllers, launchd templates, uninstaller, etc.) are fully documented in the manuals.
- **Professional Standard**: Write elegant, scannable Markdown with clean diagrams and tables that Wow the user.

## 3. Non-Goals
- We are NOT modifying any system code or behavioral logic in this project. This is strictly a documentation alignment pass.
- We are NOT adding new memory categories or SSSS Zod validation schema shifts.

## 4. Feature Requirements

### R1: Central VFS Pathway Harmonization
- All directories mapped in `README.md`, `docs/ARCHITECTURE.md`, `docs/SSSS.md`, and `.agent/skills/repo-expert/SKILL.md` must clearly map SSSS data files inside the `.agent/skills/total-recall/` folder (local or global).
- Obsolete paths (siblings of `.agent/` like `.agent/memory-vault/`) must be systematically updated.

### R2: Sovereign Remote Intelligence Dispatch Mechanics
- Document the deprecation of local Gemma 4 and Ollama.
- Detail the **Unified Headless CLI Dispatch system** (`dispatch.mjs`) and the prioritized agent registry (`agents.yml`) mapping Antigravity/Gemini CLI, Claude Code, and Codex CLI.
- Detail the **Dynamic Model Resolution** selector framework (`resolveGenerativeModel`, `resolveEmbeddingModel`) and the auto-healing dimension mismatch checks.

### R3: Layered Brain & Config Resolution
- Clearly document the Dual-Layer Brain System (Global Layer vs. Project Layer) in `README.md`, `docs/setup/INSTALLATION.md`, `docs/architecture/DUAL_LAYER_BRAIN.md`, and `docs/reference/cli-reference.md`.
- Explain resolution precedence (Project overrides Global on slug conflict), global configurations merging (`loadMergedNodes()`), and the interactive selector dropdown in the React Dashboard.
- Detail new command line arguments (`--global` / `--project`) for `remember`, `recall`, `research`, `backup`, `restore`, `connect`, and `rebuild`.

### R4: Local Session Relay & Ingestion
- Document the background relay daemon (`relay.mjs` / `total-recall relay`) that watches IDE session directories.
- Detail the `/api/sessions/ingest` ingestion API, SHA-256 content-hash deduplication, and VS Code chat session adapters.

### R5: Hardened Sandbox & Cost Safeguards
- Document sandbox-exec namespace isolation on macOS and unshare on Linux.
- Specify that the sandbox is **disabled by default** (`security.yml.sandbox.enabled: false`) for security, gated via the `sandbox:run` PAT scope.
- Explain rate-limit parameters and the usage watchdog in `runtime.mjs` that blocks execution when budget limits (`budget.yml` caps) are reached.

### R6: Auto-backups, Launchd & Service Uninstallation
- Document launchd plists (`templates/com.totalrecall.*.plist`) auto-starting server, daemon, backup, and duckdns services on macOS.
- Detail git diff-based encrypted remote backups (`npx total-recall backup --push-git`).
- Detail the service uninstaller (`npx total-recall uninstall`) that disables active startup files, stops background Relays/Daemons, cleans shims, but preserves Git-tracked `.agent/skills/` and `.agent/memory-vault/` folders in local workspaces.

## 5. Success Criteria
- Zero compile conflicts or schema mismatches in the memory vault.
- All modified documentation files compile cleanly and match the real code structure.
- `npx total-recall lint` and `/code-quality` checks return zero errors.
