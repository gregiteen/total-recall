# Total Recall — Cursor Setup Guide

> **Time:** ~3 minutes | **Watcher:** `cursor` | **Surface:** `.cursor/rules/total-recall.mdc`

## Prerequisites
- Node.js 18+
- Cursor IDE installed
- Total Recall installed globally (`npm install -g total-recall`)

## Setup

### 1. Install into your project
```bash
cd ~/my-project
total-recall install
```

### 2. Configure the watcher
Cursor stores conversations in its internal database. Add to your `totalrecall.config.mjs`:

```javascript
export default {
  watchers: ['cursor'],
};
```

> **Note:** The cursor watcher requires Cursor's `.cursor/` directory to exist. The co-processor may have limited real-time visibility into Cursor conversations depending on Cursor's data format.

### 3. Sync prompts
```bash
total-recall sync-prompts
```

This creates `.cursor/rules/total-recall.mdc` — a [Markdown Context (MDC)](https://docs.cursor.com/context/rules-for-ai) file with `alwaysApply: true` that Cursor loads on every conversation.

### 4. Verify
Check that Cursor recognizes the rule file:
1. Open Cursor
2. Go to Settings → Rules for AI
3. You should see `total-recall` listed as an active rule

## MDC Format
The generated `.cursor/rules/total-recall.mdc` uses Cursor's MDC format:

```yaml
---
description: "Total Recall — Auto-generated behavioral memory surface."
globs:
alwaysApply: true
---
```

## Re-syncing
Run `total-recall sync-prompts` after any of these events:
- A `/switch` session handoff completes
- You manually steer behavior with `total-recall steer`
- You want to force-refresh the behavioral surface
