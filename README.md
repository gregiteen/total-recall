# Total Recall 3.0 — SSSS Sovereign AI OS

> **A database-free, SSSS-compliant Sovereign AI Operating System.**

Total Recall 3.0 is the open-source canonical home of **SSSS (Structured Semantic Syntax System)** and the reference implementation of a sovereign AI brain. It proves that memory, skills, workflows, model routing, scheduler tasks, and learning loops can live as portable Markdown files with semantic frontmatter instead of opaque hosted database state.

UltraChat is the hosted product layer and commercial experience. Total Recall is the spec, local brain, CLI, validator, Dream Cycle, and conformance suite that makes the SSSS substrate real.

## Repository Role

```text
total-recall
-> canonical SSSS spec
-> reference kernel and validator
-> local sovereign brain
-> Dream Cycle optimizer
-> conformance tests
-> CLI and deploy tooling

ultrachat-ai-powered
-> hosted product UX
-> workspace collaboration
-> model/runtime management UI
-> marketplace, billing, projections
-> launch and distribution
```

## 🚀 The Sovereign Vision

You shouldn't need a cloud provider to remember your life. You shouldn't need a vector database to recall context. 

Total Recall 3.0 implements a **Zero-Parser Kernel** that reads, writes, and executes raw Markdown. Every memory, rule, system prompt, workflow, model runtime record, scheduler task, and proposal is an SSSS-compliant file. The system is hardware-agnostic, deployable to a cloud VM or local machine, and managed by a deterministic kernel plus a local AI optimizer.

The strategic thesis is simple:

```text
Databases were built for apps.
SSSS is built for sovereign AI.
```

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
- **`npx total-recall deploy`**: A one-click provisioning pipeline that scaffolds the VFS, pulls required Ollama models, and installs the Cloud Agent trigger via cron.
- **Automated Security**: Caddy reverse proxy for auto-TLS, Argon2id + AES-256-GCM encryption for secrets, and Bearer PAT authentication for API access.
- **Cloud Agent Auto-Tasking**: The autonomous agent wakes up every 5 minutes to process tasks, research your priorities, and push syncs. It messages you proactively via Telegram when it finishes something important.

### 4. Advanced Extensibility
- **Omnichannel Dashboard**: A sleek, dark-mode unified dashboard for managing your memory vault, tasks, and files.
- **Proactive Telegram Integration**: Provide your Telegram Bot token during the onboarding interview, and Total Recall will message you on your phone with updates, research, and questions.
- **Custom Weights (QLoRA)**: Built-in dataset compiler (`npx total-recall finetune`) to scrape your SSSS vault and generate instruction-tuning sets.

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
4. Queue an `onboarding-interview.md` task so the agent asks about your goals on your first chat

> Your existing IDE instructions are **never overwritten**. Total Recall only manages its own clearly-marked section.

---

### Option B — Full Sovereign OS Deployment (Cloud VM / Dedicated Machine)

To deploy the full autonomous AI stack on a fresh Linux/Mac environment:

```bash
# Provision models, VFS, and install the Agent Cron Trigger
npx total-recall deploy
```

### 2. Access the Dashboard & Onboard
Navigate to `https://localhost` (or your server's IP). 
When you start your first chat, the agent will enter **Interview Mode** to learn about your priorities, projects, and configure your Telegram notification settings.

### 3. CLI Command Reference

Total Recall is fully manageable via the CLI, ensuring 100% parity with the web dashboard.

| Command | Description |
|---------|-------------|
| `npx total-recall deploy` | Provision target machine (VFS, Ollama, Caddy, Cron) |
| `npx total-recall dream`  | Manually trigger a dream cycle (Light → REM → Deep) |
| `npx total-recall lint`   | Validate all vault nodes against the current SSSS schema |
| `npx total-recall daemon` | Manage the background daemon (start/stop/status) |
| `npx total-recall restore`| Restore from an encrypted backup |
| `npx total-recall finetune`| Generate a QLoRA JSONL dataset from the SSSS vault |
| `npx total-recall friction`| Analyze watchdog logs for workflow bottlenecks |

*(Note: Legacy commands like `compile`, `backup`, `sync`, and `reindex` have been removed. The Cloud Agent now handles these autonomously via SSSS task nodes in the scheduler queue.)*

---

## 🏗 Architecture

Total Recall 3.0 is comprised of three core layers:

1. **The Core Runtime (`src/core/`)**: The database-free SSSS memory engine, sandbox execution, and background evolution tools.
2. **The Server Layer (`src/server/`)**: An Express host that binds the OpenAI-compatible `/v1/chat/completions` proxy and the React Dashboard REST APIs.
3. **The Deploy Pipeline (`src/cli/`)**: The lifecycle management tooling used to provision, backup, and upgrade the host machine.

---

## 🛡 Security Mandate

The Sovereign OS is designed under a **Zero-Trust** execution policy.
- All code generated by the agent is executed within a hardened `src/core/sandbox.mjs` environment.
- Strict token-exfiltration monitors prevent accidental leakage of sensitive `secrets.enc` keys.
- **Always-On Autonomy**: Total Recall operates 100% autonomously via cron, with structured JSONL logging providing a fully verifiable audit trail of its idle-time research and tasks.

---

## 📚 Documentation

For specific guides on modifying or interacting with Total Recall, refer to the Diátaxis-compliant documentation folder:
- **`/docs/developer/`**: For architectural design decisions, PRDs, and core mechanics.
- **`/docs/projects/`**: For historical tracking of development phases.
- **`/docs/projects/in-progress/ssss-sovereign-ai-os/`**: The single active master roadmap.

---
*Built for the future. Sovereign, Unrestricted, Database-Free.*
