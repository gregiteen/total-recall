# Total Recall — Gemini CLI Setup Guide

> **Time:** ~3 minutes | **Watcher:** `gemini-cli` | **Surface:** `GEMINI.md`

## Prerequisites
- Node.js 18+
- Gemini CLI installed
- Total Recall installed globally (`npm install -g total-recall`)

> For the Antigravity (Gemini) IDE, see [antigravity.md](antigravity.md) —
> this guide covers the standalone Gemini CLI.

## Setup

### 1. Install into your project
```bash
cd ~/my-project
npx total-recall init
```

### 2. Connect Gemini

```bash
npx total-recall connect gemini
```

Gemini reads `GEMINI.md` in the repo root. The connect command creates a
symlink from `GEMINI.md` to the compiled `INSTRUCTIONS.md` so the behavioral
surface stays in sync. Run `npx total-recall init` or `npx total-recall
compile` first if `INSTRUCTIONS.md` does not yet exist.

### 3. Ingest Gemini CLI sessions
```bash
npx total-recall ingest --sources gemini-cli --watch
```

The watcher reads JSON conversation logs from `~/.gemini/tmp/`.

### 4. Run the background daemon
```bash
npx total-recall daemon start
```

## Agent Pipeline
For Gemini, the default pipeline uses:
- **Archivist**: Gemini Flash (fast, cheap extraction)
- **Synthesizer**: Claude
- **Fact-Checker**: Codex

Override via config to use Gemini for all three roles:
```javascript
export default {
  agents: {
    default: 'gemini',
  },
};
```

## Re-syncing
Run `npx total-recall connect gemini --force` or `npx total-recall sync` after
a `/switch` session handoff or whenever you want to force-refresh the
behavioral surface.
