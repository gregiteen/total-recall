# Total Recall — IDE & Agent Integration Guide

Total Recall serves as the core sovereign memory kernel. **Claude Code**, **Cursor**, **Codex CLI**, **Antigravity CLI**, **Aider**, and **VS Code Copilot** act as specialized interfaces on top of it. This guide details how to seamlessly wire each client to the brain.

---

## ⚡ The Integration Workflow

Every IDE and agent reads specific memory instruction files at startup. Total Recall automates this lifecycle:

1. **Watch**: The background relay daemon (`relay.mjs`) automatically watches and captures conversation session traces written by IDE editors.
2. **Ingest**: Pushes changes to the brain REST API, executing SHA-256 content-hash deduplication.
3. **Process**: dispatches background post-mortems headlessly to the prioritized **CLI Agents Registry** (e.g. Antigravity CLI, Claude Code) to extract rules, facts, and decisions.
4. **Compile**: The Dream Cycle compiles your vaults, writing a highly-optimized **5-line progressive disclosure pointer shim** into `INSTRUCTIONS.md`.
5. **Inject**: Symlinks or projects the compiled memory surface directly into each tool's expected rule file location, ensuring they absorb custom preferences.

---

## 📂 Coexistence & Compatibility Matrix

| Client Editor | Read Target File | Total Recall Action | Relay watched Folder |
| :--- | :--- | :--- | :--- |
| **Claude Code** | `CLAUDE.md` | Symlinks `CLAUDE.md` → `INSTRUCTIONS.md` | `~/.claude/projects/*.jsonl` |
| **Codex CLI** | `AGENTS.md` | Symlinks `AGENTS.md` → `INSTRUCTIONS.md` | `~/.codex/sessions/*.jsonl` |
| **Antigravity** | `AGENTS.md` | Symlinks `AGENTS.md` → `INSTRUCTIONS.md` | `~/.gemini/antigravity/brain/` |
| **Cursor** | `.cursor/rules/*.mdc` | Writes `.cursor/rules/total-recall.mdc` | `~/.cursor/projects/*.jsonl` |
| **Aider** | `.aider.rules.md` | Writes `.aider.rules.md` | Git repo logs |
| **VS Copilot** | `.github/copilot-instructions.md` | Writes `.github/copilot-instructions.md` | `workspaceStorage/*/chatSessions/` |

---

## 🛠️ Client Configuration Recipes

### 1. Claude Code
- **Connection Command**:
  ```bash
  npx total-recall connect claude-code
  ```
- **Coexistence Strategy**: Full compatibility. Claude Code's auto-memories are saved in `~/.claude/memories/` (completely separate). Keep auto-memories enabled; they provide raw context. Total Recall maps `CLAUDE.md` to `INSTRUCTIONS.md`, ensuring all SSSS absolute invariants govern every session.

---

### 2. Antigravity (Google DeepMind SDK)
- **Connection Command**:
  ```bash
  npx total-recall connect antigravity
  ```
- **Coexistence Strategy**: Highly complementary. Antigravity reads `AGENTS.md` in your project root, which we symlink to `INSTRUCTIONS.md`. Antigravity's local Knowledge Items (KIs) feed the session watcher logs, which the background daemon digests and promotes into SSSS invariants, updating the pointer shim automatically.

---

### 3. Cursor
- **Connection Command**:
  ```bash
  npx total-recall connect cursor
  ```
- **Coexistence Strategy**: Since Cursor has no built-in auto-memory, Total Recall bridges the gap. Connecting writes a modular rule `.cursor/rules/total-recall.mdc` pointing to the rule shim, and the relay daemon captures and digests all your Cursor session logs seamlessly.

---

### 4. VS Code Copilot
- **Connection Command**:
  ```bash
  npx total-recall connect vscode
  ```
- **Coexistence Strategy**: Integrates directly. Total Recall projects the compiled rules into `.github/copilot-instructions.md` at the repository root. Scoped local user storage logs are continuously tracked by the relay daemon.

---

### 5. OpenAI Codex
- **Connection Command**:
  ```bash
  npx total-recall connect codex
  ```
- **Coexistence Strategy**: Codex reads `AGENTS.md` in the project root, symlinked to our pointer rules. Keep Codex memories enabled; their session traces are picked up by the relay to enrich SSSS.

---

## 🔄 The Self-Improving Feedback Loop

```
IDE Conversation Sessions (any tool)
         │
         ▼ Local Relay Daemon (every 60s)
Inbound Ingestion API (/api/sessions/ingest)
         │
         ▼ SHA-256 Deduplication
Headless subagent dispatches (Post-Mortem engine)
         │
         ▼ In-box pending/ (Quarantine Checks)
Conflict Steering auto-resolution (Jaccard + SPO)
         │
         ▼ memory-vault/ Category Folder
Background Dream Cycle (Light → REM → Deep sleep)
         │
         ▼ compile & rebuild (surface.mjs)
INSTRUCTIONS.md Compiled Surface Shims Rebuilt
```

The system is completely **self-improving**: the scheduler automatically creates `skill-engineering` tasks to write new `SKILL.md` rules, `memory-maintenance` tasks to prune disused cards, and `proactive-research` tasks to crawl cited facts in the background.

---

## 🧹 Coexistence Verification

Total Recall never overrides your custom configs. All rules are injected inside the clearly demarcated comment blocks:
```markdown
<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
...
<!-- END INJECTED MEMORY -->
```
This guarantees that you can safely connect multiple IDEs, Obsidian vaults, and Relays concurrently without risking code loss or compilation lockouts.
