# Total Recall — Windsurf Setup Guide

> **Time:** ~3 minutes | **Watcher:** `windsurf` | **Surface:** `.windsurf/rules/total-recall.md`

## Prerequisites
- Node.js 18+
- Windsurf IDE installed
- Total Recall installed globally (`npm install -g total-recall`)

## Setup

### 1. Install into your project
```bash
cd ~/my-project
npx total-recall init
```

### 2. Connect Windsurf
```bash
npx total-recall connect windsurf
```

This creates `.windsurf/rules/total-recall.md` — a rule file that Windsurf loads automatically.

### 3. Verify
Check that Windsurf recognizes the rule:
1. Open Windsurf
2. The behavioral surface should appear in the AI's context

## Re-syncing
Run `npx total-recall connect windsurf --force` or `npx total-recall sync` to refresh the behavioral surface.
