# Total Recall — Claude Code Setup Guide

> **Time:** ~3 minutes | **Watcher:** `claude-code` | **Surface:** `CLAUDE.md`

## Prerequisites
- Node.js 18+
- Claude Code CLI installed
- Total Recall installed globally (`npm install -g total-recall`)

## Setup

### 1. Install into your project
```bash
cd ~/my-project
npx total-recall init
```

### 2. Connect Claude Code

```bash
npx total-recall connect claude-code
```

Claude Code reads `CLAUDE.md` in the repo root. The connect command creates a
safe projection to `INSTRUCTIONS.md` when possible.

### 3. Ingest Claude Code sessions
```bash
npx total-recall ingest --sources claude-code --watch
```

### 4. Run the background daemon
```bash
npx total-recall daemon start
```

## Agent Pipeline
For Claude Code, the default pipeline uses:
- **Archivist**: Gemini Flash (fast, cheap extraction)
- **Synthesizer**: Claude (same engine as the main IDE)
- **Fact-Checker**: Codex (code verification specialist)

Override via config to use Claude for everything:
```javascript
export default {
  agents: {
    default: 'claude', // Use Claude for all pipeline roles
  },
};
```
