# Total Recall — SSSS Sovereign AI OS

[![Version](https://img.shields.io/badge/version-3.0.0-indigo.svg)](package.json)
[![License](https://img.shields.io/badge/license-MIT-emerald.svg)](LICENSE)
[![Continuous Integration](https://img.shields.io/badge/CI-passing-teal.svg)](.github/workflows/test.yml)

> **A database-free, filesystem-native AI memory layer.** Works in any IDE. Self-hosts on any VM. Costs nothing to store.

Total Recall is the open-source reference implementation of the **SSSS (Structured Semantic Syntax System)** — a specification for storing AI memory, skills, and workflows as plain Markdown files instead of opaque, hosted databases.

```text
your AI brain = ~/.agent/skills/total-recall/memory-vault/*.md
```

No database overhead. No vendor lock-in. Your thoughts, on your machine.

---

## 🚀 Choose Your Setup

### 🖥️ 1. IDE Memory Only (2 minutes)

Add persistent, highly contextual memory to **Claude Code**, **Cursor**, **Codex CLI**, or any IDE agent in your active workspace:

```bash
cd ~/my-project
npx total-recall init                   # provision global brain and local project VFS shims
npx total-recall connect claude-code     # symlink CLAUDE.md → INSTRUCTIONS.md
```

Supported IDEs and surfaces:

| Client Command | Connection Mode | Targeted Projection Target |
| :--- | :--- | :--- |
| `npx total-recall connect claude-code` | Symlink | Symlinks `CLAUDE.md` to the compiled instruction surface |
| `npx total-recall connect codex` | Symlink | Symlinks `AGENTS.md` to the compiled instruction surface |
| `npx total-recall connect antigravity` | Symlink | Symlinks `AGENTS.md` to the compiled instruction surface |
| `npx total-recall connect gemini` | Symlink | Symlinks `GEMINI.md` to the compiled instruction surface |
| `npx total-recall connect cursor` | File Projection | Writes/updates `.cursor/rules/total-recall.mdc` with frontmatter rules |
| `npx total-recall connect aider` | File Projection | Writes/updates `.aider.rules.md` file rules |

> [!NOTE]
> **Non-Destructive Integration:**
> Your existing custom rules are **never overwritten**. Total Recall operates exclusively inside the clearly-marked comment bounds:  
> `<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->`  
> `...`  
> `<!-- END INJECTED MEMORY -->`

---

### 🧠 2. Full Sovereign Brain VM (10 minutes)

Deploy the full autonomous stack — a secure OpenAI-compatible REST server, dynamic React dashboard, continuous Dream Cycle daemon, and local session relays — on your own VM.

**Prerequisites:**
- A standard Linux or macOS server/workstation.
- Node.js ≥ 20.
- A primary API Key (e.g. `GOOGLE_API_KEY` for high-speed Google `gemini-embedding-2` vectors, featuring OpenAI fallback).

```bash
# Start the interactive configuration wizard:
npx total-recall init
```

The interactive wizard provisions the configuration, registers authorized Personal Access Tokens (PATs), configures secure Caddy reverse-proxying, and prompts you to choose your **Selectable UI Deployment Location**:

| Mode | Target URL | Primary Target |
| :--- | :--- | :--- |
| **Local Bind** | `http://127.0.0.1:3000` | Local operations. Binds strictly to your loopback interface. |
| **Quick Tunnel** | `https://*.trycloudflare.com` | Spawns a background Cloudflare tunnel for zero-configuration public URL access. |
| **Named Tunnel** | `https://your-tunnel.domain.com` | Hooks up securely to a pre-registered Cloudflare tunnel daemon. |
| **Custom Domain** | `https://your-domain.com` | Hooks up to your public DNS, reverse-proxied and secured by Caddy TLS. |

To start the server daemon, run:
```bash
npm start
```
*Vite automatically installs and builds the beautiful Glassmorphic React SPA on first boot, serving the dashboard dynamically.*

---

### 📔 3. Obsidian Integration

Visualize your entire memory vault, rules network, and daily logs directly inside Obsidian with native backlinks and graphs:

```bash
npx total-recall connect obsidian
```
*Auto-detects your vault path on macOS (or pass `--vault ~/path/to/vault` on Linux/other), symlinking your memory vault and installing interactive Dataview dashboard trackers.*

---

### 💬 4. UltraChat Integration

UltraChat integrates securely with your brain via our OpenAI-compatible chat API, injecting active memory instructions into system prompts on the fly:

```bash
npx total-recall connect ultrachat --brain https://your-server.com --token YOUR_PAT
```
*Generates the OpenAI-compatible configuration parameters (baseURL, model, token auth header).*

---

## 🧠 Dual-Layer Brain Architecture

Total Recall partitions your sovereign brain memory into two virtual layers:

```
                      ┌────────────────────────┐
                      │      GLOBAL LAYER      │
                      │  ~/.agent/skills/tr/   │
                      └───────────┬────────────┘
                                  │
                                  ▼ Overridden by
                      ┌────────────────────────┐
                      │     PROJECT LAYER      │
                      │  <repo>/.agent/skills/ │
                      └────────────────────────┘
```

1. **Global Layer** (`~/.agent/skills/total-recall/`): Contains global user preferences, master API keys, global logs, and the baseline identity context (`SOUL.md`, `USER.md`).
2. **Project Layer** (`<repo>/.agent/skills/total-recall/`): Contains local repository facts, project-specific habits, and specialized research agendas.

*When compiling rules or searching, project-level nodes take precedence and override global nodes on slug collisions. CLI operations like `remember`, `recall`, `research`, `backup`, and `restore` accept `--global` and `--project` flags to steer memories to the right layer.*

---

## ⚡ CLI Command Reference

| Command | Description |
| :--- | :--- |
| `npx total-recall init` | Initialize the global or local project VFS memory schemas. |
| `npx total-recall connect <client>` | Wire a local IDE, Obsidian vault, or UltraChat client to your brain. |
| `npx total-recall deploy` | Configure startup services, Caddy proxy servers, and platform auto-starts. |
| `npx total-recall compile` | Rebuild `INSTRUCTIONS.md` from merged global & project memory nodes. |
| `npx total-recall dream` | Trigger a manual Dream Cycle (GC, pattern extraction, decay consolidation). |
| `npx total-recall lint` | Validate vault nodes against the SSSS v2 frontmatter Zod schema. |
| `npx total-recall backup` | Create password-encrypted tarballs, push git backups, or sync Obsidian. |
| `npx total-recall restore <file>` | Restore your sovereign VFS from an encrypted tarball backup. |
| `npx total-recall status` | Show brain health summary, connected client registries, and daemon status. |
| `npx total-recall generate-pat` | Provision granular, label-based Personal Access Tokens (PATs) for auth. |
| `npx total-recall daemon` | Manage the background Dream Cycle daemon (start / stop / status). |
| `npx total-recall relay` | Manage background local session-sync relays watching IDE log files. |
| `npx total-recall config` | Read or update system settings, Allowed Origins, or USD budget caps dynamically. |
| `npx total-recall skill` | Search, install, security-audit, and remove packages from the skills.sh registry. |
| `npx total-recall uninstall` | Completely stop background services and wipe Total Recall from the system. |
| `npx total-recall friction` | Inspect watchdog telemetry logs to identify workflow latency bottlenecks. |

---

## 🔒 Security, Sandboxing, & Safety

- **硬 Hardened VM Sandbox:** All subagent script executions run inside an isolated vm sandbox environment (`sandbox.mjs`) featuring POSIX namespace restrictions, strict memory/CPU bounds, and a command execution whitelist. The sandbox is **disabled by default** (`security.yml.sandbox.enabled: false`) for maximum security.
- **Cost Watchdog & Limits:** Daily and weekly maximum cost thresholds (`config/budget.yml`) are enforced dynamically via a cost supervisor in `runtime.mjs` that instantly suspends subagent dispatches if budget caps are exceeded.
- **OWASP-aligned scrypt Security:** Master credentials and API keys are AES-256-GCM encrypted under `secrets.enc` with OWASP-aligned scrypt key derivation.
- **Privacy Redactions:** Memory nodes marked with `privacy: local_only` are automatically stripped before any external API dispatches or reasoning agent calls.

---

## 🧹 Service Uninstallation

To cleanly stop background daemons, unload platform agents (macOS launchd plists / Linux systemd services), remove symlink shims from all workspaces, and purge global configs:

```bash
npx total-recall uninstall
```
> [!IMPORTANT]
> **Safety First:**
> The uninstaller automatically detects version-controlled files, **preserving** local workspace `.agent/skills/` and `.agent/memory-vault/` directories inside active git project repositories to ensure you never lose custom rules and memories.

---

*Sovereign. Database-free. Yours.*
