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
npx total-recall init
```

### 2. Connect Cursor

```bash
npx total-recall connect cursor
```

This creates `.cursor/rules/total-recall.mdc` — a [Markdown Context (MDC)](https://docs.cursor.com/context/rules-for-ai) file with `alwaysApply: true` that Cursor loads on every conversation.

### 3. Ingest Cursor sessions when available

```bash
npx total-recall ingest --sources cursor --watch
```

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
Run `npx total-recall connect cursor --force` or `npx total-recall sync` after any of these events:
- A `/switch` session handoff completes
- You want to force-refresh the behavioral surface
