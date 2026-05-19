# Total Recall — Codex Setup Guide

> **Time:** ~3 minutes | **Watcher:** `codex` | **Surface:** `AGENTS.md`

## Prerequisites
- Node.js 18+
- Codex CLI installed
- Total Recall installed globally (`npm install -g total-recall`)

## Setup

### 1. Install into your project
```bash
cd ~/my-project
npx total-recall init
```

### 2. Connect Codex

```bash
npx total-recall connect codex
```

Codex reads `AGENTS.md` in the repo root. The connect command creates a
symlink from `AGENTS.md` to the compiled `INSTRUCTIONS.md` so the behavioral
surface stays in sync. Run `npx total-recall init` or `npx total-recall
compile` first if `INSTRUCTIONS.md` does not yet exist.

### 3. Ingest Codex sessions
```bash
npx total-recall ingest --sources codex --watch
```

The watcher reads JSONL conversation logs from `~/.codex/sessions/`.

### 4. Run the background daemon
```bash
npx total-recall daemon start
```

## Agent Pipeline
For Codex, the default pipeline uses:
- **Archivist**: Gemini Flash (fast, cheap extraction)
- **Synthesizer**: Claude
- **Fact-Checker**: Codex (code verification specialist)

Override via config to use Codex for everything:
```javascript
export default {
  agents: {
    default: 'codex', // Use Codex for all pipeline roles
  },
};
```

## Re-syncing
Run `npx total-recall connect codex --force` or `npx total-recall sync` after
a `/switch` session handoff or whenever you want to force-refresh the
behavioral surface.
