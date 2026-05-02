# Total Recall — Generic IDE Setup Guide

> **Time:** ~5 minutes | **Watcher:** `generic` | **Surface:** Any file

This guide covers setting up Total Recall with any IDE or CLI agent not specifically supported with a built-in watcher.

## Prerequisites
- Node.js 18+
- Total Recall installed globally (`npm install -g total-recall`)
- Your IDE's conversation log path known

## Setup

### 1. Install into your project
```bash
cd ~/my-project
total-recall install
```

### 2. Configure the generic watcher
You need to tell Total Recall where your IDE stores conversation data:

```javascript
// totalrecall.config.mjs
export default {
  watchers: [{
    type: 'generic',
    logPath: '/path/to/your/ide/conversation/logs',
    format: 'text',  // 'text', 'json', or 'jsonl'
  }],
};
```

### 3. Configure system prompt injection
Set the system prompt file your IDE reads:

```javascript
export default {
  systemPromptFile: 'YOUR_RULES_FILE.md',
};
```

Make sure your rules file has a `## DISTILLED MEMORY (SUBJECT STATES)` section header where Total Recall can inject the behavioral surface.

### 4. Start the co-processor
```bash
tr-coprocessor start
```

### 5. Sync prompts
```bash
total-recall sync-prompts
```

## Manual Surface Injection

If your IDE doesn't support automatic rule files, you can manually include the surface:

```bash
# Compile surface and print to stdout
total-recall compile-surface --preview

# Copy to clipboard (macOS)
total-recall compile-surface --preview | pbcopy
```

Then paste it into your IDE's system prompt configuration.

## Supported Log Formats

| Format | Description | Example IDEs |
|--------|-------------|--------------|
| `text` | Plain text conversation logs | Most CLI agents |
| `json` | JSON conversation objects | API-based agents |
| `jsonl` | JSON Lines (one JSON object per line) | Claude Code, some API agents |
