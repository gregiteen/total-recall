# Total Recall — Antigravity (Gemini) Setup Guide

> **Time:** ~3 minutes | **Watcher:** Built-in | **Surface:** `INSTRUCTIONS.md`

## Prerequisites
- Node.js 18+
- Gemini CLI installed (`npm install -g @anthropic-ai/gemini-cli`)
- Total Recall installed globally (`npm install -g total-recall`)

## Setup

### 1. Install into your project
```bash
cd ~/my-project
npx total-recall init
```

### 2. Connect Antigravity

```bash
npx total-recall connect antigravity
```

Antigravity reads `AGENTS.md`; the connect command creates the projection.

### 3. Ingest Antigravity sessions
```bash
npx total-recall ingest --sources antigravity --watch
```

### 4. Run the background daemon
```bash
npx total-recall daemon start
```

## How It Works
- The ingest watcher reads `overview.txt` for new conversation activity
- The daemon analyzes sessions for steering directives, sentiment shifts, and relevant memories
- Behavioral surface is auto-compiled into the `## DISTILLED MEMORY (SUBJECT STATES)` section of `INSTRUCTIONS.md`
- Active context (real-time reminders) is written to `~/.total-recall/active-context.md`

## Agent Pipeline
The `/switch` protocol dispatches three agents. For Antigravity, the default configuration uses:
- **Archivist**: Gemini Flash
- **Synthesizer**: Claude
- **Fact-Checker**: Codex

Override via config:
```javascript
export default {
  agents: {
    default: 'gemini', // Use Gemini for all three roles
  },
};
```
