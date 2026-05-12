# Total Recall 3.0 — Sovereign OS

> **A database-free, SSSS-compliant Sovereign AI Operating System.**

Total Recall 3.0 is a complete reimagining of the cognitive memory system. We have completely stripped out SQLite and all third-party database dependencies. Total Recall is now a fully standalone, hardware-agnostic Sovereign OS that runs a local React dashboard, a standard Model Context Protocol (MCP) gateway, and an Express-powered OpenAPI proxy, all backed exclusively by **SSSS (Structured Semantic Syntax System)** Markdown memory.

## 🚀 The Sovereign Vision

You shouldn't need a cloud provider to remember your life. You shouldn't need a vector database to recall context. 

Total Recall 3.0 implements a **Zero-Parser Kernel** that reads, writes, and executes raw Markdown. Every memory, rule, system prompt, and configuration is an SSSS-compliant `.md` file. It's a system designed to be completely hardware-agnostic, easily deployable to an Oracle Cloud VM or a local Mac, and managed autonomously by the AI itself.

## ✨ Core Features

### 1. Database-Free SSSS Memory
- **100% Markdown Storage**: No SQLite. No Vector DBs. The memory vault is a file-system native, three-tiered graph (Hot Memory, Curated Skills, Permanent Vault).
- **Schema Evolution Engine**: The AI proposes, tests, and applies backwards-compatible updates to its own Zod validation schemas.
- **Dream Cycle Daemon**: A background coprocessor that handles garbage collection, pattern extraction, and confidence decay.

### 2. Omnichannel Dashboard
- **React SPA**: A sleek, dark-mode unified dashboard served directly by the Express host.
- **Unified Interface**: Chat, Voice (Kokoro-82M TTS), and Code Mode Sandbox execution all from the browser.
- **VFS Explorer & Task Scheduler**: Visually traverse the `~/.agent/files/` virtual file system and inspect the P0-P5 background task queue.

### 3. Production-Ready Deployment
- **`npx total-recall deploy`**: A one-click provisioning pipeline that scaffolds the VFS, pulls required Ollama models, and registers systemd services on any POSIX host.
- **Automated Security**: Caddy reverse proxy for auto-TLS, Argon2id + AES-256-GCM encryption for secrets, and Bearer PAT authentication for API access.
- **Watchdog Circuit Breakers**: Built-in exfiltration monitors, sandbox infinite-loop protection, and disk space guards ensure the system survives 24/7 autonomous operation without human supervision.

### 4. Advanced Extensibility
- **MCP Gateway**: Fully standard-compliant Model Context Protocol server over Streamable HTTP. Plug Total Recall into Claude Desktop, Cursor, or any MCP client.
- **Friction Detection**: Automatically analyzes JSONL logs to identify workflow bottlenecks and self-optimize.
- **Custom Weights (QLoRA)**: Built-in dataset compiler (`npx total-recall finetune`) to scrape your SSSS vault and generate instruction-tuning sets for custom `TotalRecall-Gemma-SSSS` weights.

---

## 🛠 Quick Start

### Option A — Adding to an Existing Project (Recommended)

If you already have a project with instructions set up for Cursor, Claude Code, Antigravity, or any other IDE agent, run this from your project root:

```bash
cd ~/my-project
npx total-recall init
```

This will:
1. Create a `.agent/memory-vault/` directory structure in your project
2. Seed the core SSSS schema skill so your AI knows how to write memory nodes
3. Inject a clearly-marked `<!-- BEGIN INJECTED MEMORY -->` block into your **existing** `GEMINI.md`, `.cursorrules`, `CLAUDE.md`, or `AGENTS.md` — without touching any of your existing instructions
4. If none of those files exist, it creates `INSTRUCTIONS.md` with IDE symlinks automatically

> Your existing IDE instructions are **never overwritten**. Total Recall only manages its own clearly-marked section.

After init, your AI can immediately start saving memories:
```bash
# Rebuild the memory surface after adding new vault nodes
npx total-recall compile
```

---

### Option B — Full Sovereign OS Deployment (Cloud VM / Dedicated Machine)

To deploy the full autonomous AI stack on a fresh Linux/Mac environment:

```bash
# Provision models, VFS, and system services
npx total-recall deploy

# Start the background daemon
npx total-recall daemon start
```

### 2. Access the Omnichannel Dashboard
Navigate to `https://localhost` (or your server's IP). 
Authenticate using your generated admin credentials to access the Chat, Code Sandbox, and VFS Explorer.

### 3. CLI Command Reference

Total Recall is fully manageable via the CLI, ensuring 100% parity with the web dashboard.

| Command | Description |
|---------|-------------|
| `npx total-recall deploy` | Provision target machine (VFS, Ollama, Caddy, systemd) |
| `npx total-recall compile`| Rebuild indexes and the active `INSTRUCTIONS.md` |
| `npx total-recall backup` | Create an AES-256 encrypted VFS tarball |
| `npx total-recall restore`| Restore from an encrypted backup |
| `npx total-recall export` | Export a portable, unencrypted VFS tarball |
| `npx total-recall import` | Import a VFS payload |
| `npx total-recall lint`   | Validate all vault nodes against the current SSSS schema |
| `npx total-recall finetune`| Generate a QLoRA JSONL dataset from the SSSS vault |
| `npx total-recall friction`| Analyze watchdog logs for workflow bottlenecks |

---

## 🏗 Architecture

Total Recall 3.0 is comprised of three core layers:

1. **The Core Runtime (`src/core/`)**: The database-free SSSS memory engine, sandbox execution, and background evolution tools.
2. **The Server Layer (`src/server/`)**: An Express host that binds the MCP gateway, the OpenAI-compatible `/v1/chat/completions` proxy, and the React Dashboard.
3. **The Deploy Pipeline (`src/cli/`)**: The lifecycle management tooling used to provision, backup, and upgrade the host machine.

---

## 🛡 Security Mandate

The Sovereign OS is designed under a **Zero-Trust** execution policy.
- All code generated by the agent is executed within a hardened `src/core/sandbox.mjs` environment.
- Strict token-exfiltration monitors prevent accidental leakage of sensitive `secrets.enc` keys.
- **YOLO Mode**: Total Recall can operate 100% autonomously, with structured JSONL logging providing a fully verifiable audit trail.

---

## 📚 Documentation

For specific guides on modifying or interacting with Total Recall, refer to the Diátaxis-compliant documentation folder:
- **`/docs/developer/`**: For architectural design decisions, PRDs, and core mechanics.
- **`/docs/projects/`**: For historical tracking of development phases.

---
*Built for the future. Sovereign, Unrestricted, Database-Free.*
