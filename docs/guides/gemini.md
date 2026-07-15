# Total Recall — Antigravity & Gemini CLI Setup Guide

> **Time:** ~3 minutes | **Client/Watcher:** `antigravity` / `gemini-cli` | **Surface:** `GEMINI.md` / `AGENTS.md`

This guide explains how to connect the **Antigravity CLI** (`antigravity`) and the standard **Gemini CLI** to the Total Recall AI Brain.

---

## 🚀 Setup Steps

### 1. Initialize your project
```bash
cd ~/my-project
npx total-recall init
```
*Creates the global or local project VFS and seeds the initial instruction shims.*

### 2. Connect the Client
```bash
npx total-recall connect gemini
```
*Creating the platform symlink from `GEMINI.md` (and `AGENTS.md` for Antigravity) to the compiled rules surface `INSTRUCTIONS.md`.*

### 3. Start the Ingest Relay
```bash
npx total-recall relay start
```
*The background session watch relay automatically watches conversation directories (e.g. `~/.gemini/antigravity/brain/`) and pushes chat session logs via the API to be compiled and digested into SSSS memory nodes.*

---

## 🤖 Reasoning Agent Pipeline

By default, Total Recall prioritizes the **Antigravity CLI** (`antigravity`) as the highest-priority active CLI agent:

- **Primary Subagent**: `antigravity` is registered with `priority: 1` in `config/agents.yml` (mirroring the default setup in [src/core/runtime.mjs](file:///Users/greg/Github/total-recall/src/core/runtime.mjs)).
- **Fallback**: The standard `gemini` CLI agent serves as a high-performance fallback subagent (`priority: 2`).
- **Dynamic Models Selector**: Outbound reasoning calls utilize `resolveGenerativeModel` to map prompts dynamically to the active Google developer model API (e.g., `gemini-3.5-flash` or `gemini-3.1-pro-preview`) on the fly, preventing version deprecations.
