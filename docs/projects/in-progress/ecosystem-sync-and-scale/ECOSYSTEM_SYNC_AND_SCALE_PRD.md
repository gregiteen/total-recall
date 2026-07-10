# ECOSYSTEM SYNC AND SCALE: PRD

## 1. Goal & Vision
Total Recall must evolve from a fragmented, localized memory vault into a fully integrated ecosystem manager. 
It must autonomously manage repo-specific skills, embedded skills, automatic code examination via daemon Crons, GitHub synchronization, Obsidian synchronization, and strict OKF/tr-ssss compliance across all registered brains.

Crucially, **Brains must remain strictly isolated**. We are not merging them. The goal is to build a robust resolution pipeline so the daemon knows exactly which isolated scope (Global, Project, or Embedded) it is reading from or writing to at any given time.

## 2. Target Audience & Personas
- **The Sovereign Developer**: Wants a completely autonomous background system that observes their code, writes skills, and manages cross-repo context without manual CLI prompting.
- **The System Administrator**: Requires robust sync guarantees (GitHub/Obsidian) so that modifying memory via external tools does not corrupt the SSSS engine.

## 3. Core Features
### 3.1 Isolated Skill & Data Architecture
- **Global vs Project Data Resolution**: A strict, hierarchical pipeline for resolving `global` skills vs `project` skills in the VFS engine, maintaining their isolation.
- **Embedded Skills Pipeline**: Seamless reading/writing of in-repo memory (`.agent/skills/`) back into the central daemon brain.

### 3.2 Autonomous Code Crons
- **Background Scheduler**: A CRON engine embedded directly inside `task_runner.mjs`.
- **Code Examiner Worker**: Periodically scans registered workspaces, infers new technical stacks or patterns, and automatically updates `.agent/skills/` without manual prompts.
- **Secret/Instruction Watcher**: Periodically audits repos for missing instructions or corrupted secrets and fixes them.

### 3.3 Two-Way Synchronizations
- **GitHub Sync**: Push/pull SSSS memory bundles to/from remote GitHub repositories for backup and multi-agent collaboration.
- **Obsidian Sync**: A File Watcher on the `memory-vault/` directory that instantly translates SSSS JSON schemas into Obsidian Frontmatter (and vice-versa) on file save.

### 3.4 Strict tr-ssss & OKF Compliance
- Zero bypassing of `processOperation()`. All UI layers (Memory Page, Chat, Sandbox) must serialize mutations through the official SSSS primitive validation envelope.
- `ssss-conformance.bridge.spec.mjs` must pass 100% in CI.

## 4. Non-Goals
- Migrating away from a file-based VFS to a SQL database (strict adherence to markdown/JSON storage).
- Real-time multiplayer CRDTs (we are using standard git-based and file-based sync conflict resolution).

## 5. Success Metrics
1. **0 Unhandled Rejections**: The core daemon must run for 72 hours with active GitHub/Obsidian syncs without crashing.
2. **100% Audit Resolution**: All 25 aspects of the frontend/backend must have zero empty-state crashes or `process.cwd()` bugs.
3. **Automated Skill Generation**: The CRON examiner successfully creates a valid `SKILL.md` from a bare codebase without manual intervention.
