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
total-recall install
```

### 2. Configure the watcher
Antigravity stores conversations in `~/.gemini/antigravity/brain/<conversation-id>/.system_generated/logs/overview.txt`. Total Recall reads this automatically — no watcher configuration needed.

In your `totalrecall.config.mjs`:
```javascript
export default {
  watchers: ['antigravity'],
};
```

### 3. Configure the system prompt
Antigravity reads `AGENTS.md` which should symlink to `INSTRUCTIONS.md`:
```bash
ln -sf INSTRUCTIONS.md AGENTS.md
```

Total Recall injects the behavioral surface directly into `INSTRUCTIONS.md` via section replacement.

### 4. Sync prompts
```bash
total-recall sync-prompts
```

### 5. Start the co-processor
```bash
tr-coprocessor start
```

## How It Works
- The co-processor daemon watches `overview.txt` for new conversation activity
- On each check cycle (15s default), it analyzes the latest messages for steering directives, sentiment shifts, and relevant memories
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
