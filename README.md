# Total Recall — SSSS Sovereign AI OS

> **A database-free, filesystem-native AI memory layer.** Works in any IDE. Self-hosts on any VM. Costs nothing to store.

Total Recall is the open-source reference implementation of **SSSS (Structured Semantic Syntax System)** — a spec for storing AI memory, skills, and workflows as plain Markdown files instead of opaque hosted databases.

```
your AI brain = ~/.agent/memory-vault/*.md
```

No vector DB. No cloud lock-in. Your thoughts, your machine.

---

## Choose Your Setup

### 🖥 IDE Memory Only (2 minutes)

Add persistent memory to Claude Code, Cursor, Codex, Windsurf, or any IDE agent — in your existing project:

```bash
cd ~/my-project
npx total-recall init         # scaffold ~/.agent/ and INSTRUCTIONS.md
npx total-recall connect claude-code   # symlink CLAUDE.md → INSTRUCTIONS.md
```

Supported IDEs:

| Command | What it does |
|---------|-------------|
| `npx total-recall connect claude-code` | Symlinks `CLAUDE.md` → compiled memory |
| `npx total-recall connect codex` | Symlinks `AGENTS.md` → compiled memory |
| `npx total-recall connect antigravity` | Symlinks `AGENTS.md` → compiled memory |
| `npx total-recall connect gemini` | Symlinks `GEMINI.md` → compiled memory |
| `npx total-recall connect cursor` | Writes `.cursor/rules/total-recall.mdc` |
| `npx total-recall connect windsurf` | Writes `.windsurf/rules/total-recall.md` |
| `npx total-recall connect aider` | Writes `.aider.rules.md` |

> Your existing IDE config is **never overwritten**. Total Recall only manages its own clearly-marked `<!-- BEGIN INJECTED MEMORY -->` section.

---

### 🧠 Full Brain + Local Model (30 minutes)

Deploy the full autonomous stack — OpenAI-compatible API, React dashboard, MCP gateway, Dream Cycle daemon — on a cloud VM or your own machine.

**What you need:**
- A Linux server (see [Cloud Provider Guide](docs/reference/cloud-providers.md) for pricing)
- SSH access
- A domain name (optional, for HTTPS)

**Recommended default:** [Hetzner CX42](https://www.hetzner.com/cloud) — €18/mo, 16 GB RAM, runs `gemma4:26b` (the default model)

```bash
# On your local machine — set up the wizard:
npx total-recall setup

# The wizard asks:
#   1. Where are you deploying? (Hetzner / DO / RunPod / Vast.ai / other)
#   2. Which IDEs do you use?
#   3. Which chat apps? (UltraChat / Claude / other)
#   4. Your API key (masked input, never logged)
# Then provisions the server, installs Ollama + gemma4:26b, and connects your IDEs.
```

Or manually on the server:

```bash
# On the server (Ubuntu 22.04+):
curl -fsSL https://ollama.com/install.sh | sh
ollama pull gemma4:26b          # ~10 GB download, ~16 GB RAM needed
npx total-recall deploy         # scaffold VFS, Caddy, cron trigger
```

Then back on your local machine:

```bash
npx total-recall connect claude-code --brain https://your-server.com --token YOUR_PAT
```

---

### 📔 Obsidian Integration

See your entire memory vault in Obsidian — graph view, backlinks, Dataview queries, all native:

```bash
npx total-recall connect obsidian
# Auto-detects your vault on macOS; pass --vault ~/path/to/vault on Linux
```

This symlinks `~/.agent/memory-vault/` into your vault as a `Total Recall/` folder and installs four Dataview query dashboards (active nodes, skills, conflicts, daily notes).

---

### 💬 UltraChat Integration

UltraChat connects to your brain via the OpenAI-compatible API. No file projection needed:

```bash
npx total-recall connect ultrachat --brain https://your-server.com --token YOUR_PAT
# Prints: baseURL, model name, auth header
```

---

## Model Guide

Total Recall uses [Ollama](https://ollama.com) for local inference. Default model: **`gemma4:26b`**

| Model | RAM | Use case |
|-------|-----|----------|
| `gemma4:e4b` | ~6 GB | Edge / laptop (fastest) |
| `gemma4:26b` ⭐ | ~16 GB | Default — MoE model, only ~4B active params |
| `gemma4:31b` | ~32 GB | Max quality (dense model) |

> **`gemma4:26b` is Mixture-of-Experts** — 26B total params but only ~4B are active at inference time. A 16 GB server runs it comfortably.

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `npx total-recall init` | Initialize `~/.agent/` vault + `INSTRUCTIONS.md` |
| `npx total-recall setup` | Interactive wizard: provider → API key → provision → connect IDEs |
| `npx total-recall connect <client>` | Wire an IDE or chat app to your brain |
| `npx total-recall deploy` | Provision server: Ollama + model + Caddy + cron |
| `npx total-recall compile` | Rebuild `INSTRUCTIONS.md` from vault nodes |
| `npx total-recall dream` | Manually trigger a Dream Cycle (GC + pattern extraction) |
| `npx total-recall lint` | Validate all vault nodes against the SSSS schema |
| `npx total-recall backup` | Encrypt and snapshot the vault |
| `npx total-recall sync` | Pull compiled instructions from a remote brain |
| `npx total-recall status` | Show brain health, connected clients, last dream |
| `npx total-recall generate-pat` | Create a Bearer token for API/IDE auth |
| `npx total-recall daemon` | Manage the background daemon (start/stop/status) |
| `npx total-recall friction` | Analyze watchdog logs for bottlenecks |

---

## Architecture

```
~/.agent/
  memory-vault/       ← SSSS nodes (Markdown + YAML frontmatter)
    skills/           ← reusable behavioral patterns
    patterns/         ← learned habits and preferences
    concepts/         ← domain knowledge
    daily/            ← Dream Cycle daily notes (written automatically)
    queries/          ← Obsidian Dataview dashboards
    graph.canvas      ← Obsidian Canvas (generated on compile)
  config/
    runtime.yml       ← model config (ollama / llama.cpp)
    brain.json        ← remote brain URL + PAT
    clients.json      ← connected IDE registry
    secrets.enc       ← AES-256-GCM encrypted provider keys

src/
  core/
    surface.mjs       ← SSSS compiler: vault → INSTRUCTIONS.md
    dream.mjs         ← Dream Cycle daemon
    watchdog.mjs      ← friction monitor
  server/
    index.mjs         ← Express: OpenAI-compat API + MCP gateway + React SPA
  cli/
    index.mjs         ← CLI entry point
    connect.mjs       ← IDE connector
    deploy.mjs        ← server provisioner
    setup.mjs         ← interactive wizard
```

**Runtime flow:**
1. `compile` reads vault → resolves `[[wikilinks]]` → writes `INSTRUCTIONS.md`
2. Every chat request injects `INSTRUCTIONS.md` as the system prompt
3. After each conversation the Dream Cycle GCs low-confidence nodes and extracts patterns
4. Daily notes are written automatically to `memory-vault/daily/YYYY-MM-DD.md`

---

## 📚 Documentation

- **[Cloud Provider Guide](docs/reference/cloud-providers.md)** — pricing, ease-of-use, and recommendations for Hetzner, DigitalOcean, RunPod, Vast.ai, AWS, and more
- **[SSSS Spec](docs/SSSS.md)** — the full Structured Semantic Syntax System specification
- **[Architecture](docs/ARCHITECTURE.md)** — deep dive into the runtime layers
- **[How-To Guides](docs/how-to/)** — deploy to cloud, set up Obsidian, integrate UltraChat
- **[CLI Reference](docs/reference/cli-reference.md)** — full flag documentation

---

## Security

- Provider API keys: AES-256-GCM encrypted in `~/.agent/config/secrets.enc` — masked input during setup, never logged
- Bearer PAT authentication for all API and MCP endpoints
- Argon2id for password hashing
- All agent-generated code runs in a hardened `sandbox.mjs` environment

---

*Sovereign. Database-free. Yours.*
